
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { ChatHeader } from "./ChatHeader";
import { ChatInput } from "./ChatInput";
import { TypingIndicator } from "./TypingIndicator";
import { useChatConversation } from "@/hooks/useChatConversation";

interface ChatBotProps {
  macAddress: string;
  phoneNumber?: string;
  onSessionCreated?: (session: any) => void;
}

export function ChatBot({ macAddress, phoneNumber, onSessionCreated }: ChatBotProps) {
  const [isMinimized, setIsMinimized] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    message,
    setMessage,
    isOnline,
    messagesEndRef,
    inputRef,
    messages,
    messagesLoading,
    handleSendMessage,
    handleKeyPress,
    handleClearConversation,
    handleEndConversation,
    refetchMessages,
    sendMessagePending,
    clearLoading,
  } = useChatConversation({ macAddress, phoneNumber, onSessionCreated });

  // Focus input when opened
  useEffect(() => {
    if (!isMinimized && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isMinimized]);

  const handleEndConversationAndClose = () => {
    const shouldClose = handleEndConversation();
    if (shouldClose) {
      setIsMinimized(true);
    }
  };

  // Show welcome message if no messages
  const showWelcome = !messagesLoading && (!messages || messages.length === 0);

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsMinimized(false)}
          className="rounded-full w-16 h-16 shadow-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all duration-300 transform hover:scale-110 hover:shadow-3xl"
          size="lg"
        >
          <MessageCircle className="h-7 w-7" />
        </Button>
        {/* Enhanced notification dot */}
        {messages && messages.length > 0 && (
          <div className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full animate-pulse flex items-center justify-center">
            <span className="text-xs text-white font-bold">{messages.length}</span>
          </div>
        )}
      </div>
    );
  }

  const chatHeight = isExpanded ? "h-[700px]" : "h-[500px]";
  const chatWidth = isExpanded ? "w-[420px]" : "w-96";

  return (
    <div className={`fixed bottom-6 right-6 z-50 ${chatWidth} ${chatHeight} transition-all duration-300 transform`}>
      <Card className="h-full flex flex-col shadow-2xl border-2 border-emerald-200 bg-white/95 backdrop-blur-lg rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
          <ChatHeader
            isExpanded={isExpanded}
            isOnline={isOnline}
            onToggleExpand={() => setIsExpanded(!isExpanded)}
            onClearConversation={handleClearConversation}
            onRefresh={() => refetchMessages()}
            onEndConversation={handleEndConversationAndClose}
            clearLoading={clearLoading}
          />
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {showWelcome && (
                <div className="flex items-start space-x-3 animate-fade-in">
                  <div className="p-2 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full shadow-sm">
                    <MessageCircle className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl rounded-tl-sm p-4 max-w-[280px] shadow-sm border border-emerald-100">
                    <p className="text-sm text-gray-800 leading-relaxed">
                      🌟 <strong>Welcome to WiFi Assistant!</strong>
                      <br /><br />
                      I'm here to help you with:
                      <br />📦 WiFi package purchases
                      <br />🔑 Reconnection codes
                      <br />❓ Service questions
                      <br />💬 Technical support
                      <br /><br />
                      <em>How can I assist you today?</em>
                    </p>
                  </div>
                </div>
              )}

              {messages?.map((msg) => (
                <ChatMessage key={msg.id} message={{
                  id: msg.id,
                  content: msg.content,
                  role: msg.role as 'user' | 'assistant',
                  created_at: msg.created_at
                }} />
              ))}

              {sendMessagePending && <TypingIndicator />}
            </div>
            <div ref={messagesEndRef} />
          </ScrollArea>

          <ChatInput
            message={message}
            setMessage={setMessage}
            onSendMessage={handleSendMessage}
            onKeyPress={handleKeyPress}
            isLoading={sendMessagePending}
            inputRef={inputRef}
          />
        </CardContent>
      </Card>
    </div>
  );
}
