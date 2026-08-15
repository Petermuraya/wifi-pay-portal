import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock3, Copy, RefreshCw, Router, Wifi, XCircle } from "lucide-react";
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
  const [retryingNetwork, setRetryingNetwork] = useState(false);
  const activatedRef = useRef(false);
  const { toast } = useToast();

  const { data: statusData, refetch, isFetching } = useQuery({
    queryKey: ["payment-status", payment.id, macAddress],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("session-manager", {
        body: { action: "payment-status", paymentId: payment.id, macAddress },
      });
      if (error || !data?.success) throw new Error(data?.message || "Could not check payment status");
      return data as { payment: Payment; session: any | null };
    },
    initialData: { payment, session: null },
    refetchInterval: (query) => {
      const current = query.state.data as { payment?: Payment; session?: any } | undefined;
      const paymentPending = current?.payment?.status === "pending";
      const networkPending = current?.payment?.status === "completed" && current?.session?.network_status !== "active";
      return (paymentPending || networkPending) && checks < 60 ? 5000 : false;
    },
  });

  const currentPayment = statusData?.payment || payment;
  const session = statusData?.session;

  useEffect(() => {
    const waitingForPayment = currentPayment?.status === "pending";
    const waitingForNetwork = currentPayment?.status === "completed" && session?.network_status !== "active";
    if ((waitingForPayment || waitingForNetwork) && checks < 60) {
      const timer = window.setTimeout(() => setChecks((value) => value + 1), 5000);
      return () => window.clearTimeout(timer);
    }
  }, [currentPayment?.status, session?.network_status, checks]);

  useEffect(() => {
    if (currentPayment?.status !== "completed" || session?.network_status !== "active" || activatedRef.current) return;
    activatedRef.current = true;
    sessionStorage.setItem("captive_portal_auth", "success");
    onSessionActivated?.(session);
  }, [currentPayment?.status, session, onSessionActivated]);

  const copyCode = async () => {
    if (!currentPayment?.reconnection_code) return;
    await navigator.clipboard.writeText(currentPayment.reconnection_code);
    toast({ title: "Reconnection code copied" });
  };

  const retryNetwork = async () => {
    if (!session?.id) return;
    setRetryingNetwork(true);
    try {
      const { data, error } = await supabase.functions.invoke("session-manager", {
        body: { action: "retry-network", sessionId: session.id, macAddress },
      });
      if (error || !data?.success) throw new Error(data?.message || "Could not retry WiFi activation");
      toast({
        title: data.networkProvisioned ? "WiFi activated" : "Activation sent",
        description: data.networkProvisioned ? "The hotspot has authorized this device." : data.networkMessage || "The router is still being contacted.",
      });
      await refetch();
    } catch (error) {
      toast({ title: "Activation retry failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setRetryingNetwork(false);
    }
  };

  const status = currentPayment?.status || "pending";
  const paymentSuccessful = status === "completed";
  const connected = paymentSuccessful && session?.network_status === "active";
  const networkFailed = paymentSuccessful && session?.network_status === "failed";
  const failed = status === "failed" || status === "expired";

  return (
    <div className="mx-auto max-w-lg">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-950">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-lg sm:p-8">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${connected ? "bg-emerald-100 text-emerald-700" : failed ? "bg-red-100 text-red-700" : networkFailed ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>
          {connected ? <CheckCircle2 className="h-9 w-9" /> : failed ? <XCircle className="h-9 w-9" /> : networkFailed ? <Router className="h-9 w-9" /> : <Clock3 className="h-9 w-9" />}
        </div>

        <h2 className="mt-5 text-2xl font-bold tracking-tight">
          {connected
            ? "You’re connected"
            : failed
              ? "Payment not completed"
              : networkFailed
                ? "Payment received — activation needs attention"
                : paymentSuccessful
                  ? "Payment received — activating WiFi"
                  : "Approve the M-Pesa prompt"}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
          {connected
            ? originalUrl ? "Payment and hotspot activation are confirmed. We’re returning you to your original page." : "Payment is confirmed and the router has activated this device."
            : failed
              ? "The request was cancelled, failed or expired. You can safely try again."
              : networkFailed
                ? "Your M-Pesa payment is safe, but the hotspot controller has not activated this device yet. Retry activation or keep your reconnection code and contact the hotspot operator."
                : paymentSuccessful
                  ? "Safaricom confirmed your payment. We are waiting for the hotspot controller to authorize this device."
                  : "Enter your M-Pesa PIN on your phone. This page checks Safaricom confirmation automatically."}
        </p>

        <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-4 py-1"><span className="text-slate-500">Amount</span><strong>KSh {Number(currentPayment?.amount || 0).toLocaleString()}</strong></div>
          <div className="flex justify-between gap-4 py-1"><span className="text-slate-500">Phone</span><strong>{currentPayment?.phone_number}</strong></div>
          <div className="flex justify-between gap-4 py-1"><span className="text-slate-500">Payment</span><strong className="capitalize">{status}</strong></div>
          {paymentSuccessful && <div className="flex justify-between gap-4 py-1"><span className="text-slate-500">Network</span><strong className="capitalize">{session?.network_status || "activating"}</strong></div>}
          {currentPayment?.mpesa_receipt_number && <div className="flex justify-between gap-4 py-1"><span className="text-slate-500">Receipt</span><strong className="font-mono text-xs">{currentPayment.mpesa_receipt_number}</strong></div>}
        </div>

        {paymentSuccessful && currentPayment?.reconnection_code && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Save this reconnection code</p>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3">
              <span className="font-mono text-xl font-black tracking-[0.2em]">{currentPayment.reconnection_code}</span>
              <Button type="button" size="sm" variant="ghost" onClick={copyCode}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {(status === "pending" || (paymentSuccessful && !connected)) && (
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" className="w-full rounded-xl" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Check status
            </Button>
            {paymentSuccessful && session?.id && (
              <Button className="w-full rounded-xl" onClick={retryNetwork} disabled={retryingNetwork}>
                <Router className={`mr-2 h-4 w-4 ${retryingNetwork ? "animate-pulse" : ""}`} /> Retry activation
              </Button>
            )}
          </div>
        )}

        {connected && (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
            <Wifi className="h-4 w-4 text-emerald-400" /> Internet access active
          </div>
        )}

        {failed && <Button className="mt-5 w-full rounded-xl" onClick={onBack}>Try again</Button>}

        {checks >= 60 && !connected && !failed && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">This is taking longer than expected. If money was deducted, keep your M-Pesa receipt and reconnection code and contact the hotspot operator.</p>
        )}
      </div>
    </div>
  );
}
