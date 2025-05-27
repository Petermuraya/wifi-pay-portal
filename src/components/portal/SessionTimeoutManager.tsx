
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock, AlertTriangle, Wifi } from "lucide-react";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";

interface SessionTimeoutManagerProps {
  sessionId?: string;
  onSessionExpired?: () => void;
}

export function SessionTimeoutManager({ sessionId, onSessionExpired }: SessionTimeoutManagerProps) {
  const {
    timeRemaining,
    isExpired,
    sessionData,
    formatTimeRemaining,
    extendSession
  } = useSessionTimeout({ sessionId, onSessionExpired });

  if (!sessionId || isExpired) {
    return (
      <Card className="border-red-200">
        <CardContent className="pt-6 text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-600 mb-2">Session Expired</h3>
          <p className="text-gray-600">Your internet session has ended. Purchase a new package to continue browsing.</p>
        </CardContent>
      </Card>
    );
  }

  if (!sessionData) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading session information...</p>
        </CardContent>
      </Card>
    );
  }

  const totalDuration = new Date(sessionData.expires_at).getTime() - new Date(sessionData.created_at).getTime();
  const elapsed = totalDuration - timeRemaining;
  const progressPercentage = Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);
  
  const isWarningTime = timeRemaining <= 5 * 60 * 1000; // 5 minutes
  const isCriticalTime = timeRemaining <= 1 * 60 * 1000; // 1 minute

  return (
    <Card className={`${isWarningTime ? 'border-orange-200' : ''} ${isCriticalTime ? 'border-red-200' : ''}`}>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Clock className={`h-5 w-5 mr-2 ${isCriticalTime ? 'text-red-500' : isWarningTime ? 'text-orange-500' : 'text-blue-500'}`} />
          Session Timer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <div className={`text-2xl font-bold ${isCriticalTime ? 'text-red-600' : isWarningTime ? 'text-orange-600' : 'text-blue-600'}`}>
            {formatTimeRemaining(timeRemaining)}
          </div>
          <p className="text-sm text-gray-600">Time remaining</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Session Progress</span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
          <Progress 
            value={progressPercentage} 
            className={`h-2 ${isCriticalTime ? 'bg-red-100' : isWarningTime ? 'bg-orange-100' : ''}`}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Started</span>
            <p className="font-medium">
              {new Date(sessionData.created_at).toLocaleTimeString()}
            </p>
          </div>
          <div>
            <span className="text-gray-600">Expires</span>
            <p className="font-medium">
              {new Date(sessionData.expires_at).toLocaleTimeString()}
            </p>
          </div>
        </div>

        {isWarningTime && (
          <div className={`p-3 rounded-lg ${isCriticalTime ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'}`}>
            <div className="flex items-center">
              <AlertTriangle className={`h-4 w-4 mr-2 ${isCriticalTime ? 'text-red-600' : 'text-orange-600'}`} />
              <span className={`text-sm font-medium ${isCriticalTime ? 'text-red-800' : 'text-orange-800'}`}>
                {isCriticalTime ? 'Session Ending Soon!' : 'Session Expiring Soon'}
              </span>
            </div>
            <p className={`text-sm mt-1 ${isCriticalTime ? 'text-red-700' : 'text-orange-700'}`}>
              Consider purchasing a new package to maintain internet access.
            </p>
          </div>
        )}

        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => window.location.href = '/'}
          >
            <Wifi className="h-4 w-4 mr-2" />
            Buy More Time
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
