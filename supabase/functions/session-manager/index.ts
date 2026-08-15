import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normalizeMac = (value: unknown) => {
  const mac = String(value || "").trim().replace(/-/g, ":").toUpperCase();
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) ? mac : "";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";
    const cronSecret = Deno.env.get("CRON_SECRET_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) return json({ success: false, message: "Session service is not configured" }, 503);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const body = await req.json();
    const action = String(body.action || "");
    const macAddress = normalizeMac(body.macAddress);

    const entitlementFor = async (sessionId: string) => {
      const { data: payment } = await supabase
        .from("payments")
        .select("id,package_id,status")
        .eq("session_id", sessionId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (payment) {
        let packageName: string | null = null;
        if (payment.package_id) {
          const { data: pkg } = await supabase.from("access_packages").select("name").eq("id", payment.package_id).maybeSingle();
          packageName = pkg?.name || null;
        }
        return { valid: true, method: "mpesa", packageName };
      }

      const { data: voucher } = await supabase
        .from("vouchers")
        .select("id,package_id,status")
        .eq("session_id", sessionId)
        .eq("status", "used")
        .order("used_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (voucher) {
        let packageName: string | null = null;
        if (voucher.package_id) {
          const { data: pkg } = await supabase.from("access_packages").select("name").eq("id", voucher.package_id).maybeSingle();
          packageName = pkg?.name || null;
        }
        return { valid: true, method: "voucher", packageName };
      }

      return { valid: false, method: null, packageName: null };
    };

    const publicSession = (session: any, entitlement?: any) => ({
      id: session.id,
      mac_address: session.mac_address,
      phone_number: session.phone_number,
      status: session.status,
      network_status: session.network_status || "pending",
      expires_at: session.expires_at,
      created_at: session.created_at,
      updated_at: session.updated_at,
      access_method: entitlement?.method || null,
      package_name: entitlement?.packageName || null,
    });

    const authorizeNetwork = async (sessionId: string, deviceMac: string) => {
      if (!internalSecret) {
        await supabase
          .from("user_sessions")
          .update({ network_status: "failed", updated_at: new Date().toISOString() })
          .eq("id", sessionId);
        return { networkProvisioned: false, networkMessage: "Network service is not configured" };
      }

      const { data: network, error: networkError } = await supabase.functions.invoke("radius-auth", {
        body: { action: "authorize", sessionId, macAddress: deviceMac, internalSecret },
      });
      if (networkError || network?.networkProvisioned !== true) {
        await supabase.from("user_sessions").update({ network_status: "failed", updated_at: new Date().toISOString() }).eq("id", sessionId);
      }
      return {
        networkProvisioned: !networkError && network?.networkProvisioned === true,
        networkMessage: networkError?.message || network?.message || network?.controller?.message || null,
      };
    };

    const expireStalePayment = async (payment: any) => {
      if (payment?.status !== "pending" || !payment.created_at) return payment;
      const ageMs = Date.now() - new Date(payment.created_at).getTime();
      if (ageMs < 15 * 60_000) return payment;

      const { data: expiredPayment, error: paymentError } = await supabase
        .from("payments")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", payment.id)
        .eq("status", "pending")
        .select()
        .maybeSingle();
      if (paymentError) throw paymentError;

      if (payment.session_id) {
        await supabase
          .from("user_sessions")
          .update({ status: "terminated", network_status: "disconnected", updated_at: new Date().toISOString() })
          .eq("id", payment.session_id)
          .eq("status", "pending");
      }
      return expiredPayment || { ...payment, status: "expired" };
    };

    if (action === "payment-status") {
      const paymentId = String(body.paymentId || "");
      if (!paymentId || !macAddress) return json({ success: false, message: "Invalid payment status request" }, 400);

      const { data: foundPayment, error: paymentError } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
      if (paymentError || !foundPayment || !foundPayment.session_id) return json({ success: false, message: "Payment not found" }, 404);

      const payment = await expireStalePayment(foundPayment);
      const { data: session } = await supabase.from("user_sessions").select("*").eq("id", payment.session_id).eq("mac_address", macAddress).maybeSingle();
      if (!session) return json({ success: false, message: "Payment does not belong to this device" }, 403);

      const entitlement = await entitlementFor(session.id);
      return json({
        success: true,
        payment: {
          id: payment.id,
          amount: payment.amount,
          phone_number: payment.phone_number,
          status: payment.status,
          mpesa_receipt_number: payment.mpesa_receipt_number,
          reconnection_code: payment.reconnection_code,
          reconnection_code_used: payment.reconnection_code_used,
          session_id: payment.session_id,
          created_at: payment.created_at,
          updated_at: payment.updated_at,
        },
        session: payment.status === "completed" ? publicSession(session, entitlement) : null,
      });
    }

    if (action === "current-session") {
      if (!macAddress) return json({ success: false, message: "Invalid device" }, 400);
      const { data: sessions, error } = await supabase
        .from("user_sessions")
        .select("*")
        .eq("mac_address", macAddress)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;

      for (const session of sessions || []) {
        const entitlement = await entitlementFor(session.id);
        if (entitlement.valid) return json({ success: true, session: publicSession(session, entitlement) });
      }
      return json({ success: true, session: null });
    }

    if (action === "retry-network") {
      const sessionId = String(body.sessionId || "");
      if (!sessionId || !macAddress) return json({ success: false, message: "Missing session or device" }, 400);
      const { data: session } = await supabase.from("user_sessions").select("*").eq("id", sessionId).eq("mac_address", macAddress).maybeSingle();
      if (!session || session.status !== "active") return json({ success: false, message: "Active session not found" }, 404);
      if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) return json({ success: false, message: "This WiFi session has expired" }, 410);

      const entitlement = await entitlementFor(sessionId);
      if (!entitlement.valid) return json({ success: false, message: "Session has no valid payment or voucher" }, 403);

      await supabase.from("user_sessions").update({ network_status: "pending", updated_at: new Date().toISOString() }).eq("id", sessionId);
      const networkResult = await authorizeNetwork(sessionId, macAddress);
      const { data: refreshed } = await supabase.from("user_sessions").select("*").eq("id", sessionId).single();
      return json({ success: true, session: publicSession(refreshed, entitlement), ...networkResult });
    }

    if (action === "activate") {
      if (!internalSecret || body.internalSecret !== internalSecret) return json({ success: false, message: "Unauthorized internal action" }, 401);
      const sessionId = String(body.sessionId || "");
      if (!sessionId || !macAddress) return json({ success: false, message: "Missing session or device" }, 400);

      const { data: existing } = await supabase.from("user_sessions").select("*").eq("id", sessionId).eq("mac_address", macAddress).maybeSingle();
      if (!existing) return json({ success: false, message: "Session not found" }, 404);
      if (!existing.expires_at || new Date(existing.expires_at).getTime() <= Date.now()) return json({ success: false, message: "Session has expired" }, 410);

      const entitlement = await entitlementFor(sessionId);
      if (!entitlement.valid) return json({ success: false, message: "Session has no valid payment or voucher" }, 403);

      const { error } = await supabase
        .from("user_sessions")
        .update({ status: "active", network_status: "pending", updated_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) throw error;

      const networkResult = await authorizeNetwork(sessionId, macAddress);
      const { data: refreshed } = await supabase.from("user_sessions").select("*").eq("id", sessionId).single();
      return json({ success: true, session: publicSession(refreshed, entitlement), ...networkResult });
    }

    if (action === "reconnect") {
      const code = String(body.reconnectionCode || "").trim();
      if (!/^\d{6}$/.test(code) || !macAddress) return json({ success: false, message: "Invalid reconnection request" }, 400);

      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .select("*")
        .eq("reconnection_code", code)
        .eq("reconnection_code_used", false)
        .eq("status", "completed")
        .maybeSingle();
      if (paymentError || !payment?.session_id) return json({ success: false, message: "Invalid or already used reconnection code" }, 404);

      const { data: session } = await supabase.from("user_sessions").select("*").eq("id", payment.session_id).eq("mac_address", macAddress).maybeSingle();
      if (!session) return json({ success: false, message: "This code belongs to another device" }, 403);
      if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) return json({ success: false, message: "This WiFi session has expired" }, 410);

      const { error: sessionError } = await supabase
        .from("user_sessions")
        .update({ status: "active", network_status: "pending", updated_at: new Date().toISOString() })
        .eq("id", session.id);
      if (sessionError) throw sessionError;

      const networkResult = await authorizeNetwork(session.id, macAddress);
      if (networkResult.networkProvisioned) {
        await supabase
          .from("payments")
          .update({ reconnection_code_used: true, updated_at: new Date().toISOString() })
          .eq("id", payment.id)
          .eq("reconnection_code_used", false);
      }

      const entitlement = await entitlementFor(session.id);
      const { data: refreshed } = await supabase.from("user_sessions").select("*").eq("id", session.id).single();
      return json({ success: true, session: publicSession(refreshed, entitlement), ...networkResult });
    }

    if (action === "deactivate") {
      const sessionId = String(body.sessionId || "");
      if (!sessionId || !macAddress) return json({ success: false, message: "Missing session or device" }, 400);
      const { data: session } = await supabase.from("user_sessions").select("id,mac_address").eq("id", sessionId).eq("mac_address", macAddress).maybeSingle();
      if (!session) return json({ success: false, message: "Session not found" }, 404);

      const { data: network, error: networkError } = await supabase.functions.invoke("radius-auth", {
        body: { action: "disconnect", sessionId, macAddress, internalSecret },
      });
      await supabase
        .from("user_sessions")
        .update({ status: "terminated", network_status: "disconnected", updated_at: new Date().toISOString() })
        .eq("id", sessionId);
      return json({ success: true, networkProvisioned: !networkError && network?.networkProvisioned === true });
    }

    if (action === "check-expired") {
      if (!cronSecret || body.cronKey !== cronSecret) return json({ success: false, message: "Unauthorized cron action" }, 401);
      const nowIso = new Date().toISOString();
      const staleCutoff = new Date(Date.now() - 15 * 60_000).toISOString();

      const { data: expiredSessions, error } = await supabase
        .from("user_sessions")
        .select("*")
        .eq("status", "active")
        .lt("expires_at", nowIso);
      if (error) throw error;

      for (const session of expiredSessions || []) {
        await supabase.functions.invoke("radius-auth", {
          body: { action: "disconnect", sessionId: session.id, macAddress: session.mac_address, internalSecret },
        });
        await supabase
          .from("user_sessions")
          .update({ status: "expired", network_status: "disconnected", updated_at: nowIso })
          .eq("id", session.id);
      }

      const { data: stalePayments, error: stalePaymentsError } = await supabase
        .from("payments")
        .select("id,session_id")
        .eq("status", "pending")
        .lt("created_at", staleCutoff);
      if (stalePaymentsError) throw stalePaymentsError;

      for (const payment of stalePayments || []) {
        await supabase.from("payments").update({ status: "expired", updated_at: nowIso }).eq("id", payment.id).eq("status", "pending");
        if (payment.session_id) {
          await supabase
            .from("user_sessions")
            .update({ status: "terminated", network_status: "disconnected", updated_at: nowIso })
            .eq("id", payment.session_id)
            .eq("status", "pending");
        }
      }

      return json({
        success: true,
        expiredSessionCount: expiredSessions?.length || 0,
        expiredPaymentCount: stalePayments?.length || 0,
      });
    }

    return json({ success: false, message: "Invalid action" }, 400);
  } catch (error) {
    console.error("Session manager error", error);
    return json({ success: false, message: error instanceof Error ? error.message : "Session manager failed" }, 500);
  }
});
