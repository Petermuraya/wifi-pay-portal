
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wifi, Key, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReconnectionCodeProps {
  macAddress: string;
  onSessionActivated?: (session: any) => void;
}

export function ReconnectionCode({ macAddress, onSessionActivated }: ReconnectionCodeProps) {
  const [reconnectionCode, setReconnectionCode] = useState("");
  const { toast } = useToast();

  const reconnectMutation = useMutation({
    mutationFn: async ({ code }: { code: string }) => {
      // Find payment with the reconnection code
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .select("*, user_sessions(*)")
        .eq("reconnection_code", code)
        .eq("reconnection_code_used", false)
        .eq("status", "completed")
        .single();

      if (paymentError || !payment) {
        throw new Error("Invalid or already used reconnection code");
      }

      // Check if the MAC address matches the session
      if (payment.user_sessions?.mac_address !== macAddress) {
        throw new Error("This reconnection code is not valid for your device");
      }

      // Mark the reconnection code as used
      const { error: updateError } = await supabase
        .from("payments")
        .update({ reconnection_code_used: true })
        .eq("id", payment.id);

      if (updateError) throw updateError;

      // Activate the session
      const { data: session, error: sessionError } = await supabase
        .from("user_sessions")
        .update({ 
          status: "active",
          updated_at: new Date().toISOString()
        })
        .eq("id", payment.session_id)
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Call RADIUS auth
      const { error: radiusError } = await supabase.functions.invoke('radius-auth', {
        body: { 
          action: 'authorize', 
          sessionId: session.id, 
          macAddress: macAddress 
        }
      });

      if (radiusError) {
        console.error('RADIUS auth error:', radiusError);
      }

      return session;
    },
    onSuccess: (session) => {
      toast({
        title: "Reconnection Successful!",
        description: "Your internet access has been restored.",
      });
      onSessionActivated?.(session);
    },
    onError: (error) => {
      toast({
        title: "Reconnection Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!reconnectionCode || reconnectionCode.length !== 6) {
      toast({
        title: "Invalid Code",
        description: "Please enter a valid 6-digit reconnection code.",
        variant: "destructive",
      });
      return;
    }

    reconnectMutation.mutate({ code: reconnectionCode });
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Key className="h-5 w-5 mr-2 text-blue-500" />
          Reconnection Code
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="text-center">
          <Wifi className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            Enter your unique reconnection code to restore internet access
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="reconnection-code">6-Digit Reconnection Code</Label>
            <Input
              id="reconnection-code"
              type="text"
              placeholder="000000"
              value={reconnectionCode}
              onChange={(e) => setReconnectionCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-lg font-mono"
              maxLength={6}
            />
            <p className="text-xs text-gray-500 mt-1">
              This code was provided after your M-Pesa payment
            </p>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={reconnectMutation.isPending || reconnectionCode.length !== 6}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {reconnectMutation.isPending ? "Reconnecting..." : "Reconnect to Internet"}
          </Button>
        </form>

        <div className="text-center text-xs text-gray-500 bg-yellow-50 rounded-lg p-3">
          <p><strong>Note:</strong> Each reconnection code can only be used once.</p>
          <p>If you don't have a code, please make a new payment.</p>
        </div>
      </CardContent>
    </Card>
  );
}
