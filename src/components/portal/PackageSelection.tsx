import { Check, Clock3, Sparkles, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Database } from "@/integrations/supabase/types";

type AccessPackage = Database["public"]["Tables"]["access_packages"]["Row"];

interface PackageSelectionProps {
  packages: AccessPackage[];
  onSelectPackage: (pkg: AccessPackage) => void;
}

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hours = minutes / 60;
    return Number.isInteger(hours) ? `${hours} hr${hours === 1 ? "" : "s"}` : `${hours.toFixed(1)} hrs`;
  }
  const days = minutes / 1440;
  return Number.isInteger(days) ? `${days} day${days === 1 ? "" : "s"}` : `${days.toFixed(1)} days`;
};

export function PackageSelection({ packages, onSelectPackage }: PackageSelectionProps) {
  if (!packages.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Wifi className="mx-auto h-9 w-9 text-slate-300" />
        <h2 className="mt-4 text-lg font-semibold">No packages available</h2>
        <p className="mt-2 text-sm text-slate-500">Please contact the hotspot operator.</p>
      </div>
    );
  }

  const popular = packages.length > 2 ? packages[Math.floor(packages.length / 2)]?.id : packages[0]?.id;

  return (
    <section>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Internet packages</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Choose what works for you</h2>
          <p className="mt-1 text-sm text-slate-500">One payment. Instant activation on this device.</p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-slate-500">
          <Clock3 className="h-4 w-4" /> Time starts after successful payment
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => {
          const isPopular = pkg.id === popular;
          return (
            <article key={pkg.id} className={`relative flex min-h-[260px] flex-col rounded-3xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${isPopular ? "border-slate-950 ring-1 ring-slate-950" : "border-slate-200"}`}>
              {isPopular && (
                <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                  <Sparkles className="h-3 w-3" /> Popular
                </span>
              )}
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-900">
                <Wifi className="h-5 w-5" />
              </div>
              <h3 className="mt-5 pr-16 text-lg font-bold">{pkg.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-sm font-semibold text-slate-500">KSh</span>
                <span className="text-3xl font-black tracking-tight">{Number(pkg.price).toLocaleString()}</span>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> {formatDuration(pkg.duration_minutes)} access</p>
                <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /> Instant M-Pesa activation</p>
                {pkg.description && <p className="line-clamp-2 text-xs leading-5 text-slate-500">{pkg.description}</p>}
              </div>
              <Button onClick={() => onSelectPackage(pkg)} className={`mt-auto w-full rounded-xl ${isPopular ? "bg-slate-950 hover:bg-slate-800" : ""}`} variant={isPopular ? "default" : "outline"}>
                Buy this package
              </Button>
            </article>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 sm:grid-cols-3">
        <div><strong className="text-slate-950">1.</strong> Pick a package</div>
        <div><strong className="text-slate-950">2.</strong> Approve M-Pesa prompt</div>
        <div><strong className="text-slate-950">3.</strong> Browse automatically</div>
      </div>
    </section>
  );
}
