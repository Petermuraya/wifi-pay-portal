
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, XCircle, RefreshCw, ArrowLeft, Wifi, Copy, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Payment = Database["public"]["Tables"]["payments"]["Row"];

interface PaymentStatusProps {
  payment: Payment;
  onBack: () => void;
}

export function PaymentStatus({ payment, onBack }: PaymentStatusProps) {
  const [pollingCount, setPollingCount] = useState(0);
  const maxPolling = 30; // Poll for 5 minutes (30 * 10 seconds)
  const { toast } = useToast();

  const { data: currentPayment, refetch } = useQuery({
    queryKey: ["payment-status", payment.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    initialData: payment,
    refetchInterval: (query) => {
      return query.state.data?.status === "pending" && pollingCount < maxPolling ? 10000 : false;
    },
  });

  useEffect(() => {
    if (currentPayment?.status === "pending" && pollingCount < maxPolling) {
      const timer = setTimeout(() => {
        setPollingCount(prev => prev + 1);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [currentPayment?.status, pollingCount, maxPolling]);

  const handleManualRefresh = () => {
    refetch();
    setPollingCount(prev => prev + 1);
  };

  const copyReconnectionCode = () => {
    if (currentPayment?.reconnection_code) {
      navigator.clipboard.writeText(currentPayment.reconnection_code);
      toast({
        title: "Code Copied",
        description: "Reconnection code copied to clipboard",
      });
    }
  };

  const getStatusIcon = () => {
    switch (currentPayment?.status) {
      case "completed":
        return <CheckCircle className="h-16 w-16 text-green-500" />;
      case "failed":
      case "expired":
        return <XCircle className="h-16 w-16 text-red-500" />;
      case "pending":
      default:
        return <Clock className="h-16 w-16 text-yellow-500" />;
    }
  };

  const getStatusMessage = () => {
    switch (currentPayment?.status) {
      case "completed":
        return {
          title: "Payment Successful!",
          description: "Your internet access is now active. You can start browsing immediately.",
          color: "text-green-600"
        };
      case "failed":
        return {
          title: "Payment Failed",
          description: "Your payment could not be processed. Please try again.",
          color: "text-red-600"
        };
      case "expired":
        return {
          title: "Payment Expired",
          description: "The payment request has expired. Please start a new payment.",
          color: "text-red-600"
        };
      case "pending":
      default:
        return {
          title: "Waiting for Payment",
          description: "Please check your phone for the M-Pesa prompt and complete the payment.",
          color: "text-yellow-600"
        };
    }
  };

  const status = getStatusMessage();

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center mb-4">
            <Button variant="ghost" size="sm" onClick={onBack} className="mr-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <CardTitle>Payment Status</CardTitle>
          </div>
        </CardHeader>
        
        <CardContent className="text-center space-y-6">
          {/* Status Icon */}
          <div className="flex justify-center">
            {getStatusIcon()}
          </div>

          {/* Status Message */}
          <div>
            <h3 className={`text-xl font-semibold mb-2 ${status.color}`}>
              {status.title}
            </h3>
            <p className="text-gray-600">
              {status.description}
            </p>
          </div>

          {/* Payment Details */}
          <Card className="bg-gray-50">
            <CardContent className="pt-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-semibold">KSh {currentPayment?.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Phone:</span>
                  <span>{currentPayment?.phone_number}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className={`capitalize font-semibold ${status.color}`}>
                    {currentPayment?.status}
                  </span>
                </div>
                {currentPayment?.mpesa_receipt_number && (
                  <div className="flex justify-between">
                    <span>Receipt:</span>
                    <span className="font-mono text-xs">{currentPayment.mpesa_receipt_number}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Reconnection Code for Completed Payments */}
          {currentPayment?.status === "completed" && currentPayment?.reconnection_code && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-800">Reconnection Code:</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyReconnectionCode}
                    className="h-6 p-1 text-blue-600"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <div className="bg-white rounded px-3 py-2 border border-blue-200">
                  <span className="font-mono text-lg font-bold text-blue-900">
                    {currentPayment.reconnection_code}
                  </span>
                </div>
                <p className="text-xs text-blue-600 mt-2">
                  <Key className="h-3 w-3 inline mr-1" />
                  Use this code to reconnect if you're not automatically connected
                </p>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="space-y-3">
            {currentPayment?.status === "pending" && (
              <Button 
                onClick={handleManualRefresh}
                variant="outline" 
                className="w-full"
                disabled={pollingCount >= maxPolling}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Payment Status
              </Button>
            )}

            {currentPayment?.status === "completed" && (
              <div className="flex items-center justify-center text-green-600 bg-green-50 rounded-lg p-4">
                <Wifi className="h-5 w-5 mr-2" />
                <span className="font-semibold">Internet Access Active</span>
              </div>
            )}

            {(currentPayment?.status === "failed" || currentPayment?.status === "expired") && (
              <Button onClick={onBack} className="w-full">
                Try Again
              </Button>
            )}
          </div>

          {currentPayment?.status === "pending" && pollingCount >= maxPolling && (
            <div className="text-xs text-gray-500 bg-yellow-50 rounded-lg p-3">
              <p>Payment verification timeout reached.</p>
              <p>If you completed the payment, please contact support.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
