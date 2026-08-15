import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Gift, HelpCircle, KeyRound, Loader2, ShieldCheck, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PackageSelection } from "@/components/portal/PackageSelection";
import { PaymentForm } from "@/components/portal/PaymentForm";
import { PaymentStatus } from "@/components/portal/PaymentStatus";
import { VoucherRedemption } from "@/components/portal/VoucherRedemption";
import { ReconnectionCode } from "@/components/portal/ReconnectionCode";
import { SessionMonitor } from "@/components/portal/SessionMonitor";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type AccessPackage = Database["public"]["Tables"]["access_packages"]["Row"];
type Payment = Database["public"]["Tables"]["payments"]["Row"];

type TabId = "packages" | "voucher" | "reconnect" | "session";

const tabs = [
  { id: "packages" as const, label: "Buy WiFi", icon: Wifi },
  { id: "voucher" as const, label: "Voucher", icon: Gift },
  { id: "reconnect" as const, label: "Reconnect", icon: KeyRound },
  { id: "session" as const, label: "My session", icon: Activity },
];

const normalizeMac = (value: string | null) => {
  if (!value) return "";
  const normalized = value.trim().replace(/-/g, ":").toUpperCase();
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalized) ? normalized : "";
};

export default function Portal() {
  const [selectedPackage, setSelectedPackage] = useState<AccessPackage | null>(null);
  const [currentPayment, setCurrentPayment] = useState<Payment | null>(null);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabId>("packages");
  const { toast } = useToast();

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const macAddress = normalizeMac(params.get("mac") || params.get("client_mac"));
  const originalUrl = params.get("link-orig") || params.get("orig") || params.get("dst") || params.get("url") || "";

  const { data: packages, isLoading, error } = useQuery({
    queryKey: ["access-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_packages")
        .select("*")
        .eq("is_active", true)
        .order("price");
      if (error) throw error;
      return data;
    },
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (error) {
      toast({
        title: "Could not load WiFi packages",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const handleSessionCreated = (session: any) => {
    setCurrentSession(session);
    sessionStorage.setItem("captive_portal_auth", "success");
    if (originalUrl) {
      window.setTimeout(() => window.location.assign(originalUrl), 1400);
    } else {
      setActiveTab("session");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center text-white">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald-400" />
          <h1 className="mt-5 text-xl font-semibold">Connecting you to WiFi</h1>
          <p className="mt-2 text-sm text-slate-400">Loading available internet packages…</p>
          <Progress value={72} className="mt-5" />
        </div>
      </div>
    );
  }

  if (!macAddress) {
    return (
      <div className="min-h-screen bg-slate-950 px-5 py-12 text-white">
        <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
            <Wifi className="h-6 w-6" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold">Open this page from the hotspot</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Your router did not provide a valid device MAC address. Connect to the WiFi network and let the hotspot redirect you to this portal.
          </p>
          <div className="mt-6 rounded-2xl bg-slate-900 p-4 text-xs text-slate-400">
            Required captive-portal parameter: <span className="font-mono text-slate-200">?mac=AA:BB:CC:DD:EE:FF</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7f6] text-slate-950">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <button className="flex items-center gap-3" onClick={() => { setActiveTab("packages"); setSelectedPackage(null); setCurrentPayment(null); }}>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
              <Wifi className="h-5 w-5" />
            </span>
            <span className="text-left">
              <span className="block text-base font-bold leading-tight">SwiftSpot WiFi</span>
              <span className="block text-xs text-slate-500">Fast. Simple. M-Pesa ready.</span>
            </span>
          </button>
          <Button variant="ghost" size="sm" onClick={() => toast({ title: "Need help?", description: "Use your voucher/reconnection code or contact the hotspot operator." })}>
            <HelpCircle className="mr-2 h-4 w-4" /> Help
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-9">
        <section className="overflow-hidden rounded-3xl bg-slate-950 px-5 py-6 text-white shadow-xl sm:px-8 sm:py-8">
          <div className="grid gap-6 md:grid-cols-[1.5fr_1fr] md:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> Secure hotspot access
              </div>
              <h1 className="mt-4 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">Get online in under a minute.</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                Choose a package, pay securely with M-Pesa and your device is activated automatically.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">This device</p>
              <p className="mt-2 font-mono text-sm font-semibold text-white">{macAddress}</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Ready for activation
              </div>
            </div>
          </div>
        </section>

        <nav className="mt-6 grid grid-cols-4 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSelectedPackage(null); setCurrentPayment(null); }}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium transition sm:flex-row sm:gap-2 sm:text-sm ${active ? "bg-slate-950 text-white shadow" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}
              >
                <Icon className="h-4 w-4" /> {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-6">
          <AnimatePresence mode="wait">
            <motion.div key={`${activeTab}-${Boolean(selectedPackage)}-${Boolean(currentPayment)}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              {currentPayment ? (
                <PaymentStatus
                  payment={currentPayment}
                  macAddress={macAddress}
                  originalUrl={originalUrl}
                  onBack={() => { setCurrentPayment(null); setSelectedPackage(null); }}
                  onSessionActivated={handleSessionCreated}
                />
              ) : selectedPackage ? (
                <PaymentForm package={selectedPackage} macAddress={macAddress} onPaymentCreated={setCurrentPayment} onBack={() => setSelectedPackage(null)} />
              ) : activeTab === "packages" ? (
                <PackageSelection packages={packages || []} onSelectPackage={setSelectedPackage} />
              ) : activeTab === "voucher" ? (
                <VoucherRedemption macAddress={macAddress} onSessionCreated={handleSessionCreated} />
              ) : activeTab === "reconnect" ? (
                <ReconnectionCode macAddress={macAddress} onSessionActivated={handleSessionCreated} />
              ) : (
                <SessionMonitor macAddress={macAddress} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-center text-xs text-slate-500 sm:px-6">
        Secure M-Pesa payments • Access is tied to this device • © {new Date().getFullYear()} SwiftSpot WiFi
      </footer>
    </div>
  );
}
