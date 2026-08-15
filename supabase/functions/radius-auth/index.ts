import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function notifyController(action: "authorize" | "disconnect", payload: Record<string, unknown>) {
  const controllerUrl = Deno.env.get("NETWORK_CONTROLLER_URL");
  const controllerToken = Deno.env.get("NETWORK_CONTROLLER_TOKEN");
  if (!controllerUrl) {
    return { success: false, configured: false, message: "NETWORK_CONTROLLER_URL is not configured" };
  }

  const response = await fetch(controllerUrl, {
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

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } },
    );

    const { action, sessionId, macAddress } = await req.json();
    if (!sessionId || !macAddress || !["authorize", "disconnect"].includes(action)) {
      return json({ success: false, message: "Invalid authorization request" }, 400);
    }

    if (action === "authorize") {
      const { data: session, error } = await supabase
        .from("user_sessions")
        .select("*, payments!inner(*)")
        .eq("id", sessionId)
        .eq("mac_address", macAddress)
        .eq("status", "active")
        .eq("payments.status", "completed")
        .gt("expires_at", new Date().toISOString())
        .single();

      if (error || !session) return json({ authorized: false, networkProvisioned: false, reason: "Invalid or expired paid session" }, 403);

      const secondsRemaining = Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000));
      const controller = await notifyController("authorize", { macAddress, sessionId, sessionTimeout: secondsRemaining });
      return json({ authorized: true, networkProvisioned: controller.success, controller });
    }

    const controller = await notifyController("disconnect", { macAddress, sessionId });
    await supabase.from("user_sessions").update({ status: "terminated", updated_at: new Date().toISOString() }).eq("id", sessionId);
    return json({ success: true, networkProvisioned: controller.success, controller });
  } catch (error) {
    console.error("Network authorization error", error);
    return json({ success: false, networkProvisioned: false, message: error instanceof Error ? error.message : "Network authorization failed" }, 500);
  }
});
