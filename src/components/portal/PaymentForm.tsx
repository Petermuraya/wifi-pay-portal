
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Smartphone, CreditCard } from "lucide-react";
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

export function PaymentForm({ package: pkg, macAddress, onPaymentCreated, onBack }: PaymentFormProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const { toast } = useToast();

  const createPaymentMutation = useMutation({
    mutationFn: async ({ phoneNumber }: { phoneNumber: string }) => {
      // Create user session
      const { data: session, error: sessionError } = await supabase
        .from("user_sessions")
        .insert({
          mac_address: macAddress,
          phone_number: phoneNumber,
          expires_at: new Date(Date.now() + pkg.duration_minutes * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Create payment record
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .insert({
          session_id: session.id,
          phone_number: phoneNumber,
          amount: pkg.price,
          status: "pending",
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      return payment;
    },
    onSuccess: (payment) => {
      toast({
        title: "Payment Initiated",
        description: "Please check your phone for the M-Pesa prompt.",
      });
      onPaymentCreated(payment);
    },
    onError: (error) => {
      console.error("Payment creation failed:", error);
      toast({
        title: "Error",
        description: "Failed to initiate payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phoneNumber) {
      toast({
        title: "Phone Number Required",
        description: "Please enter your M-Pesa phone number.",
        variant: "destructive",
      });
      return;
    }

    // Basic phone number validation for Kenya
    const cleanPhone = phoneNumber.replace(/\s/g, "");
    if (!/^(254|0)[7][0-9]{8}$/.test(cleanPhone)) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid Kenyan phone number (07XXXXXXXX or 254XXXXXXXXX).",
        variant: "destructive",
      });
      return;
    }

    createPaymentMutation.mutate({ phoneNumber: cleanPhone });
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} minutes`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hours`;
    return `${Math.floor(minutes / 1440)} days`;
  };

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center mb-4">
            <Button variant="ghost" size="sm" onClick={onBack} className="mr-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <CardTitle>Complete Payment</CardTitle>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Package Summary */}
          <Card className="bg-gray-50">
            <CardContent className="pt-4">
              <h3 className="font-semibold mb-2">{pkg.name}</h3>
              <div className="space-y-1 text-sm text-gray-600">
                <p>Duration: {formatDuration(pkg.duration_minutes)}</p>
                <p>Amount: KSh {pkg.price}</p>
              </div>
            </CardContent>
          </Card>

          {/* Payment Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="phone">M-Pesa Phone Number</Label>
              <div className="relative mt-1">
                <Smartphone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="07XXXXXXXX or 254XXXXXXXXX"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Enter your Safaricom number to receive the payment prompt
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={createPaymentMutation.isPending}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              {createPaymentMutation.isPending ? "Processing..." : `Pay KSh ${pkg.price}`}
            </Button>
          </form>

          <div className="text-center text-xs text-gray-500">
            <p>You will receive an M-Pesa prompt on your phone</p>
            <p>Complete the payment to get internet access</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
