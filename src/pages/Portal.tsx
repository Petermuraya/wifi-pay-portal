
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { PackageSelection } from "@/components/portal/PackageSelection";
import { PaymentForm } from "@/components/portal/PaymentForm";
import { PaymentStatus } from "@/components/portal/PaymentStatus";
import { VoucherRedemption } from "@/components/portal/VoucherRedemption";
import { SessionMonitor } from "@/components/portal/SessionMonitor";
import { AdminPanel } from "@/components/portal/AdminPanel";
import { RouterIntegration } from "@/components/portal/RouterIntegration";
import { RedirectHandler } from "@/components/portal/RedirectHandler";
import { SessionTimeoutManager } from "@/components/portal/SessionTimeoutManager";
import { ReconnectionCode } from "@/components/portal/ReconnectionCode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Wifi, 
  Shield, 
  Clock, 
  Gift, 
  Activity, 
  Router, 
  Globe,
  Loader2,
  HelpCircle,
  Settings,
  User,
  CreditCard
} from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import type { Database } from "@/integrations/supabase/types";
import { ChatBot } from "@/components/portal/ChatBot";

type AccessPackage = Database["public"]["Tables"]["access_packages"]["Row"];
type Payment = Database["public"]["Tables"]["payments"]["Row"];

const TAB_CONFIG = [
  { id: "packages", icon: Wifi, label: "Packages" },
  { id: "voucher", icon: Gift, label: "Voucher" },
  { id: "reconnect", icon: Shield, label: "Reconnect" },
  { id: "monitor", icon: Activity, label: "Session" },
  { id: "redirect", icon: Globe, label: "Redirect" },
  { id: "router", icon: Router, label: "Router" },
  { id: "admin", icon: Settings, label: "Admin" }
] as const;

type TabId = typeof TAB_CONFIG[number]['id'];

export default function Portal() {
  const [selectedPackage, setSelectedPackage] = useState<AccessPackage | null>(null);
  const [currentPayment, setCurrentPayment] = useState<Payment | null>(null);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [userMacAddress, setUserMacAddress] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabId>("packages");
  const [isLoadingMac, setIsLoadingMac] = useState(true);
  const { toast } = useToast();

  // Enhanced MAC address detection with error handling
  useEffect(() => {
    const detectMacAddress = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const macParam = urlParams.get('mac');
        const origParam = urlParams.get('orig') || urlParams.get('redirect') || urlParams.get('url');
        
        if (macParam) {
          setUserMacAddress(macParam);
        } else {
          // In production, you might want to implement a proper MAC detection fallback
          const mockMac = "00:1B:44:11:3A:B7";
          setUserMacAddress(mockMac);
          toast({
            title: "Demo Mode",
            description: "Using demo MAC address for testing purposes",
            variant: "default",
          });
        }

        if (origParam) {
          setActiveTab("redirect");
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Could not detect your device information",
          variant: "destructive",
        });
      } finally {
        setIsLoadingMac(false);
      }
    };

    detectMacAddress();
  }, [toast]);

  // Enhanced data fetching with error handling
  const { 
    data: packages, 
    isLoading: isLoadingPackages,
    error: packagesError 
  } = useQuery({
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
    staleTime: 1000 * 60 * 5 // 5 minutes
  });

  useEffect(() => {
    if (packagesError) {
      toast({
        title: "Connection Error",
        description: "Failed to load packages. Please check your connection.",
        variant: "destructive",
      });
    }
  }, [packagesError, toast]);

  const handlePackageSelect = (pkg: AccessPackage) => {
    setSelectedPackage(pkg);
    // Analytics event could be tracked here
  };

  const handlePaymentCreated = (payment: Payment) => {
    setCurrentPayment(payment);
    toast({
      title: "Payment Initiated",
      description: "Your payment request has been created successfully",
    });
  };

  const handleBackToPackages = () => {
    setSelectedPackage(null);
    setCurrentPayment(null);
  };

  const handleSessionCreated = (session: any) => {
    setCurrentSession(session);
    setActiveTab("monitor");
    sessionStorage.setItem('captive_portal_auth', 'success');
    
    toast({
      title: "Session Started",
      description: `You now have ${session.duration_minutes} minutes of access`,
    });
  };

  const handleSessionExpired = () => {
    setCurrentSession(null);
    setActiveTab("packages");
    sessionStorage.removeItem('captive_portal_auth');
    
    toast({
      title: "Session Ended",
      description: "Your WiFi access has expired",
    });
  };

  if (isLoadingPackages || isLoadingMac) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="mx-auto"
          >
            <Loader2 className="h-12 w-12 text-indigo-600" />
          </motion.div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-800">
              {isLoadingMac ? "Detecting your device" : "Loading WiFi packages"}
            </h2>
            <Progress value={isLoadingMac ? 30 : 70} className="w-48 mx-auto" />
            <p className="text-slate-500 text-sm">
              {isLoadingMac ? "Reading network information..." : "Fetching available options..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50">
      <Toaster />
      
      {/* Header with Stripe-inspired styling */}
      <header className="bg-white/80 backdrop-blur-lg shadow-sm border-b border-slate-200/50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
              <Wifi className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
              Premium WiFi Portal
            </h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" className="text-slate-600 hover:text-indigo-600 hover:bg-indigo-50">
              <HelpCircle className="h-4 w-4 mr-2" />
              Help
            </Button>
            {currentSession && (
              <div className="flex items-center space-x-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-sm font-medium text-slate-600">Connected</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* User status bar with Stripe-inspired design */}
        <div className="bg-white/70 backdrop-blur-lg rounded-xl shadow-sm p-4 mb-6 flex justify-between items-center border border-slate-200/50">
          <div className="flex items-center space-x-4">
            <div className="p-2 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl">
              <User className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Device ID</p>
              <p className="font-mono text-sm text-slate-800">{userMacAddress}</p>
            </div>
          </div>
          
          {currentSession && (
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-500">Session Time</p>
                <p className="text-sm font-medium text-slate-800">
                  {currentSession.duration_minutes} minutes remaining
                </p>
              </div>
              <Clock className="h-5 w-5 text-slate-400" />
            </div>
          )}
        </div>

        {/* Navigation Tabs with Stripe-inspired design */}
        <div className="max-w-6xl mx-auto mb-8">
          <div className="flex flex-wrap gap-2 justify-center bg-white/50 backdrop-blur-lg rounded-2xl p-2 border border-slate-200/50">
            {TAB_CONFIG.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "default" : "ghost"}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center transition-all rounded-xl ${
                  activeTab === tab.id 
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' 
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50'
                }`}
                size="sm"
              >
                <tab.icon className="h-4 w-4 mr-2" />
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Main Content with smooth transitions */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="max-w-4xl mx-auto"
          >
            <div className="grid gap-6">
              {/* Session Timeout Manager */}
              {currentSession && (
                <SessionTimeoutManager 
                  sessionId={currentSession.id}
                  onSessionExpired={handleSessionExpired}
                />
              )}

              {/* Content Switching */}
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
              ) : activeTab === "packages" ? (
                <PackageSelection
                  packages={packages || []}
                  onSelectPackage={handlePackageSelect}
                />
              ) : activeTab === "voucher" ? (
                <VoucherRedemption
                  macAddress={userMacAddress}
                  onSessionCreated={handleSessionCreated}
                />
              ) : activeTab === "reconnect" ? (
                <ReconnectionCode
                  macAddress={userMacAddress}
                  onSessionActivated={handleSessionCreated}
                />
              ) : activeTab === "monitor" ? (
                <SessionMonitor macAddress={userMacAddress} />
              ) : activeTab === "redirect" ? (
                <RedirectHandler userMacAddress={userMacAddress} />
              ) : activeTab === "router" ? (
                <RouterIntegration />
              ) : activeTab === "admin" ? (
                <AdminPanel />
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Enhanced Footer with Stripe-inspired design */}
      <footer className="bg-white/60 backdrop-blur-lg border-t border-slate-200/50 mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-4 mb-4 md:mb-0">
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-500">Secure Connection</span>
              </div>
              <div className="flex items-center space-x-2">
                <CreditCard className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-500">PCI Compliant</span>
              </div>
            </div>
            
            <div className="text-center md:text-right">
              <p className="text-sm text-slate-500">
                © {new Date().getFullYear()} Premium WiFi Services. All rights reserved.
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Need help? <a href="mailto:support@premiumwifi.com" className="text-indigo-600 hover:underline">Contact our support team</a>
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* Add ChatBot */}
      {!isLoadingMac && userMacAddress && (
        <ChatBot
          macAddress={userMacAddress}
          phoneNumber={currentSession?.phone_number}
          onSessionCreated={handleSessionCreated}
        />
      )}
    </div>
  );
}
