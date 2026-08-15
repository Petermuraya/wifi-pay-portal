import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const randomPart = (length: number) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const normalizeMac = (value: unknown) => {
  const mac = String(value || "").trim().replace(/-/g, ":").toUpperCase();
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) ? mac : "";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";
    if (!supabaseUrl || !serviceRoleKey || !internalSecret) return json({ success: false, error: "Voucher service is not configured" }, 503);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "generate") {
      if (!Deno.env.get("ADMIN_SECRET_KEY") || body.adminKey !== Deno.env.get("ADMIN_SECRET_KEY")) {
        return json({ success: false, error: "Unauthorized" }, 401);
      }

      const quantity = Math.min(Math.max(Number(body.quantity || 1), 1), 100);
      const prefix = String(body.prefix || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
      const packageId = String(body.packageId || "");
      if (!packageId) return json({ success: false, error: "Package is required" }, 400);

      const { data: pkg } = await supabase
        .from("access_packages")
        .select("id,name,duration_minutes,price,is_active")
        .eq("id", packageId)
        .eq("is_active", true)
        .maybeSingle();
      if (!pkg) return json({ success: false, error: "Package is not available" }, 404);

      const vouchers = [];
      for (let i = 0; i < quantity; i++) {
        let voucher: any = null;
        for (let attempt = 0; attempt < 8 && !voucher; attempt++) {
          const code = `${prefix}${randomPart(8 - prefix.length)}`;
          const { data, error } = await supabase
            .from("vouchers")
            .insert({ code, package_id: packageId, status: "unused", created_at: new Date().toISOString() })
            .select()
            .single();
          if (!error) voucher = data;
        }
        if (!voucher) throw new Error("Could not generate a unique voucher code");
        vouchers.push({ ...voucher, package_name: pkg.name, duration_minutes: pkg.duration_minutes, price: pkg.price });
      }
      return json({ success: true, vouchers });
    }

    if (action === "redeem") {
      const voucherCode = String(body.voucherCode || "").trim().toUpperCase();
      const macAddress = normalizeMac(body.macAddress);
      if (!/^[A-Z0-9]{8}$/.test(voucherCode) || !macAddress) {
        return json({ success: false, error: "Invalid voucher or device" }, 400);
      }

      const { data: voucher, error: voucherError } = await supabase
        .from("vouchers")
        .select("*, access_packages(*)")
        .eq("code", voucherCode)
        .eq("status", "unused")
        .maybeSingle();
      if (voucherError || !voucher?.access_packages || voucher.access_packages.is_active === false) {
        return json({ success: false, error: "Invalid, inactive or already used voucher code" }, 404);
      }

      const durationMinutes = Number(voucher.access_packages.duration_minutes);
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return json({ success: false, error: "Voucher package is invalid" }, 400);

      const { data: session, error: sessionError } = await supabase
        .from("user_sessions")
        .insert({
          mac_address: macAddress,
          phone_number: "VOUCHER",
          expires_at: new Date(Date.now() + durationMinutes * 60_000).toISOString(),
          status: "pending",
          network_status: "pending",
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
        .maybeSingle();

      if (claimError || !claimedVoucher) {
        await supabase.from("user_sessions").delete().eq("id", session.id);
        return json({ success: false, error: "Voucher was already redeemed" }, 409);
      }

      const { data: activation, error: activationError } = await supabase.functions.invoke("session-manager", {
        body: { action: "activate", sessionId: session.id, macAddress, internalSecret },
      });

      if (activationError || !activation?.success) {
        await supabase.from("user_sessions").update({ network_status: "failed", updated_at: new Date().toISOString() }).eq("id", session.id);
      }

      return json({
        success: true,
        session: activation?.session || session,
        package: voucher.access_packages,
        networkProvisioned: !activationError && activation?.networkProvisioned === true,
        message: activationError?.message || activation?.networkMessage || null,
      });
    }

    return json({ success: false, error: "Invalid action" }, 400);
  } catch (error) {
    console.error("Voucher error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Voucher request failed" }, 500);
  }
});
