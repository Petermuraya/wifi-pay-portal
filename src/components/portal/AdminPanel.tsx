import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shield, Ticket, Users, Activity, Download, LogOut, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration } from "@/lib/utils";

export function AdminPanel() {
  const [adminKey, setAdminKey] = useState("");
  const [selectedPackage, setSelectedPackage] = useState("");
  const [voucherQuantity, setVoucherQuantity] = useState(1);
  const [voucherPrefix, setVoucherPrefix] = useState("VIP");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { toast } = useToast();

  // Enhanced admin authentication with session timeout
  const { data: packages } = useQuery({
    queryKey: ["access-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_packages")
        .select("*")
        .eq("is_active", true)
        .order("price", { ascending: true });
      
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  const { data: activeSessions, refetch: refetchSessions } = useQuery({
    queryKey: ["active-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("*, payments(*, access_packages(*))")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: isAuthenticated,
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  const generateVouchersMutation = useMutation({
    mutationFn: async ({ 
      packageId, 
      quantity,
      prefix 
    }: { 
      packageId: string; 
      quantity: number;
      prefix: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('voucher-generator', {
        body: {
          action: 'generate',
          packageId,
          quantity,
          prefix,
          adminKey
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Generation failed");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Vouchers Generated",
        description: `Successfully generated ${data.vouchers.length} voucher(s).`,
      });
      downloadVouchers(data.vouchers);
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Generation Failed",
        description: error.message || "Failed to generate vouchers",
        variant: "destructive",
      });
    },
  });

  const disconnectSessionMutation = useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string }) => {
      const { data, error } = await supabase.functions.invoke('session-manager', {
        body: {
          action: 'deactivate',
          sessionId,
          adminKey
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Disconnect failed");
      return data;
    },
    onSuccess: () => {
      toast({
        title: "🔌 Session Disconnected",
        description: "User session terminated successfully",
      });
      refetchSessions();
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Disconnect Failed",
        description: error.message || "Failed to disconnect session",
        variant: "destructive",
      });
    },
  });

  const handleLogin = async () => {
    if (adminKey.length < 8) {
      toast({
        title: "Invalid Admin Key",
        description: "Admin key must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    // Verify admin key with server
    try {
      const { data, error } = await supabase.functions.invoke('admin-verify', {
        body: { adminKey }
      });

      if (error || !data?.valid) throw new Error("Invalid admin key");

      setIsAuthenticated(true);
      toast({
        title: "🔓 Admin Access Granted",
        description: "You now have elevated privileges",
      });
    } catch (error) {
      toast({
        title: "Authentication Failed",
        description: "Invalid admin credentials",
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAdminKey("");
    toast({
      title: "🔒 Admin Session Ended",
      description: "You have been logged out",
    });
  };

  const downloadVouchers = (vouchers: any[]) => {
    const headers = ["Code", "Package", "Duration", "Status", "Created At"];
    const rows = vouchers.map(v => [
      v.code,
      v.package_name || "N/A",
      formatDuration(v.duration_minutes),
      v.status,
      new Date(v.created_at).toLocaleString()
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vouchers_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <span>Admin Authentication</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adminKey">Administrator Key</Label>
              <Input
                id="adminKey"
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Enter secure admin key"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              <p className="text-xs text-muted-foreground">
                Requires elevated privileges
              </p>
            </div>
            <Button onClick={handleLogin} className="w-full">
              Authenticate
            </Button>
          </CardContent>
        </Card>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Admin Dashboard
        </h1>
        <Button variant="outline" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>

      {/* Voucher Generation Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Voucher Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Package</Label>
            <Select 
              value={selectedPackage} 
              onValueChange={setSelectedPackage}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select package" />
              </SelectTrigger>
              <SelectContent>
                {packages?.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.name} ({pkg.duration_minutes} min) - KSh {pkg.price}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quantity (1-100)</Label>
            <Input
              type="number"
              min="1"
              max="100"
              value={voucherQuantity}
              onChange={(e) => {
                const val = Math.min(100, Math.max(1, parseInt(e.target.value) || 1));
                setVoucherQuantity(val);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Prefix (3 chars max)</Label>
            <Input
              maxLength={3}
              value={voucherPrefix}
              onChange={(e) => setVoucherPrefix(e.target.value.toUpperCase())}
              placeholder="VIP"
            />
          </div>

          <div className="flex items-end">
            <Button
              onClick={() => generateVouchersMutation.mutate({ 
                packageId: selectedPackage, 
                quantity: voucherQuantity,
                prefix: voucherPrefix
              })}
              disabled={!selectedPackage || generateVouchersMutation.isPending}
              className="w-full"
            >
              {generateVouchersMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Sessions Section */}
      <Card>
        <CardHeader className="flex-row justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Active Sessions
            <Badge variant="secondary" className="ml-2">
              {activeSessions?.length || 0}
            </Badge>
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetchSessions()}
          >
            <Activity className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {activeSessions?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeSessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>{session.phone_number || "N/A"}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {session.mac_address}
                    </TableCell>
                    <TableCell>
                      {session.payments?.access_packages?.name || "Unknown"}
                    </TableCell>
                    <TableCell>
                      {new Date(session.expires_at).toLocaleTimeString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">
                        {session.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => disconnectSessionMutation.mutate({
                          sessionId: session.id
                        })}
                        disabled={disconnectSessionMutation.isPending}
                      >
                        {disconnectSessionMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Terminate"
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No active sessions found
            </div>
          )}
        </CardContent>
      </Card>
      <Toaster />
    </div>
  );
}