
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PackageSelection } from "@/components/portal/PackageSelection";
import { PaymentForm } from "@/components/portal/PaymentForm";
import { PaymentStatus } from "@/components/portal/PaymentStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wifi, Shield, Clock } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AccessPackage = Database["public"]["Tables"]["access_packages"]["Row"];
type Payment = Database["public"]["Tables"]["payments"]["Row"];

export default function Portal() {
  const [selectedPackage, setSelectedPackage] = useState<AccessPackage | null>(null);
  const [currentPayment, setCurrentPayment] = useState<Payment | null>(null);
  const [userMacAddress, setUserMacAddress] = useState<string>("");

  // Simulate getting MAC address (in real implementation, this would come from the router)
  useEffect(() => {
    // Generate a mock MAC address for demo purposes
    const mockMac = "00:1B:44:11:3A:B7";
    setUserMacAddress(mockMac);
  }, []);

  const { data: packages, isLoading } = useQuery({
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
  });

  const handlePackageSelect = (pkg: AccessPackage) => {
    setSelectedPackage(pkg);
  };

  const handlePaymentCreated = (payment: Payment) => {
    setCurrentPayment(payment);
  };

  const handleBackToPackages = () => {
    setSelectedPackage(null);
    setCurrentPayment(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading WiFi packages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Wifi className="h-12 w-12 text-indigo-600 mr-3" />
            <h1 className="text-4xl font-bold text-gray-900">WiFi Portal</h1>
          </div>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Welcome! Select an internet access package and pay via M-Pesa to get connected.
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card className="text-center">
            <CardContent className="pt-6">
              <Shield className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <h3 className="font-semibold mb-1">Secure Payment</h3>
              <p className="text-sm text-gray-600">Pay safely via M-Pesa</p>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-6">
              <Clock className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <h3 className="font-semibold mb-1">Instant Access</h3>
              <p className="text-sm text-gray-600">Get connected immediately after payment</p>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-6">
              <Wifi className="h-8 w-8 text-purple-600 mx-auto mb-2" />
              <h3 className="font-semibold mb-1">High Speed</h3>
              <p className="text-sm text-gray-600">Enjoy fast and reliable internet</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto">
          {currentPayment ? (
            <PaymentStatus 
              payment={currentPayment}
              onBack={handleBackToPackages}
            />
          ) : selectedPackage ? (
            <PaymentForm
              package={selectedPackage}
              macAddress={userMacAddress}
              onPaymentCreated={handlePaymentCreated}
              onBack={handleBackToPackages}
            />
          ) : (
            <PackageSelection
              packages={packages || []}
              onSelectPackage={handlePackageSelect}
            />
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-gray-500 text-sm">
          <p>Need help? Contact support at support@wifiportal.com</p>
          <p className="mt-1">Device MAC: {userMacAddress}</p>
        </div>
      </div>
    </div>
  );
}
