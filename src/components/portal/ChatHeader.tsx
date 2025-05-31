
import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardTitle } from "@/components/ui/card";
import { 
  Bot, 
  Minimize2, 
  Maximize2,
  Trash2,
  RefreshCw,
  X,
  Power
} from "lucide-react";

interface ChatHeaderProps {
  isExpanded: boolean;
  isOnline: boolean;
  onToggleExpand: () => void;
  onClearConversation: () => void;
  onRefresh: () => void;
  onEndConversation: () => void;
  clearLoading: boolean;
}

export function ChatHeader({ 
  isExpanded, 
  isOnline,
  onToggleExpand, 
  onClearConversation, 
  onRefresh, 
  onEndConversation,
  clearLoading 
}: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div className="p-1 bg-white/20 rounded-full">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <CardTitle className="text-sm font-semibold">WiFi Assistant</CardTitle>
          <p className="text-xs opacity-90">Premium AI Support</p>
        </div>
        <Badge 
          variant="secondary" 
          className={`text-xs border-none ${
            isOnline ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          }`}
        >
          {isOnline ? 'Online' : 'Offline'}
        </Badge>
      </div>
      <div className="flex items-center space-x-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleExpand}
          className="h-6 w-6 p-0 text-white hover:bg-white/20 transition-colors"
          title={isExpanded ? "Minimize" : "Expand"}
        >
          {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearConversation}
          className="h-6 w-6 p-0 text-white hover:bg-white/20 transition-colors"
          title="Clear conversation"
          disabled={clearLoading}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="h-6 w-6 p-0 text-white hover:bg-white/20 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEndConversation}
          className="h-6 w-6 p-0 text-white hover:bg-red-400/20 transition-colors"
          title="End conversation"
        >
          <Power className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
