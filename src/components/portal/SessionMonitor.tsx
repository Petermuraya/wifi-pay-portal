import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, LogOut, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

interface SessionMonitorProps {
  macAddress: string;
}

export function SessionMonitor({ macAddress }: SessionMonitorProps) {
  const { toast } = useToast();

  const { data: currentSession, refetch, isLoading } = useQuery({
    queryKey: ["current-session", macAddress],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("*, payments!inner(*)")
        .eq("mac_address", macAddress)
        .eq("status", "active")
        .eq("payments.status", "completed")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const disconnect = async () => {
    if (!currentSession) return;
    const { data, error } = await supabase.functions.invoke("session-manager", {
      body: { action: "deactivate", sessionId: currentSession.id, macAddress },
    });
    if (error || !data?.success) {
      toast({ title: "Could not disconnect", description: "Please try again.", variant: "destructive" });
      return;
    }
    toast({ title: "Disconnected", description: "Your WiFi session has been closed." });
    refetch();
  };

  if (isLoading) {
    return <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Checking your WiFi session…</div>;
  }

  if (!currentSession) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Wifi className="h-7 w-7" /></div>
        <h2 className="mt-5 text-xl font-bold">No active paid session</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Buy a package, redeem a voucher or reconnect an existing paid session.</p>
      </div>
    );
  }

  const createdAt = new Date(currentSession.created_at || Date.now()).getTime();
  const expiresAt = new Date(currentSession.expires_at || Date.now()).getTime();
  const total = Math.max(expiresAt - createdAt, 1);
  const remaining = Math.max(expiresAt - Date.now(), 0);
  const usedPercent = Math.min(100, Math.max(0, ((Date.now() - createdAt) / total) * 100));
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Connected
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">Your WiFi session</h2>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white"><Activity className="h-5 w-5" /></div>
      </div>

      <div className="mt-6 rounded-2xl bg-slate-50 p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Time remaining</p>
            <p className="mt-1 text-3xl font-black tracking-tight">{hours}h {minutes}m</p>
          </div>
          <Clock3 className="h-6 w-6 text-slate-300" />
        </div>
        <Progress value={usedPercent} className="mt-4 h-2" />
      </div>

      <div className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><span className="text-slate-500">Device</span><span className="font-mono text-xs font-semibold">{macAddress}</span></div>
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><span className="text-slate-500">Phone</span><span className="font-semibold">{currentSession.phone_number}</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">Expires</span><span className="font-semibold">{new Date(currentSession.expires_at || "").toLocaleString()}</span></div>
      </div>

      <Button variant="outline" className="mt-6 h-11 w-full rounded-xl" onClick={disconnect}>
        <LogOut className="mr-2 h-4 w-4" /> Disconnect this session
      </Button>
    </div>
  );
}
