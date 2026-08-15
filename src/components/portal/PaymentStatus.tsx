import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock3, Copy, RefreshCw, Wifi, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Payment = Database["public"]["Tables"]["payments"]["Row"];

interface PaymentStatusProps {
  payment: Payment;
  macAddress: string;
  originalUrl?: string;
  onBack: () => void;
  onSessionActivated?: (session: any) => void;
}

export function PaymentStatus({ payment, macAddress, originalUrl, onBack, onSessionActivated }: PaymentStatusProps) {
  const [checks, setChecks] = useState(0);
  const activatedRef = useRef(false);
  const { toast } = useToast();

  const { data: currentPayment, refetch, isFetching } = useQuery({
    queryKey: ["payment-status", payment.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").eq("id", payment.id).single();
      if (error) throw error;
      return data;
    },
    initialData: payment,
    refetchInterval: (query) => query.state.data?.status === "pending" && checks < 60 ? 5000 : false,
  });

  useEffect(() => {
    if (currentPayment?.status === "pending" && checks < 60) {
      const timer = window.setTimeout(() => setChecks((value) => value + 1), 5000);
      return () => window.clearTimeout(timer);
    }
  }, [currentPayment?.status, checks]);

  useEffect(() => {
    if (currentPayment?.status !== "completed" || !currentPayment.session_id || activatedRef.current) return;
    activatedRef.current = true;

    const finishActivation = async () => {
      const { data: session, error } = await supabase
        .from("user_sessions")
        .select("*")
        .eq("id", currentPayment.session_id as string)
        .eq("mac_address", macAddress)
        .single();

      if (error || !session) {
        toast({ title: "Payment received", description: "Payment succeeded, but session activation is still being confirmed." });
        return;
      }

      sessionStorage.setItem("captive_portal_auth", "success");
      onSessionActivated?.(session);
    };

    finishActivation();
  }, [currentPayment, macAddress, onSessionActivated, toast]);

  const copyCode = async () => {
    if (!currentPayment?.reconnection_code) return;
    await navigator.clipboard.writeText(currentPayment.reconnection_code);
    toast({ title: "Reconnection code copied" });
  };

  const status = currentPayment?.status || "pending";
  const successful = status === "completed";
  const failed = status === "failed" || status === "expired";

  return (
    <div className="mx-auto max-w-lg">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-950">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-lg sm:p-8">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${successful ? "bg-emerald-100 text-emerald-700" : failed ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
          {successful ? <CheckCircle2 className="h-9 w-9" /> : failed ? <XCircle className="h-9 w-9" /> : <Clock3 className="h-9 w-9" />}
        </div>

        <h2 className="mt-5 text-2xl font-bold tracking-tight">
          {successful ? "You’re connected" : failed ? "Payment not completed" : "Approve the M-Pesa prompt"}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
          {successful
            ? originalUrl ? "Payment is confirmed. We’re returning you to your original page." : "Payment is confirmed and your WiFi session is active."
            : failed ? "The request was cancelled, failed or expired. You can safely try again."
            : "Enter your M-Pesa PIN on your phone. This page checks Safaricom confirmation automatically."}
        </p>

        <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-4 py-1"><span className="text-slate-500">Amount</span><strong>KSh {Number(currentPayment?.amount || 0).toLocaleString()}</strong></div>
          <div className="flex justify-between gap-4 py-1"><span className="text-slate-500">Phone</span><strong>{currentPayment?.phone_number}</strong></div>
          <div className="flex justify-between gap-4 py-1"><span className="text-slate-500">Status</span><strong className="capitalize">{status}</strong></div>
          {currentPayment?.mpesa_receipt_number && <div className="flex justify-between gap-4 py-1"><span className="text-slate-500">Receipt</span><strong className="font-mono text-xs">{currentPayment.mpesa_receipt_number}</strong></div>}
        </div>

        {successful && currentPayment?.reconnection_code && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Save this reconnection code</p>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3">
              <span className="font-mono text-xl font-black tracking-[0.2em]">{currentPayment.reconnection_code}</span>
              <Button type="button" size="sm" variant="ghost" onClick={copyCode}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {status === "pending" && (
          <Button variant="outline" className="mt-5 w-full rounded-xl" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Check payment now
          </Button>
        )}

        {successful && (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
            <Wifi className="h-4 w-4 text-emerald-400" /> Internet access active
          </div>
        )}

        {failed && <Button className="mt-5 w-full rounded-xl" onClick={onBack}>Try again</Button>}

        {status === "pending" && checks >= 60 && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">Confirmation is taking longer than expected. If money was deducted, keep this page open and contact the hotspot operator with your M-Pesa message.</p>
        )}
      </div>
    </div>
  );
}
