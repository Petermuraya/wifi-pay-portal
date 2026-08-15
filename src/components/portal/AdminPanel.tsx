import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Download, Loader2, LogOut, PackagePlus, Power, RefreshCw, Shield, Ticket, Users, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type AdminPackage = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  is_active: boolean;
};

type AdminSession = {
  id: string;
  phone_number: string;
  mac_address: string;
  status: string;
  network_status: string;
  expires_at: string;
  created_at: string;
  package_name: string | null;
  access_method: string | null;
  payment_status: string | null;
  voucher_code: string | null;
};

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${minutes / 60} hr`;
  return `${minutes / 1440} day${minutes / 1440 === 1 ? "" : "s"}`;
};

export function AdminPanel() {
  const [adminKey, setAdminKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [packageName, setPackageName] = useState("");
  const [packagePrice, setPackagePrice] = useState("");
  const [packageDuration, setPackageDuration] = useState("");
  const [packageDescription, setPackageDescription] = useState("");
  const [selectedPackage, setSelectedPackage] = useState("");
  const [voucherQuantity, setVoucherQuantity] = useState(1);
  const [voucherPrefix, setVoucherPrefix] = useState("VIP");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const callAdmin = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("admin-api", {
      body: { action, adminKey, ...extra },
    });
    if (error) throw new Error("Admin service is unavailable");
    if (!data?.success) throw new Error(data?.message || "Admin request failed");
    return data;
  };

  const packagesQuery = useQuery({
    queryKey: ["admin-packages"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const data = await callAdmin("list-packages");
      return (data.packages || []) as AdminPackage[];
    },
  });

  const sessionsQuery = useQuery({
    queryKey: ["admin-sessions"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const data = await callAdmin("list-sessions");
      return (data.sessions || []) as AdminSession[];
    },
    refetchInterval: 15000,
  });

  const loginMutation = useMutation({
    mutationFn: () => callAdmin("verify"),
    onSuccess: () => {
      setIsAuthenticated(true);
      toast({ title: "Admin access granted" });
    },
    onError: () => toast({ title: "Authentication failed", description: "Check the administrator key.", variant: "destructive" }),
  });

  const savePackageMutation = useMutation({
    mutationFn: () => callAdmin("save-package", {
      name: packageName,
      price: Number(packagePrice),
      durationMinutes: Number(packageDuration),
      description: packageDescription,
      isActive: true,
    }),
    onSuccess: () => {
      setPackageName("");
      setPackagePrice("");
      setPackageDuration("");
      setPackageDescription("");
      queryClient.invalidateQueries({ queryKey: ["admin-packages"] });
      queryClient.invalidateQueries({ queryKey: ["access-packages"] });
      toast({ title: "Package saved" });
    },
    onError: (error: Error) => toast({ title: "Package not saved", description: error.message, variant: "destructive" }),
  });

  const togglePackageMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => callAdmin("set-package-active", { id, isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-packages"] });
      queryClient.invalidateQueries({ queryKey: ["access-packages"] });
    },
    onError: (error: Error) => toast({ title: "Package update failed", description: error.message, variant: "destructive" }),
  });

  const voucherMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("voucher-generator", {
        body: { action: "generate", packageId: selectedPackage, quantity: voucherQuantity, prefix: voucherPrefix, adminKey },
      });
      if (error) throw new Error("Voucher service is unavailable");
      if (!data?.success) throw new Error(data?.error || "Voucher generation failed");
      return data.vouchers as any[];
    },
    onSuccess: (vouchers) => {
      const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const rows = [
        ["Code", "Package", "Duration", "Price", "Status", "Created At"],
        ...vouchers.map((voucher) => [voucher.code, voucher.package_name, voucher.duration_minutes, voucher.price, voucher.status, voucher.created_at]),
      ];
      const blob = new Blob([rows.map((row) => row.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `wifi-vouchers-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: `${vouchers.length} voucher${vouchers.length === 1 ? "" : "s"} generated` });
    },
    onError: (error: Error) => toast({ title: "Voucher generation failed", description: error.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: (sessionId: string) => callAdmin("disconnect", { sessionId }),
    onSuccess: () => {
      sessionsQuery.refetch();
      toast({ title: "Session terminated" });
    },
    onError: (error: Error) => toast({ title: "Could not terminate session", description: error.message, variant: "destructive" }),
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-16 text-white">
        <Card className="mx-auto max-w-md border-white/10 bg-white text-slate-950 shadow-2xl">
          <CardHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white"><Shield className="h-5 w-5" /></div>
            <CardTitle>WiFi Pay operator access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="adminKey">Administrator key</Label>
              <Input id="adminKey" type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} onKeyDown={(event) => event.key === "Enter" && adminKey && loginMutation.mutate()} className="mt-2" />
            </div>
            <Button className="w-full" disabled={!adminKey || loginMutation.isPending} onClick={() => loginMutation.mutate()}>
              {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Authenticate
            </Button>
            <a href="/" className="block text-center text-xs text-slate-500 hover:text-slate-900">Back to customer portal</a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const packages = packagesQuery.data || [];
  const sessions = sessionsQuery.data || [];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white"><Wifi className="h-5 w-5" /></div>
            <div><h1 className="font-bold">WiFi Pay Admin</h1><p className="text-xs text-slate-500">Packages, vouchers and live sessions</p></div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { packagesQuery.refetch(); sessionsQuery.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
            <Button variant="ghost" size="sm" onClick={() => { setIsAuthenticated(false); setAdminKey(""); }}><LogOut className="mr-2 h-4 w-4" /> Logout</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="pt-6"><p className="text-xs uppercase tracking-wider text-slate-500">Packages</p><p className="mt-1 text-3xl font-black">{packages.length}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs uppercase tracking-wider text-slate-500">Live / pending sessions</p><p className="mt-1 text-3xl font-black">{sessions.length}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs uppercase tracking-wider text-slate-500">Router-active</p><p className="mt-1 text-3xl font-black">{sessions.filter((session) => session.network_status === "active").length}</p></CardContent></Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5" /> Create internet package</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label>Name</Label><Input className="mt-2" value={packageName} onChange={(event) => setPackageName(event.target.value)} placeholder="e.g. 3 Hours Unlimited" /></div>
              <div><Label>Price (KSh)</Label><Input className="mt-2" type="number" min="1" step="1" value={packagePrice} onChange={(event) => setPackagePrice(event.target.value)} /></div>
              <div><Label>Duration (minutes)</Label><Input className="mt-2" type="number" min="1" value={packageDuration} onChange={(event) => setPackageDuration(event.target.value)} /></div>
              <div className="sm:col-span-2"><Label>Description</Label><Textarea className="mt-2" value={packageDescription} onChange={(event) => setPackageDescription(event.target.value)} placeholder="Short customer-facing description" /></div>
              <div className="sm:col-span-2"><Button className="w-full" disabled={!packageName || !packagePrice || !packageDuration || savePackageMutation.isPending} onClick={() => savePackageMutation.mutate()}>{savePackageMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save package</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Ticket className="h-5 w-5" /> Generate vouchers</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Active package</Label><select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedPackage} onChange={(event) => setSelectedPackage(event.target.value)}><option value="">Choose a package</option>{packages.filter((pkg) => pkg.is_active).map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.name} — KSh {pkg.price}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3"><div><Label>Quantity</Label><Input className="mt-2" type="number" min="1" max="100" value={voucherQuantity} onChange={(event) => setVoucherQuantity(Math.min(100, Math.max(1, Number(event.target.value) || 1)))} /></div><div><Label>Prefix</Label><Input className="mt-2 uppercase" maxLength={3} value={voucherPrefix} onChange={(event) => setVoucherPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3))} /></div></div>
              <Button className="w-full" variant="outline" disabled={!selectedPackage || voucherMutation.isPending} onClick={() => voucherMutation.mutate()}>{voucherMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Generate & download CSV</Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Internet packages</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {packages.map((pkg) => (
                <div key={pkg.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{pkg.name}</h3><p className="mt-1 text-sm text-slate-500">{formatDuration(pkg.duration_minutes)} • KSh {Number(pkg.price).toLocaleString()}</p></div><Badge variant={pkg.is_active ? "default" : "secondary"}>{pkg.is_active ? "Active" : "Hidden"}</Badge></div>
                  {pkg.description && <p className="mt-3 text-xs leading-5 text-slate-500">{pkg.description}</p>}
                  <Button size="sm" variant="outline" className="mt-4 w-full" disabled={togglePackageMutation.isPending} onClick={() => togglePackageMutation.mutate({ id: pkg.id, isActive: !pkg.is_active })}><Power className="mr-2 h-3.5 w-3.5" /> {pkg.is_active ? "Hide package" : "Activate package"}</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Sessions</CardTitle><Badge variant="secondary">{sessions.length}</Badge></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Device</TableHead><TableHead>Access</TableHead><TableHead>Package</TableHead><TableHead>Network</TableHead><TableHead>Expires</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell><div className="font-mono text-xs">{session.mac_address}</div><div className="mt-1 text-xs text-slate-500">{session.phone_number === "VOUCHER" ? "Voucher user" : session.phone_number}</div></TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{session.access_method || session.status}</Badge></TableCell>
                    <TableCell>{session.package_name || "—"}</TableCell>
                    <TableCell><Badge className={session.network_status === "active" ? "bg-emerald-600" : session.network_status === "failed" ? "bg-orange-600" : ""}>{session.network_status || "pending"}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{session.expires_at ? new Date(session.expires_at).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="destructive" disabled={disconnectMutation.isPending} onClick={() => disconnectMutation.mutate(session.id)}>{disconnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Terminate"}</Button></TableCell>
                  </TableRow>
                ))}
                {!sessions.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-slate-500"><Activity className="mx-auto mb-2 h-5 w-5" /> No active or pending sessions</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
