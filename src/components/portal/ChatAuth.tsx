
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, Lock, User, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface ChatAuthProps {
  onAuthenticated: (username: string) => void;
  onClose: () => void;
}

export function ChatAuth({ onAuthenticated, onClose }: ChatAuthProps) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !pin.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter both username and PIN",
        variant: "destructive",
      });
      return;
    }

    if (pin.length < 4) {
      toast({
        title: "Invalid PIN",
        description: "PIN must be at least 4 digits",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    // Store auth info in localStorage for session persistence
    const authData = {
      username: username.trim(),
      pin,
      timestamp: Date.now()
    };
    
    localStorage.setItem('wifi_chat_auth', JSON.stringify(authData));
    
    setTimeout(() => {
      setIsLoading(false);
      onAuthenticated(username.trim());
      toast({
        title: "Welcome!",
        description: `Hello ${username.trim()}, you're now connected to WiFi Assistant`,
      });
    }, 1000);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 h-[500px]">
      <Card className="h-full flex flex-col shadow-2xl border-2 border-emerald-200 bg-white/95 backdrop-blur-lg rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1 bg-white/20 rounded-full">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">WiFi Assistant</CardTitle>
                <p className="text-xs opacity-90">Secure Access Required</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0 text-white hover:bg-white/20"
            >
              ×
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col justify-center p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Secure Chat Access</h3>
            <p className="text-sm text-gray-600">
              Create a unique username and 4-digit PIN to access your private WiFi Assistant session
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-gray-700">
                Username
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="pl-10 border-gray-200 focus:border-emerald-300 focus:ring-emerald-200"
                  maxLength={20}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pin" className="text-sm font-medium text-gray-700">
                4-Digit PIN
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="pin"
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="Enter 4-digit PIN"
                  className="pl-10 pr-10 border-gray-200 focus:border-emerald-300 focus:ring-emerald-200"
                  maxLength={4}
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
                >
                  {showPin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all duration-200"
              disabled={isLoading || !username.trim() || pin.length < 4}
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Connecting...</span>
                </div>
              ) : (
                "Start Chat Session"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              🔒 Your credentials are stored locally for this session only
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
