import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normalizePhone = (value: unknown) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  return "";
};

const normalizeMac = (value: unknown) => {
  const mac = String(value || "").trim().replace(/-/g, ":").toUpperCase();
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) ? mac : "";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  let createdSessionId = "";
  let createdPaymentId = "";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY") || "";
    const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET") || "";
    const businessShortCode = Deno.env.get("MPESA_BUSINESS_SHORT_CODE") || "";
    const passkey = Deno.env.get("MPESA_PASSKEY") || "";
    const callbackSecret = Deno.env.get("MPESA_CALLBACK_SECRET") || "";
    const transactionType = Deno.env.get("MPESA_TRANSACTION_TYPE") || "CustomerPayBillOnline";
    const mpesaBaseUrl = (Deno.env.get("MPESA_BASE_URL") || "https://sandbox.safaricom.co.ke").replace(/\/$/, "");

    if (!supabaseUrl || !serviceRoleKey || !consumerKey || !consumerSecret || !businessShortCode || !passkey || !callbackSecret) {
      console.error("Missing required M-Pesa/Supabase configuration");
      return json({ success: false, message: "Payment service is not configured" }, 503);
    }

    if (!["CustomerPayBillOnline", "CustomerBuyGoodsOnline"].includes(transactionType)) {
      return json({ success: false, message: "M-Pesa transaction type is not configured correctly" }, 503);
    }

    const { packageId, phoneNumber, macAddress } = await req.json();
    const phone = normalizePhone(phoneNumber);
    const mac = normalizeMac(macAddress);
    if (!packageId || !phone || !mac) return json({ success: false, message: "Invalid package, phone number or device" }, 400);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const recentSince = new Date(Date.now() - 30_000).toISOString();
    const { data: recentAttempt } = await supabase
      .from("user_sessions")
      .select("id")
      .eq("mac_address", mac)
      .eq("phone_number", phone)
      .gte("created_at", recentSince)
      .limit(1)
      .maybeSingle();
    if (recentAttempt) return json({ success: false, message: "Please wait a few seconds before requesting another M-Pesa prompt" }, 429);

    const { data: accessPackage, error: packageError } = await supabase
      .from("access_packages")
      .select("id,name,price,duration_minutes,is_active")
      .eq("id", packageId)
      .eq("is_active", true)
      .single();

    const price = Number(accessPackage?.price);
    const durationMinutes = Number(accessPackage?.duration_minutes);
    if (packageError || !accessPackage || !Number.isInteger(price) || price <= 0 || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return json({ success: false, message: "This package is not available" }, 404);
    }

    const { data: session, error: sessionError } = await supabase
      .from("user_sessions")
      .insert({
        mac_address: mac,
        phone_number: phone,
        expires_at: null,
        status: "pending",
        network_status: "pending",
      })
      .select()
      .single();
    if (sessionError || !session) throw sessionError || new Error("Could not create session");
    createdSessionId = session.id;

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        session_id: session.id,
        package_id: accessPackage.id,
        phone_number: phone,
        amount: price,
        status: "pending",
      })
      .select()
      .single();
    if (paymentError || !payment) throw paymentError || new Error("Could not create payment");
    createdPaymentId = payment.id;

    await supabase.from("user_sessions").update({ payment_id: payment.id }).eq("id", session.id);

    const tokenResponse = await fetch(`${mpesaBaseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}` },
    });
    if (!tokenResponse.ok) throw new Error("Could not authenticate with M-Pesa");
    const tokenData = await tokenResponse.json();
    if (!tokenData?.access_token) throw new Error("M-Pesa did not return an access token");

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
      TransactionType: transactionType,
      Amount: price,
      PartyA: phone,
      PartyB: businessShortCode,
      PhoneNumber: phone,
      CallBackURL: `${supabaseUrl}/functions/v1/mpesa-callback?token=${encodeURIComponent(callbackSecret)}`,
      AccountReference: `WIFI-${payment.id.slice(0, 8)}`,
      TransactionDesc: `${accessPackage.name} WiFi access`,
    };

    const stkResponse = await fetch(`${mpesaBaseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const stkData = await stkResponse.json().catch(() => ({}));

    if (!stkResponse.ok || stkData.ResponseCode !== "0" || !stkData.CheckoutRequestID) {
      throw new Error(stkData.errorMessage || stkData.ResponseDescription || "M-Pesa request failed");
    }

    const { data: updatedPayment, error: updateError } = await supabase
      .from("payments")
      .update({ mpesa_checkout_request_id: stkData.CheckoutRequestID, updated_at: new Date().toISOString() })
      .eq("id", payment.id)
      .select()
      .single();
    if (updateError || !updatedPayment) throw updateError || new Error("Could not save M-Pesa request");

    // CheckoutRequestID stays server-side. The browser only needs the payment ID and status fields.
    return json({
      success: true,
      payment: {
        id: updatedPayment.id,
        amount: updatedPayment.amount,
        created_at: updatedPayment.created_at,
        mpesa_checkout_request_id: null,
        mpesa_receipt_number: null,
        package_id: updatedPayment.package_id,
        phone_number: updatedPayment.phone_number,
        reconnection_code: null,
        reconnection_code_used: false,
        session_id: updatedPayment.session_id,
        status: updatedPayment.status,
        updated_at: updatedPayment.updated_at,
      },
    });
  } catch (error) {
    console.error("STK push error", error);
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      if (supabaseUrl && serviceRoleKey) {
        const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
        if (createdPaymentId) await supabase.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", createdPaymentId);
        if (createdSessionId) await supabase.from("user_sessions").update({ status: "terminated", network_status: "disconnected", updated_at: new Date().toISOString() }).eq("id", createdSessionId);
      }
    } catch (cleanupError) {
      console.error("Payment cleanup failed", cleanupError);
    }
    return json({ success: false, message: error instanceof Error ? error.message : "Internal payment error" }, 500);
  }
});
