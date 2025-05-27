
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Router, Globe, Settings, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function RouterIntegration() {
  const [portalUrl, setPortalUrl] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    // Get current portal URL
    setPortalUrl(window.location.origin);
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "Configuration copied successfully",
    });
  };

  const radiusConfig = `# FreeRADIUS Configuration for Captive Portal
# /etc/freeradius/3.0/clients.conf
client router {
    ipaddr = 192.168.1.1  # Your router IP
    secret = testing123   # Shared secret
    shortname = captive-router
}

# /etc/freeradius/3.0/sites-enabled/default
authorize {
    # Authorize users through captive portal
    if (User-Name =~ /^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/) {
        update control {
            Auth-Type := Accept
        }
    }
}`;

  const mikrotikConfig = `# MikroTik RouterOS Hotspot Configuration
/ip hotspot profile
add dns-name="wifi.local" hotspot-address=192.168.1.1 html-directory=hotspot \\
    login-by=http-chap,http-pap name=hsprof1 use-radius=yes

/ip hotspot
add address-pool=hs-pool-1 disabled=no interface=wlan1 name=hotspot1 profile=hsprof1

/radius
add address=192.168.1.100 secret=testing123 service=hotspot timeout=3s

# Walled Garden (allow access to portal without authentication)
/ip hotspot walled-garden
add comment="Portal Access" dst-host=${portalUrl.replace('https://', '').replace('http://', '')}`;

  const openwrtConfig = `# OpenWrt Configuration
# /etc/config/chilli

config chilli
    option disabled '0'
    option interface 'wlan0'
    option network '192.168.182.0/24'
    option uamlisten '192.168.182.1'
    option uamport '3990'
    option radiusserver1 '192.168.1.100'
    option radiusauthport '1812'
    option radiusacctport '1813'
    option radiussecret 'testing123'
    option uamserver '${portalUrl}'
    option uamsecret 'uamsecret123'`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Router className="h-5 w-5 mr-2" />
            Router Integration Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Portal URL</Label>
            <div className="flex items-center space-x-2 mt-1">
              <Input value={portalUrl} readOnly className="flex-1" />
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(portalUrl)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            <div>
              <h4 className="font-semibold mb-2">MikroTik RouterOS</h4>
              <Textarea
                value={mikrotikConfig}
                readOnly
                className="text-xs font-mono h-32"
              />
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => copyToClipboard(mikrotikConfig)}
              >
                Copy MikroTik Config
              </Button>
            </div>

            <div>
              <h4 className="font-semibold mb-2">OpenWrt/LEDE</h4>
              <Textarea
                value={openwrtConfig}
                readOnly
                className="text-xs font-mono h-24"
              />
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => copyToClipboard(openwrtConfig)}
              >
                Copy OpenWrt Config
              </Button>
            </div>

            <div>
              <h4 className="font-semibold mb-2">FreeRADIUS Server</h4>
              <Textarea
                value={radiusConfig}
                readOnly
                className="text-xs font-mono h-40"
              />
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => copyToClipboard(radiusConfig)}
              >
                Copy RADIUS Config
              </Button>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-semibold text-blue-800 mb-2">Setup Steps:</h4>
            <ol className="text-sm text-blue-700 space-y-1">
              <li>1. Configure your router with the appropriate config above</li>
              <li>2. Set up RADIUS server (if using external RADIUS)</li>
              <li>3. Add portal URL to walled garden/whitelist</li>
              <li>4. Test redirection by connecting a device</li>
              <li>5. Verify payment flow and internet access</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
