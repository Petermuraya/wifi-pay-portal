import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ message: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";
    if (!supabaseUrl || !serviceRoleKey || !internalSecret) return json({ message: "Callback service is not configured" }, 503);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const callbackData = await req.json();
    const stkCallback = callbackData?.Body?.stkCallback;
    if (!stkCallback?.CheckoutRequestID) return json({ message: "Invalid callback payload" }, 400);

    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("*")
      .eq("mpesa_checkout_request_id", stkCallback.CheckoutRequestID)
      .maybeSingle();
    if (fetchError || !payment) return json({ message: "Payment not found" }, 404);

    const activateSession = async () => {
      if (!payment.session_id) return;
      const { data: session } = await supabase.from("user_sessions").select("mac_address").eq("id", payment.session_id).maybeSingle();
      if (!session?.mac_address) return;
      const { data: activation, error: activationError } = await supabase.functions.invoke("session-manager", {
        body: { action: "activate", sessionId: payment.session_id, macAddress: session.mac_address, internalSecret },
      });
      if (activationError || activation?.networkProvisioned === false) {
        console.error("Network activation needs attention", activationError || activation);
      }
    };

    // Daraja may retry callbacks. Completed payments are safe to re-run only for network activation.
    if (payment.status === "completed") {
      await activateSession();
      return json({ message: "Callback already processed" });
    }

    if (Number(stkCallback.ResultCode) !== 0) {
      await supabase.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", payment.id);
      if (payment.session_id) {
        await supabase
          .from("user_sessions")
          .update({ status: "terminated", network_status: "disconnected", updated_at: new Date().toISOString() })
          .eq("id", payment.session_id);
      }
      return json({ message: "Failed or cancelled payment recorded" });
    }

    const items = stkCallback.CallbackMetadata?.Item || [];
    const value = (name: string) => items.find((item: any) => item.Name === name)?.Value;
    const paidAmount = Number(value("Amount"));
    const receipt = String(value("MpesaReceiptNumber") || "").trim();

    if (!Number.isFinite(paidAmount) || paidAmount < Number(payment.amount) || !receipt) {
      console.error("M-Pesa callback validation failed", { paymentId: payment.id, expected: payment.amount, received: paidAmount, receipt });
      await supabase.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", payment.id);
      if (payment.session_id) {
        await supabase
          .from("user_sessions")
          .update({ status: "terminated", network_status: "failed", updated_at: new Date().toISOString() })
          .eq("id", payment.session_id);
      }
      return json({ message: "Payment callback validation failed" }, 400);
    }

    let reconnectionCode = "";
    for (let attempt = 0; attempt < 12 && !reconnectionCode; attempt++) {
      const candidate = Math.floor(100000 + Math.random() * 900000).toString();
      const { data: existing } = await supabase.from("payments").select("id").eq("reconnection_code", candidate).limit(1).maybeSingle();
      if (!existing) reconnectionCode = candidate;
    }
    if (!reconnectionCode) throw new Error("Could not allocate a reconnection code");

    const { error: paymentError } = await supabase
      .from("payments")
      .update({
        status: "completed",
        mpesa_receipt_number: receipt,
        reconnection_code: reconnectionCode,
        reconnection_code_used: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    if (paymentError) throw paymentError;

    await activateSession();
    return json({ message: "Callback processed successfully" });
  } catch (error) {
    console.error("Callback processing error", error);
    return json({ message: "Callback processing failed" }, 500);
  }
});
