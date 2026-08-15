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

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } },
    );

    const { action, sessionId, macAddress } = await req.json();

    if (action === "activate") {
      if (!sessionId || !macAddress) return json({ success: false, message: "Missing session or device" }, 400);

      const { data: session, error } = await supabase
        .from("user_sessions")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", sessionId)
        .eq("mac_address", macAddress)
        .select()
        .single();
      if (error || !session) throw error || new Error("Session not found");

      const { data: network, error: networkError } = await supabase.functions.invoke("radius-auth", {
        body: { action: "authorize", sessionId, macAddress },
      });

      return json({
        success: true,
        session,
        networkProvisioned: !networkError && network?.networkProvisioned === true,
        networkMessage: networkError?.message || network?.controller?.message || null,
      });
    }

    if (action === "deactivate") {
      if (!sessionId || !macAddress) return json({ success: false, message: "Missing session or device" }, 400);
      const { data: network, error: networkError } = await supabase.functions.invoke("radius-auth", {
        body: { action: "disconnect", sessionId, macAddress },
      });
      await supabase.from("user_sessions").update({ status: "terminated", updated_at: new Date().toISOString() }).eq("id", sessionId);
      return json({ success: true, networkProvisioned: !networkError && network?.networkProvisioned === true });
    }

    if (action === "check-expired") {
      const { data: expiredSessions, error } = await supabase
        .from("user_sessions")
        .select("*")
        .eq("status", "active")
        .lt("expires_at", new Date().toISOString());
      if (error) throw error;

      for (const session of expiredSessions || []) {
        await supabase.from("user_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", session.id);
        await supabase.functions.invoke("radius-auth", {
          body: { action: "disconnect", sessionId: session.id, macAddress: session.mac_address },
        });
      }

      return json({ success: true, expiredCount: expiredSessions?.length || 0 });
    }

    return json({ success: false, message: "Invalid action" }, 400);
  } catch (error) {
    console.error("Session manager error", error);
    return json({ success: false, message: error instanceof Error ? error.message : "Session manager failed" }, 500);
  }
});
