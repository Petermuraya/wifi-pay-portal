
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, X, Minimize2, Maximize2 } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { ChatHeader } from "./ChatHeader";
import { ChatInput } from "./ChatInput";
import { TypingIndicator } from "./TypingIndicator";
import { ChatAuth } from "./ChatAuth";
import { useChatConversation } from "@/hooks/useChatConversation";
import { useChatSession } from "@/hooks/useChatSession";

interface ChatBotProps {
  macAddress: string;
  phoneNumber?: string;
  onSessionCreated?: (session: any) => void;
}

export function ChatBot({ macAddress, phoneNumber, onSessionCreated }: ChatBotProps) {
  const [isMinimized, setIsMinimized] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  
  const {
    isAuthenticated,
    currentUser,
    login,
    logout,
    endSession,
  } = useChatSession();

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
  } = useChatConversation({ 
    macAddress, 
    phoneNumber, 
    onSessionCreated,
    username: currentUser 
  });

  // Focus input when opened
  useEffect(() => {
    if (!isMinimized && inputRef.current && isAuthenticated) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isMinimized, isAuthenticated]);

  const handleEndConversationAndClose = () => {
    const shouldClose = handleEndConversation();
    if (shouldClose) {
      setIsMinimized(true);
    }
  };

  const handleLogout = () => {
    handleClearConversation();
    logout();
    setIsMinimized(true);
  };

  const handleHideChatbot = () => {
    setIsHidden(true);
    setIsMinimized(true);
  };

  // Show welcome message if no messages
  const showWelcome = !messagesLoading && (!messages || messages.length === 0) && isAuthenticated;

  // If chatbot is hidden, show a small restore button
  if (isHidden) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsHidden(false)}
          variant="outline"
          size="sm"
          className="bg-white/90 backdrop-blur-sm shadow-lg border-emerald-200 hover:border-emerald-300"
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          WiFi Assistant
        </Button>
      </div>
    );
  }

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
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
        </div>
      );
    }

    return <ChatAuth onAuthenticated={login} onClose={() => setIsMinimized(true)} />;
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <div className="relative">
          <Button
            onClick={() => setIsMinimized(false)}
            className="rounded-full w-16 h-16 shadow-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all duration-300 transform hover:scale-110 hover:shadow-3xl"
            size="lg"
          >
            <MessageCircle className="h-7 w-7" />
          </Button>
          
          {/* User indicator */}
          <div className="absolute -top-2 -left-2 bg-white rounded-full px-2 py-1 text-xs font-medium text-emerald-600 shadow-sm border border-emerald-200">
            {currentUser}
          </div>
          
          {/* Message count notification */}
          {messages && messages.length > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full animate-pulse flex items-center justify-center">
              <span className="text-xs text-white font-bold">{messages.length}</span>
            </div>
          )}
          
          {/* Hide button */}
          <Button
            onClick={handleHideChatbot}
            variant="ghost"
            size="sm"
            className="absolute -top-8 -right-8 h-6 w-6 p-0 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 rounded-full shadow-sm"
            title="Hide chatbot"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  const chatHeight = isExpanded ? "h-[700px]" : "h-[500px]";
  const chatWidth = isExpanded ? "w-[420px]" : "w-96";

  return (
    <div className={`fixed bottom-6 right-6 z-50 ${chatWidth} ${chatHeight} transition-all duration-300 transform`}>
      <Card className="h-full flex flex-col shadow-2xl border-2 border-emerald-200 bg-white/95 backdrop-blur-lg rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1 bg-white/20 rounded-full">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">WiFi Assistant</div>
                <div className="text-xs opacity-90">Welcome, {currentUser}</div>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-6 w-6 p-0 text-white hover:bg-white/20"
                title={isExpanded ? "Minimize" : "Expand"}
              >
                {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMinimized(true)}
                className="h-6 w-6 p-0 text-white hover:bg-white/20"
                title="Minimize"
              >
                <Minimize2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="h-6 w-6 p-0 text-white hover:bg-red-400/20"
                title="End session"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
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
                      🌟 <strong>Welcome back, {currentUser}!</strong>
                      <br /><br />
                      I'm here to help you with:
                      <br />📦 WiFi package purchases
                      <br />🔑 Reconnection codes
                      <br />💰 M-Pesa payments
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
