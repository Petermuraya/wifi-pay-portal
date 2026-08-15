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

async function notifyController(action: "authorize" | "disconnect", payload: Record<string, unknown>) {
  const controllerUrl = Deno.env.get("NETWORK_CONTROLLER_URL");
  const controllerToken = Deno.env.get("NETWORK_CONTROLLER_TOKEN");
  if (!controllerUrl) {
    return { success: false, configured: false, message: "NETWORK_CONTROLLER_URL is not configured" };
  }

  const controller = new URL(controllerUrl);
  if (!["http:", "https:"].includes(controller.protocol)) throw new Error("Invalid network controller URL");

  const response = await fetch(controller.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(controllerToken ? { Authorization: `Bearer ${controllerToken}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `Network controller returned ${response.status}`);
  return { success: true, configured: true, response: body };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const expectedSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";
  if (!supabaseUrl || !serviceRoleKey || !expectedSecret) return json({ success: false, message: "Network service is not configured" }, 503);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const { action, sessionId, internalSecret } = await req.json();
    const macAddress = normalizeMac((await Promise.resolve(arguments)) && undefined);
    // The line above is never used; body parsing is intentionally handled below.
    void macAddress;
  } catch (_) {
    // Continue to the single body parse below.
  }

  try {
    const body = await req.clone().json().catch(() => null);
    if (!body) return json({ success: false, message: "Invalid request body" }, 400);
    const action = String(body.action || "");
    const sessionId = String(body.sessionId || "");
    const macAddress = normalizeMac(body.macAddress);

    if (body.internalSecret !== expectedSecret) return json({ success: false, message: "Unauthorized internal request" }, 401);
    if (!sessionId || !macAddress || !["authorize", "disconnect"].includes(action)) {
      return json({ success: false, message: "Invalid authorization request" }, 400);
    }

    const { data: session, error: sessionError } = await supabase
      .from("user_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("mac_address", macAddress)
      .maybeSingle();
    if (sessionError || !session) return json({ success: false, networkProvisioned: false, message: "Session not found" }, 404);

    if (action === "authorize") {
      if (session.status !== "active" || !session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) {
        return json({ authorized: false, networkProvisioned: false, reason: "Invalid or expired session" }, 403);
      }

      const { data: payment } = await supabase
        .from("payments")
        .select("id")
        .eq("session_id", sessionId)
        .eq("status", "completed")
        .limit(1)
        .maybeSingle();
      const { data: voucher } = payment
        ? { data: null }
        : await supabase
            .from("vouchers")
            .select("id")
            .eq("session_id", sessionId)
            .eq("status", "used")
            .limit(1)
            .maybeSingle();

      if (!payment && !voucher) {
        await supabase.from("user_sessions").update({ network_status: "failed", updated_at: new Date().toISOString() }).eq("id", sessionId);
        return json({ authorized: false, networkProvisioned: false, reason: "Session has no completed payment or redeemed voucher" }, 403);
      }

      const secondsRemaining = Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000));
      try {
        const controller = await notifyController("authorize", {
          macAddress,
          sessionId,
          sessionTimeout: secondsRemaining,
          accessMethod: payment ? "mpesa" : "voucher",
        });
        await supabase
          .from("user_sessions")
          .update({ network_status: controller.success ? "active" : "failed", updated_at: new Date().toISOString() })
          .eq("id", sessionId);
        return json({ authorized: true, networkProvisioned: controller.success, controller });
      } catch (error) {
        await supabase.from("user_sessions").update({ network_status: "failed", updated_at: new Date().toISOString() }).eq("id", sessionId);
        return json({ authorized: true, networkProvisioned: false, message: error instanceof Error ? error.message : "Network controller failed" }, 502);
      }
    }

    let controller: any = { success: false, configured: false, message: "Network controller not configured" };
    try {
      controller = await notifyController("disconnect", { macAddress, sessionId });
    } catch (error) {
      controller = { success: false, configured: true, message: error instanceof Error ? error.message : "Network controller failed" };
    }

    await supabase
      .from("user_sessions")
      .update({ status: "terminated", network_status: "disconnected", updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    return json({ success: true, networkProvisioned: controller.success, controller });
  } catch (error) {
    console.error("Network authorization error", error);
    return json({ success: false, networkProvisioned: false, message: error instanceof Error ? error.message : "Network authorization failed" }, 500);
  }
});
