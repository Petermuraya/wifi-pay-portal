
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shield, Ticket, Users, Activity, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function AdminPanel() {
  const [adminKey, setAdminKey] = useState("");
  const [selectedPackage, setSelectedPackage] = useState("");
  const [voucherQuantity, setVoucherQuantity] = useState(1);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { toast } = useToast();

  const { data: packages } = useQuery({
    queryKey: ["access-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_packages")
        .select("*")
        .eq("is_active", true);
      
      if (error) throw error;
      return data;
    },
  });

  const { data: activeSessions, refetch: refetchSessions } = useQuery({
    queryKey: ["active-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("*, payments(*)")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const generateVouchersMutation = useMutation({
    mutationFn: async ({ packageId, quantity }: { packageId: string; quantity: number }) => {
      const { data, error } = await supabase.functions.invoke('voucher-generator', {
        body: {
          action: 'generate',
          packageId: packageId,
          quantity: quantity,
          adminKey: adminKey
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Vouchers Generated",
        description: `Successfully generated ${data.vouchers.length} voucher(s).`,
      });
      
      // Download vouchers as CSV
      downloadVouchers(data.vouchers);
    },
    onError: (error) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate vouchers.",
        variant: "destructive",
      });
    },
  });

  const disconnectSessionMutation = useMutation({
    mutationFn: async ({ sessionId, macAddress }: { sessionId: string; macAddress: string }) => {
      const { data, error } = await supabase.functions.invoke('session-manager', {
        body: {
          action: 'deactivate',
          sessionId: sessionId,
          macAddress: macAddress
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Session Disconnected",
        description: "User has been disconnected successfully.",
      });
      refetchSessions();
    },
    onError: (error) => {
      toast({
        title: "Disconnect Failed",
        description: "Failed to disconnect user session.",
        variant: "destructive",
      });
    },
  });

  const handleLogin = () => {
    if (adminKey.length >= 8) {
      setIsAuthenticated(true);
      toast({
        title: "Admin Access Granted",
        description: "You now have access to the admin panel.",
      });
    } else {
      toast({
        title: "Invalid Admin Key",
        description: "Please enter a valid admin key.",
        variant: "destructive",
      });
    }
  };

  const downloadVouchers = (vouchers: any[]) => {
    const csv = [
      "Code,Package,Status,Created",
      ...vouchers.map(v => `${v.code},${v.package_id},${v.status},${v.created_at}`)
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vouchers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isAuthenticated) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            Admin Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="adminKey">Admin Key</Label>
            <Input
              id="adminKey"
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Enter admin key"
            />
          </div>
          <Button onClick={handleLogin} className="w-full">
            Access Admin Panel
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Voucher Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Ticket className="h-5 w-5 mr-2" />
            Generate Vouchers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="package">Package</Label>
              <Select value={selectedPackage} onValueChange={setSelectedPackage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select package" />
                </SelectTrigger>
                <SelectContent>
                  {packages?.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.name} - KSh {pkg.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                max="100"
                value={voucherQuantity}
                onChange={(e) => setVoucherQuantity(parseInt(e.target.value) || 1)}
              />
            </div>
            
            <div className="flex items-end">
              <Button 
                onClick={() => generateVouchersMutation.mutate({ 
                  packageId: selectedPackage, 
                  quantity: voucherQuantity 
                })}
                disabled={!selectedPackage || generateVouchersMutation.isPending}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Generate & Download
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Users className="h-5 w-5 mr-2" />
              Active Sessions ({activeSessions?.length || 0})
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetchSessions()}
            >
              <Activity className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {activeSessions?.map((session) => (
              <div 
                key={session.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1">
                  <p className="font-medium">{session.phone_number}</p>
                  <p className="text-sm text-gray-600">MAC: {session.mac_address}</p>
                  <p className="text-xs text-gray-500">
                    Expires: {new Date(session.expires_at || "").toLocaleString()}
                  </p>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Badge variant="default" className="bg-green-500">
                    {session.status}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectSessionMutation.mutate({
                      sessionId: session.id,
                      macAddress: session.mac_address
                    })}
                    disabled={disconnectSessionMutation.isPending}
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            ))}
            
            {(!activeSessions || activeSessions.length === 0) && (
              <p className="text-center text-gray-500 py-8">
                No active sessions found
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
