
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Wifi, Clock, Users, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type UserSession = Database["public"]["Tables"]["user_sessions"]["Row"];

interface SessionMonitorProps {
  macAddress: string;
}

export function SessionMonitor({ macAddress }: SessionMonitorProps) {
  const { toast } = useToast();

  const { data: currentSession, refetch } = useQuery({
    queryKey: ["current-session", macAddress],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("*, payments(*)")
        .eq("mac_address", macAddress)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: allSessions } = useQuery({
    queryKey: ["session-history", macAddress],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("*, payments(*)")
        .eq("mac_address", macAddress)
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
  });

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date().getTime();
    const expires = new Date(expiresAt).getTime();
    const remaining = expires - now;
    
    if (remaining <= 0) return "Expired";
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  };

  const getTimeProgress = (createdAt: string, expiresAt: string) => {
    const start = new Date(createdAt).getTime();
    const end = new Date(expiresAt).getTime();
    const now = new Date().getTime();
    
    const total = end - start;
    const elapsed = now - start;
    
    return Math.min(Math.max((elapsed / total) * 100, 0), 100);
  };

  const handleDisconnect = async () => {
    if (!currentSession) return;

    try {
      const { data, error } = await supabase.functions.invoke('session-manager', {
        body: {
          action: 'deactivate',
          sessionId: currentSession.id,
          macAddress: macAddress
        }
      });

      if (error) throw error;

      toast({
        title: "Disconnected",
        description: "You have been disconnected from the WiFi.",
      });

      refetch();
    } catch (error) {
      console.error('Disconnect error:', error);
      toast({
        title: "Disconnect Failed",
        description: "Failed to disconnect. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!currentSession) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Wifi className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No active session found</p>
          <p className="text-sm text-gray-500 mt-2">Purchase a package to get connected</p>
        </CardContent>
      </Card>
    );
  }

  const timeRemaining = getTimeRemaining(currentSession.expires_at || "");
  const progress = getTimeProgress(
    currentSession.created_at || "", 
    currentSession.expires_at || ""
  );

  return (
    <div className="space-y-6">
      {/* Active Session */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="h-5 w-5 mr-2 text-green-500" />
            Active Session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Status</span>
            <Badge variant="default" className="bg-green-500">
              {currentSession.status}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Time Remaining</span>
            <span className="font-semibold">{timeRemaining}</span>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Session Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Phone</span>
            <span className="text-sm">{currentSession.phone_number}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Started</span>
            <span className="text-sm">
              {new Date(currentSession.created_at || "").toLocaleString()}
            </span>
          </div>
          
          <Button 
            onClick={handleDisconnect}
            variant="outline" 
            className="w-full mt-4"
          >
            Disconnect Session
          </Button>
        </CardContent>
      </Card>

      {/* Session History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="h-5 w-5 mr-2" />
            Session History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {allSessions?.map((session) => (
              <div 
                key={session.id} 
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium">
                    {new Date(session.created_at || "").toLocaleDateString()}
                  </p>
                  <p className="text-xs text-gray-600">
                    {session.phone_number}
                  </p>
                </div>
                <Badge 
                  variant={session.status === 'active' ? 'default' : 'secondary'}
                  className={session.status === 'active' ? 'bg-green-500' : ''}
                >
                  {session.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
