
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ticket, Gift } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type UserSession = Database["public"]["Tables"]["user_sessions"]["Row"];

interface VoucherRedemptionProps {
  macAddress: string;
  onSessionCreated: (session: UserSession) => void;
}

export function VoucherRedemption({ macAddress, onSessionCreated }: VoucherRedemptionProps) {
  const [voucherCode, setVoucherCode] = useState("");
  const { toast } = useToast();

  const redeemVoucherMutation = useMutation({
    mutationFn: async ({ voucherCode }: { voucherCode: string }) => {
      const { data, error } = await supabase.functions.invoke('voucher-generator', {
        body: {
          action: 'redeem',
          voucherCode: voucherCode.toUpperCase(),
          macAddress: macAddress
        }
      });

      if (error) {
        console.error('Voucher redemption error:', error);
        throw new Error('Failed to redeem voucher');
      }

      if (!data.success) {
        throw new Error(data.error || 'Voucher redemption failed');
      }

      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Voucher Redeemed!",
        description: `Your ${data.package.name} access is now active.`,
      });
      onSessionCreated(data.session);
    },
    onError: (error) => {
      console.error("Voucher redemption failed:", error);
      toast({
        title: "Redemption Failed",
        description: error.message || "Invalid voucher code or already used.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!voucherCode || voucherCode.length !== 8) {
      toast({
        title: "Invalid Voucher Code",
        description: "Please enter a valid 8-character voucher code.",
        variant: "destructive",
      });
      return;
    }

    redeemVoucherMutation.mutate({ voucherCode });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Gift className="h-5 w-5 mr-2 text-purple-500" />
          Redeem Voucher
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="voucher">Voucher Code</Label>
            <div className="relative mt-1">
              <Ticket className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="voucher"
                type="text"
                placeholder="Enter 8-character code"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                className="pl-10 uppercase"
                maxLength={8}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Enter your voucher code to get instant internet access
            </p>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={redeemVoucherMutation.isPending}
          >
            <Gift className="h-4 w-4 mr-2" />
            {redeemVoucherMutation.isPending ? "Redeeming..." : "Redeem Voucher"}
          </Button>
        </form>

        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-700">
            <strong>Note:</strong> Voucher codes are 8 characters long and can only be used once. 
            Contact support if you need assistance.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
