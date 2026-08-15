import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const generateReconnectionCode = () => Math.floor(100000 + Math.random() * 900000).toString();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ message: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const callbackData = await req.json();
    const stkCallback = callbackData?.Body?.stkCallback;
    if (!stkCallback?.CheckoutRequestID) return json({ message: "Invalid callback payload" }, 400);

    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("*, user_sessions(*)")
      .eq("mpesa_checkout_request_id", stkCallback.CheckoutRequestID)
      .single();

    if (fetchError || !payment) return json({ message: "Payment not found" }, 404);

    // Daraja can retry callbacks. Treat an already completed payment as idempotent.
    if (payment.status === "completed") return json({ message: "Callback already processed" });

    if (Number(stkCallback.ResultCode) !== 0) {
      await supabase
        .from("payments")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", payment.id);
      return json({ message: "Failed/cancelled payment recorded" });
    }

    const items = stkCallback.CallbackMetadata?.Item || [];
    const value = (name: string) => items.find((item: any) => item.Name === name)?.Value;
    const paidAmount = Number(value("Amount"));
    const receipt = value("MpesaReceiptNumber");

    if (!Number.isFinite(paidAmount) || paidAmount < Number(payment.amount)) {
      console.error("M-Pesa amount mismatch", { paymentId: payment.id, expected: payment.amount, received: paidAmount });
      await supabase.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", payment.id);
      return json({ message: "Payment amount mismatch" }, 400);
    }

    const reconnectionCode = generateReconnectionCode();
    const { error: paymentError } = await supabase
      .from("payments")
      .update({
        status: "completed",
        mpesa_receipt_number: receipt || null,
        reconnection_code: reconnectionCode,
        reconnection_code_used: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    if (paymentError) throw paymentError;

    if (payment.session_id) {
      await supabase
        .from("user_sessions")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", payment.session_id);

      const macAddress = payment.user_sessions?.mac_address;
      if (macAddress) {
        const { data: activation, error: activationError } = await supabase.functions.invoke("session-manager", {
          body: { action: "activate", sessionId: payment.session_id, macAddress },
        });
        if (activationError || activation?.networkProvisioned === false) {
          console.error("Network activation needs attention", activationError || activation);
        }
      }
    }

    return json({ message: "Callback processed successfully" });
  } catch (error) {
    console.error("Callback processing error", error);
    return json({ message: "Callback processing failed" }, 500);
  }
});
