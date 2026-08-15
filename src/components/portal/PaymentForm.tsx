import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, LockKeyhole, Smartphone, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type AccessPackage = Database["public"]["Tables"]["access_packages"]["Row"];
type Payment = Database["public"]["Tables"]["payments"]["Row"];

interface PaymentFormProps {
  package: AccessPackage;
  macAddress: string;
  onPaymentCreated: (payment: Payment) => void;
  onBack: () => void;
}

const normalizeKenyanPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (/^07\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^7\d{8}$/.test(digits)) return `254${digits}`;
  if (/^2547\d{8}$/.test(digits)) return digits;
  return "";
};

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes < 1440) return `${minutes / 60} hours`;
  return `${minutes / 1440} days`;
};

export function PaymentForm({ package: pkg, macAddress, onPaymentCreated, onBack }: PaymentFormProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const { toast } = useToast();

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const phone = normalizeKenyanPhone(phoneNumber);
      if (!phone) throw new Error("Enter a valid Safaricom number, for example 0712345678.");

      const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
        body: { packageId: pkg.id, phoneNumber: phone, macAddress },
      });

      if (error) throw new Error("Could not start the M-Pesa payment. Please try again.");
      if (!data?.success || !data?.payment) throw new Error(data?.message || "M-Pesa payment could not be started.");
      return data.payment as Payment;
    },
    onSuccess: (payment) => {
      toast({ title: "M-Pesa request sent", description: "Check your phone and enter your M-Pesa PIN." });
      onPaymentCreated(payment);
    },
    onError: (error: Error) => {
      toast({ title: "Payment not started", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="mx-auto max-w-lg">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-950">
        <ArrowLeft className="h-4 w-4" /> Back to packages
      </button>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
        <div className="bg-slate-950 p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Selected package</p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">{pkg.name}</h2>
              <p className="mt-1 text-sm text-slate-400">{formatDuration(pkg.duration_minutes)} access</p>
            </div>
            <div className="text-right">
              <span className="text-sm text-slate-400">KSh</span>
              <div className="text-3xl font-black">{Number(pkg.price).toLocaleString()}</div>
            </div>
          </div>
        </div>

        <form
          className="space-y-5 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            paymentMutation.mutate();
          }}
        >
          <div>
            <Label htmlFor="phone" className="text-sm font-semibold">M-Pesa phone number</Label>
            <div className="relative mt-2">
              <Smartphone className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <Input
                id="phone"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0712 345 678"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                className="h-12 rounded-xl pl-11 text-base"
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">We will send an STK push to this Safaricom number. The package price is verified on the server.</p>
          </div>

          <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex items-center gap-2 font-semibold"><Zap className="h-4 w-4" /> What happens next?</div>
            <p className="mt-1.5 leading-5 text-emerald-800">Approve the prompt on your phone. Once Safaricom confirms payment, this device is activated automatically.</p>
          </div>

          <Button type="submit" disabled={paymentMutation.isPending} className="h-12 w-full rounded-xl bg-[#00a651] text-base font-bold hover:bg-[#008f46]">
            {paymentMutation.isPending ? "Sending M-Pesa prompt…" : `Pay KSh ${Number(pkg.price).toLocaleString()}`}
          </Button>

          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <LockKeyhole className="h-3.5 w-3.5" /> Secure server-side payment request
          </div>
        </form>
      </div>
    </div>
  );
}
