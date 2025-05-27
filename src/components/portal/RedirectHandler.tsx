
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, ExternalLink, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RedirectHandlerProps {
  userMacAddress: string;
}

export function RedirectHandler({ userMacAddress }: RedirectHandlerProps) {
  const [originalUrl, setOriginalUrl] = useState<string>("");
  const [userAgent, setUserAgent] = useState<string>("");
  const [redirectStatus, setRedirectStatus] = useState<"pending" | "authenticated" | "completed">("pending");
  const { toast } = useToast();

  useEffect(() => {
    // Parse URL parameters to get original destination
    const urlParams = new URLSearchParams(window.location.search);
    const orig = urlParams.get('orig') || urlParams.get('redirect') || urlParams.get('url');
    const ua = navigator.userAgent;
    
    if (orig) {
      setOriginalUrl(decodeURIComponent(orig));
    } else {
      // Default redirect URL if none provided
      setOriginalUrl('https://www.google.com');
    }
    
    setUserAgent(ua);

    // Listen for successful authentication
    const handleAuthentication = () => {
      setRedirectStatus("authenticated");
      setTimeout(() => {
        handleRedirectToOriginal();
      }, 2000);
    };

    // Check for authentication success in session storage
    const checkAuthStatus = () => {
      const authStatus = sessionStorage.getItem('captive_portal_auth');
      if (authStatus === 'success') {
        handleAuthentication();
      }
    };

    checkAuthStatus();
    const interval = setInterval(checkAuthStatus, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleRedirectToOriginal = () => {
    setRedirectStatus("completed");
    
    toast({
      title: "Redirecting...",
      description: `Taking you to ${originalUrl}`,
    });

    // Clear auth status
    sessionStorage.removeItem('captive_portal_auth');
    
    // Redirect after a short delay
    setTimeout(() => {
      window.location.href = originalUrl;
    }, 1000);
  };

  const detectDeviceType = () => {
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'Mobile Device';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'Tablet';
    } else {
      return 'Desktop/Laptop';
    }
  };

  const generateRedirectUrl = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}?orig=${encodeURIComponent(originalUrl)}&mac=${userMacAddress}`;
  };

  if (redirectStatus === "completed") {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-green-600">Redirecting...</h3>
          <p className="text-gray-600">Taking you to your original destination</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Globe className="h-5 w-5 mr-2" />
          Redirect Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {redirectStatus === "authenticated" && (
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="flex items-center text-green-700">
              <ArrowRight className="h-4 w-4 mr-2" />
              <span className="font-semibold">Authentication Successful!</span>
            </div>
            <p className="text-green-600 text-sm mt-1">
              You will be redirected to your original destination shortly...
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">Device Type</span>
            <Badge variant="outline">{detectDeviceType()}</Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">Status</span>
            <Badge 
              variant={redirectStatus === "authenticated" ? "default" : "secondary"}
              className={redirectStatus === "authenticated" ? "bg-green-500" : ""}
            >
              {redirectStatus === "authenticated" ? "Authenticated" : "Waiting for Payment"}
            </Badge>
          </div>

          {originalUrl && (
            <div>
              <span className="text-sm font-medium text-gray-600">Original Destination</span>
              <div className="mt-1 p-2 bg-gray-50 rounded border text-sm break-all">
                {originalUrl}
              </div>
            </div>
          )}

          <div>
            <span className="text-sm font-medium text-gray-600">MAC Address</span>
            <div className="mt-1 p-2 bg-gray-50 rounded border text-sm font-mono">
              {userMacAddress}
            </div>
          </div>
        </div>

        {redirectStatus === "pending" && (
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-blue-700 text-sm">
              <strong>Next Steps:</strong> Complete your payment or redeem a voucher above. 
              Once authenticated, you'll be automatically redirected to your original destination.
            </p>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(originalUrl, '_blank')}
          className="w-full"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Preview Destination
        </Button>
      </CardContent>
    </Card>
  );
}
