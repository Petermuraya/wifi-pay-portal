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
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const adminSecret = Deno.env.get("ADMIN_SECRET_KEY") || "";
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";
    if (!supabaseUrl || !serviceRoleKey || !adminSecret || !internalSecret) return json({ success: false, message: "Admin service is not configured" }, 503);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const body = await req.json();
    if (body.adminKey !== adminSecret) return json({ success: false, message: "Unauthorized" }, 401);

    const action = String(body.action || "");
    if (action === "verify") return json({ success: true, valid: true });

    if (action === "list-packages") {
      const { data: packages, error } = await supabase.from("access_packages").select("*").order("price", { ascending: true });
      if (error) throw error;
      return json({ success: true, packages: packages || [] });
    }

    if (action === "list-sessions") {
      const { data: sessions, error } = await supabase
        .from("user_sessions")
        .select("*")
        .in("status", ["active", "pending"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const enriched = [];
      for (const session of sessions || []) {
        const { data: payment } = await supabase
          .from("payments")
          .select("id,amount,status,package_id")
          .eq("session_id", session.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const { data: voucher } = payment
          ? { data: null }
          : await supabase
              .from("vouchers")
              .select("id,status,package_id,code")
              .eq("session_id", session.id)
              .order("used_at", { ascending: false })
              .limit(1)
              .maybeSingle();
        const packageId = payment?.package_id || voucher?.package_id || null;
        const { data: pkg } = packageId ? await supabase.from("access_packages").select("name").eq("id", packageId).maybeSingle() : { data: null };
        enriched.push({
          ...session,
          package_name: pkg?.name || null,
          access_method: payment ? "mpesa" : voucher ? "voucher" : null,
          payment_status: payment?.status || null,
          voucher_code: voucher?.code || null,
        });
      }
      return json({ success: true, sessions: enriched });
    }

    if (action === "disconnect") {
      const sessionId = String(body.sessionId || "");
      if (!sessionId) return json({ success: false, message: "Session is required" }, 400);
      const { data: session } = await supabase.from("user_sessions").select("id,mac_address").eq("id", sessionId).maybeSingle();
      if (!session) return json({ success: false, message: "Session not found" }, 404);

      const { data: network, error: networkError } = await supabase.functions.invoke("radius-auth", {
        body: { action: "disconnect", sessionId, macAddress: session.mac_address, internalSecret },
      });
      await supabase
        .from("user_sessions")
        .update({ status: "terminated", network_status: "disconnected", updated_at: new Date().toISOString() })
        .eq("id", sessionId);
      return json({ success: true, networkProvisioned: !networkError && network?.networkProvisioned === true });
    }

    if (action === "save-package") {
      const id = body.id ? String(body.id) : null;
      const name = String(body.name || "").trim();
      const description = String(body.description || "").trim() || null;
      const durationMinutes = Number(body.durationMinutes);
      const price = Number(body.price);
      const isActive = body.isActive !== false;
      if (name.length < 2 || name.length > 80 || !Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 43_200 || !Number.isInteger(price) || price <= 0 || price > 1_000_000) {
        return json({ success: false, message: "Invalid package details" }, 400);
      }

      const payload = { name, description, duration_minutes: durationMinutes, price, is_active: isActive };
      const query = id
        ? supabase.from("access_packages").update(payload).eq("id", id).select().single()
        : supabase.from("access_packages").insert(payload).select().single();
      const { data: pkg, error } = await query;
      if (error) return json({ success: false, message: error.message }, 400);
      return json({ success: true, package: pkg });
    }

    if (action === "set-package-active") {
      const id = String(body.id || "");
      if (!id || typeof body.isActive !== "boolean") return json({ success: false, message: "Invalid package update" }, 400);
      const { data: pkg, error } = await supabase
        .from("access_packages")
        .update({ is_active: body.isActive })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return json({ success: true, package: pkg });
    }

    return json({ success: false, message: "Invalid action" }, 400);
  } catch (error) {
    console.error("Admin API error", error);
    return json({ success: false, message: error instanceof Error ? error.message : "Admin request failed" }, 500);
  }
});
