import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Gift, Ticket, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type UserSession = Database["public"]["Tables"]["user_sessions"]["Row"];

interface VoucherRedemptionProps {
  macAddress: string;
  onSessionCreated: (session: UserSession | Record<string, unknown>) => void;
}

export function VoucherRedemption({ macAddress, onSessionCreated }: VoucherRedemptionProps) {
  const [voucherCode, setVoucherCode] = useState("");
  const { toast } = useToast();

  const redeemVoucherMutation = useMutation({
    mutationFn: async () => {
      const code = voucherCode.trim().toUpperCase();
      if (!/^[A-Z0-9]{8}$/.test(code)) throw new Error("Enter the full 8-character voucher code.");

      const { data, error } = await supabase.functions.invoke("voucher-generator", {
        body: { action: "redeem", voucherCode: code, macAddress },
      });
      if (error) throw new Error("Voucher service is unavailable. Please try again.");
      if (!data?.success || !data?.session) throw new Error(data?.error || "Voucher could not be redeemed.");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: data.networkProvisioned ? "Voucher redeemed — connected" : "Voucher redeemed",
        description: data.networkProvisioned
          ? `${data.package.name} access is active on this device.`
          : "Your voucher is valid. The hotspot is still confirming network activation.",
      });
      onSessionCreated(data.session);
    },
    onError: (error: Error) => {
      toast({ title: "Voucher not accepted", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600">Prepaid access</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">Redeem a WiFi voucher</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Enter the 8-character code provided by the hotspot operator. Each voucher can only be claimed once.</p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700"><Gift className="h-5 w-5" /></div>
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          redeemVoucherMutation.mutate();
        }}
      >
        <div>
          <Label htmlFor="voucher">Voucher code</Label>
          <div className="relative mt-2">
            <Ticket className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="voucher"
              value={voucherCode}
              onChange={(event) => setVoucherCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
              placeholder="VIP7K2QZ"
              autoCapitalize="characters"
              autoComplete="off"
              className="h-12 rounded-xl pl-10 font-mono text-base font-bold tracking-[0.12em] uppercase"
              maxLength={8}
            />
          </div>
        </div>

        <Button type="submit" className="h-12 w-full rounded-xl" disabled={redeemVoucherMutation.isPending || voucherCode.length !== 8}>
          <Wifi className="mr-2 h-4 w-4" /> {redeemVoucherMutation.isPending ? "Checking voucher…" : "Redeem & connect"}
        </Button>
      </form>
    </div>
  );
}
