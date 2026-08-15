import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const generateVoucherCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } },
    );

    const body = await req.json();
    const { action } = body;

    if (action === "generate") {
      if (body.adminKey !== Deno.env.get("ADMIN_SECRET_KEY")) return json({ success: false, error: "Unauthorized" }, 401);
      const quantity = Math.min(Math.max(Number(body.quantity || 1), 1), 100);
      if (!body.packageId) return json({ success: false, error: "Package is required" }, 400);

      const vouchers = [];
      for (let i = 0; i < quantity; i++) {
        let voucher = null;
        for (let attempt = 0; attempt < 5 && !voucher; attempt++) {
          const { data, error } = await supabase
            .from("vouchers")
            .insert({ code: generateVoucherCode(), package_id: body.packageId, status: "unused", created_at: new Date().toISOString() })
            .select()
            .single();
          if (!error) voucher = data;
        }
        if (!voucher) throw new Error("Could not generate a unique voucher code");
        vouchers.push(voucher);
      }
      return json({ success: true, vouchers });
    }

    if (action === "redeem") {
      const voucherCode = String(body.voucherCode || "").trim().toUpperCase();
      const macAddress = String(body.macAddress || "").trim().replace(/-/g, ":").toUpperCase();
      if (!/^[A-Z0-9]{8}$/.test(voucherCode) || !/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(macAddress)) {
        return json({ success: false, error: "Invalid voucher or device" }, 400);
      }

      const { data: voucher, error: voucherError } = await supabase
        .from("vouchers")
        .select("*, access_packages(*)")
        .eq("code", voucherCode)
        .eq("status", "unused")
        .single();
      if (voucherError || !voucher?.access_packages) return json({ success: false, error: "Invalid or already used voucher code" }, 404);

      const { data: session, error: sessionError } = await supabase
        .from("user_sessions")
        .insert({
          mac_address: macAddress,
          phone_number: "voucher-user",
          expires_at: new Date(Date.now() + Number(voucher.access_packages.duration_minutes) * 60_000).toISOString(),
          status: "active",
        })
        .select()
        .single();
      if (sessionError || !session) throw sessionError || new Error("Could not create voucher session");

      const { data: claimedVoucher, error: claimError } = await supabase
        .from("vouchers")
        .update({ status: "used", used_at: new Date().toISOString(), session_id: session.id })
        .eq("id", voucher.id)
        .eq("status", "unused")
        .select()
        .single();

      if (claimError || !claimedVoucher) {
        await supabase.from("user_sessions").delete().eq("id", session.id);
        return json({ success: false, error: "Voucher was already redeemed" }, 409);
      }

      const { data: activation, error: activationError } = await supabase.functions.invoke("session-manager", {
        body: { action: "activate", sessionId: session.id, macAddress },
      });

      return json({
        success: true,
        session,
        package: voucher.access_packages,
        networkProvisioned: !activationError && activation?.networkProvisioned === true,
      });
    }

    return json({ success: false, error: "Invalid action" }, 400);
  } catch (error) {
    console.error("Voucher error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Voucher request failed" }, 500);
  }
});
