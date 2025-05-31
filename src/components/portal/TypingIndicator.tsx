
import React from "react";
import { Bot, Loader2 } from "lucide-react";

export function TypingIndicator() {
  return (
    <div className="flex items-start space-x-3 animate-fade-in">
      <div className="p-2 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full shadow-sm">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl rounded-tl-sm p-4 max-w-[240px] shadow-sm border border-emerald-100">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <span className="text-sm text-gray-600">Assistant is typing...</span>
        </div>
      </div>
    </div>
  );
}
