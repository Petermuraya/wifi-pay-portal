
import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";

interface ChatInputProps {
  message: string;
  setMessage: (message: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  isLoading: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

export function ChatInput({ 
  message, 
  setMessage, 
  onSendMessage, 
  onKeyPress, 
  isLoading,
  inputRef 
}: ChatInputProps) {
  return (
    <div className="p-4 border-t bg-gradient-to-r from-gray-50/50 to-white/50 backdrop-blur-sm">
      <form onSubmit={onSendMessage} className="space-y-2">
        <div className="flex space-x-2">
          <Textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={onKeyPress}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            className="flex-1 text-sm resize-none min-h-[40px] max-h-[120px] border-gray-200 focus:border-emerald-300 focus:ring-emerald-200 transition-colors"
            disabled={isLoading}
            rows={1}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!message.trim() || isLoading}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 px-4 shadow-lg"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-gray-500 text-center">
          🔒 Your conversation is private and secure
        </p>
      </form>
    </div>
  );
}
