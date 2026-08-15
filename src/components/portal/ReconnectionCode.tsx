import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface ReconnectionCodeProps {
  macAddress: string;
  onSessionActivated?: (session: any) => void;
}

export function ReconnectionCode({ macAddress, onSessionActivated }: ReconnectionCodeProps) {
  const [code, setCode] = useState("");
  const { toast } = useToast();

  const reconnect = useMutation({
    mutationFn: async () => {
      if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit code from your successful payment.");
      const { data, error } = await supabase.functions.invoke("session-manager", {
        body: { action: "reconnect", reconnectionCode: code, macAddress },
      });
      if (error) throw new Error("Could not verify the reconnection code.");
      if (!data?.success || !data?.session) throw new Error(data?.message || "This code is invalid or has already been used.");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: data.networkProvisioned ? "Reconnected" : "Session restored",
        description: data.networkProvisioned
          ? "The hotspot has restored internet access on this device."
          : data.networkMessage || "Your paid session is valid, but the router is still confirming access.",
      });
      onSessionActivated?.(data.session);
    },
    onError: (error: Error) => toast({ title: "Could not reconnect", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
        <KeyRound className="h-5 w-5" />
      </div>
      <h2 className="mt-5 text-2xl font-bold tracking-tight">Reconnect this device</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">If you already paid but were disconnected, enter the 6-digit code shown after payment.</p>

      <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); reconnect.mutate(); }}>
        <div>
          <Label htmlFor="reconnection-code" className="font-semibold">Reconnection code</Label>
          <Input
            id="reconnection-code"
            inputMode="numeric"
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-2 h-14 rounded-xl text-center font-mono text-2xl font-bold tracking-[0.3em]"
          />
        </div>
        <Button className="h-12 w-full rounded-xl bg-slate-950 hover:bg-slate-800" disabled={reconnect.isPending || code.length !== 6}>
          {reconnect.isPending ? "Checking code…" : <><CheckCircle2 className="mr-2 h-4 w-4" /> Reconnect to WiFi</>}
        </Button>
      </form>

      <div className="mt-5 flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
        <Wifi className="mt-0.5 h-4 w-4 shrink-0" /> The code is tied to the device that made the original payment. It is consumed only after the hotspot successfully re-authorizes the session.
      </div>
    </div>
  );
}
