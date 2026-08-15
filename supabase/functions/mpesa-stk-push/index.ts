import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normalizePhone = (value: string) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^07\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^7\d{8}$/.test(digits)) return `254${digits}`;
  if (/^2547\d{8}$/.test(digits)) return digits;
  return "";
};

const normalizeMac = (value: string) => {
  const mac = String(value || "").trim().replace(/-/g, ":").toUpperCase();
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) ? mac : "";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY") || "";
    const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET") || "";
    const businessShortCode = Deno.env.get("MPESA_BUSINESS_SHORT_CODE") || "";
    const passkey = Deno.env.get("MPESA_PASSKEY") || "";
    const mpesaBaseUrl = Deno.env.get("MPESA_BASE_URL") || "https://sandbox.safaricom.co.ke";

    if (!supabaseUrl || !serviceRoleKey || !consumerKey || !consumerSecret || !businessShortCode || !passkey) {
      console.error("Missing required M-Pesa/Supabase configuration");
      return json({ success: false, message: "Payment service is not configured" }, 503);
    }

    const { packageId, phoneNumber, macAddress } = await req.json();
    const phone = normalizePhone(phoneNumber);
    const mac = normalizeMac(macAddress);
    if (!packageId || !phone || !mac) return json({ success: false, message: "Invalid package, phone number or device" }, 400);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: accessPackage, error: packageError } = await supabase
      .from("access_packages")
      .select("id,name,price,duration_minutes,is_active")
      .eq("id", packageId)
      .eq("is_active", true)
      .single();

    if (packageError || !accessPackage) return json({ success: false, message: "This package is not available" }, 404);

    const expiresAt = new Date(Date.now() + Number(accessPackage.duration_minutes) * 60_000).toISOString();
    const { data: session, error: sessionError } = await supabase
      .from("user_sessions")
      .insert({ mac_address: mac, phone_number: phone, expires_at: expiresAt, status: "active" })
      .select()
      .single();
    if (sessionError || !session) throw sessionError || new Error("Could not create session");

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({ session_id: session.id, phone_number: phone, amount: accessPackage.price, status: "pending" })
      .select()
      .single();
    if (paymentError || !payment) {
      await supabase.from("user_sessions").delete().eq("id", session.id);
      throw paymentError || new Error("Could not create payment");
    }

    await supabase.from("user_sessions").update({ payment_id: payment.id }).eq("id", session.id);

    const tokenResponse = await fetch(`${mpesaBaseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}` },
    });
    if (!tokenResponse.ok) throw new Error("Could not authenticate with M-Pesa");
    const tokenData = await tokenResponse.json();

    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");

    const payload = {
      BusinessShortCode: businessShortCode,
      Password: btoa(`${businessShortCode}${passkey}${timestamp}`),
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(Number(accessPackage.price)),
      PartyA: phone,
      PartyB: businessShortCode,
      PhoneNumber: phone,
      CallBackURL: `${supabaseUrl}/functions/v1/mpesa-callback`,
      AccountReference: `WIFI-${payment.id.slice(0, 8)}`,
      TransactionDesc: `${accessPackage.name} WiFi access`,
    };

    const stkResponse = await fetch(`${mpesaBaseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const stkData = await stkResponse.json();

    if (!stkResponse.ok || stkData.ResponseCode !== "0") {
      await supabase.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", payment.id);
      return json({ success: false, message: stkData.errorMessage || stkData.ResponseDescription || "M-Pesa request failed" }, 400);
    }

    const { data: updatedPayment, error: updateError } = await supabase
      .from("payments")
      .update({ mpesa_checkout_request_id: stkData.CheckoutRequestID, updated_at: new Date().toISOString() })
      .eq("id", payment.id)
      .select()
      .single();
    if (updateError) throw updateError;

    return json({ success: true, payment: updatedPayment, checkoutRequestId: stkData.CheckoutRequestID });
  } catch (error) {
    console.error("STK push error", error);
    return json({ success: false, message: error instanceof Error ? error.message : "Internal payment error" }, 500);
  }
});
