
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UseSessionTimeoutProps {
  sessionId?: string;
  onSessionExpired?: () => void;
}

export function useSessionTimeout({ sessionId, onSessionExpired }: UseSessionTimeoutProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [sessionData, setSessionData] = useState<any>(null);
  const { toast } = useToast();

  const checkSessionStatus = useCallback(async () => {
    if (!sessionId) return;

    try {
      const { data: session, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('status', 'active')
        .single();

      if (error || !session) {
        setIsExpired(true);
        onSessionExpired?.();
        return;
      }

      setSessionData(session);

      const expiresAt = new Date(session.expires_at).getTime();
      const now = new Date().getTime();
      const remaining = Math.max(0, expiresAt - now);

      setTimeRemaining(remaining);

      if (remaining <= 0) {
        setIsExpired(true);
        await handleSessionExpiry(sessionId);
        onSessionExpired?.();
      } else if (remaining <= 5 * 60 * 1000) { // 5 minutes warning
        showExpiryWarning(remaining);
      }
    } catch (error) {
      console.error('Error checking session status:', error);
    }
  }, [sessionId, onSessionExpired]);

  const handleSessionExpiry = async (sessionId: string) => {
    try {
      await supabase.functions.invoke('session-manager', {
        body: {
          action: 'deactivate',
          sessionId: sessionId,
          macAddress: sessionData?.mac_address
        }
      });

      toast({
        title: "Session Expired",
        description: "Your internet session has expired. Please purchase a new package to continue.",
        variant: "destructive",
      });
    } catch (error) {
      console.error('Error expiring session:', error);
    }
  };

  const showExpiryWarning = (remaining: number) => {
    const minutes = Math.ceil(remaining / (1000 * 60));
    
    if (minutes === 5 || minutes === 1) {
      toast({
        title: "Session Expiring Soon",
        description: `Your session will expire in ${minutes} minute${minutes > 1 ? 's' : ''}. Consider purchasing a new package.`,
        variant: "destructive",
      });
    }
  };

  const extendSession = async (additionalMinutes: number) => {
    if (!sessionId || !sessionData) return false;

    try {
      const newExpiryTime = new Date(sessionData.expires_at);
      newExpiryTime.setMinutes(newExpiryTime.getMinutes() + additionalMinutes);

      const { error } = await supabase
        .from('user_sessions')
        .update({ expires_at: newExpiryTime.toISOString() })
        .eq('id', sessionId);

      if (error) throw error;

      toast({
        title: "Session Extended",
        description: `Your session has been extended by ${additionalMinutes} minutes.`,
      });

      return true;
    } catch (error) {
      console.error('Error extending session:', error);
      return false;
    }
  };

  const formatTimeRemaining = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  useEffect(() => {
    if (!sessionId) return;

    // Initial check
    checkSessionStatus();

    // Set up interval to check every 30 seconds
    const interval = setInterval(checkSessionStatus, 30000);

    // Set up interval for countdown display (every second)
    const countdownInterval = setInterval(() => {
      setTimeRemaining(prev => Math.max(0, prev - 1000));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(countdownInterval);
    };
  }, [sessionId, checkSessionStatus]);

  return {
    timeRemaining,
    isExpired,
    sessionData,
    formatTimeRemaining,
    extendSession,
    checkSessionStatus
  };
}
