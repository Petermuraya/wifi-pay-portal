
import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  MessageCircle, 
  Send, 
  Bot, 
  User, 
  Loader2, 
  X, 
  Minimize2, 
  Maximize2,
  Trash2,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/integrations/supabase/types";

type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];
type ChatConversation = Database["public"]["Tables"]["chat_conversations"]["Row"];

interface ChatBotProps {
  macAddress: string;
  phoneNumber?: string;
  onSessionCreated?: (session: any) => void;
}

export function ChatBot({ macAddress, phoneNumber, onSessionCreated }: ChatBotProps) {
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Create or get existing conversation
  const { data: conversation } = useQuery({
    queryKey: ["chat-conversation", macAddress],
    queryFn: async () => {
      // Try to find existing conversation for this MAC address
      const { data: existing } = await supabase
        .from("chat_conversations")
        .select("*")
        .eq("mac_address", macAddress)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (existing) {
        setConversationId(existing.id);
        return existing;
      }

      // Create new conversation
      const { data: newConversation, error } = await supabase
        .from("chat_conversations")
        .insert({
          mac_address: macAddress,
          phone_number: phoneNumber || null,
        })
        .select()
        .single();

      if (error) throw error;
      setConversationId(newConversation.id);
      return newConversation;
    },
  });

  // Get chat messages with better error handling
  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = useQuery({
    queryKey: ["chat-messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at");
      
      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
    refetchInterval: 1000, // Auto-refresh every second for real-time feel
  });

  // Send message mutation with better error handling
  const sendMessageMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      if (!conversationId) throw new Error("No conversation found");

      const response = await supabase.functions.invoke('groq-chat', {
        body: {
          message: userMessage,
          conversationId,
          macAddress,
          phoneNumber
        }
      });

      if (response.error) {
        console.error('Groq function error:', response.error);
        throw new Error(response.error.message || 'Failed to send message');
      }
      
      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Message failed to send');
      }

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", conversationId] });
      setMessage("");
      // Focus input after sending
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    onError: (error: any) => {
      console.error('Send message error:', error);
      toast({
        title: "Message Failed",
        description: error.message || "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Clear conversation mutation
  const clearConversationMutation = useMutation({
    mutationFn: async () => {
      if (!conversationId) return;
      
      const { error } = await supabase
        .from("chat_messages")
        .delete()
        .eq("conversation_id", conversationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", conversationId] });
      toast({
        title: "Conversation Cleared",
        description: "Your chat history has been cleared.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear conversation.",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const handleClearConversation = () => {
    if (window.confirm("Are you sure you want to clear this conversation? This action cannot be undone.")) {
      clearConversationMutation.mutate();
    }
  };

  const handleEndConversation = () => {
    if (window.confirm("End this conversation? You can always start a new one later.")) {
      setIsMinimized(true);
      toast({
        title: "Conversation Ended",
        description: "Thank you for using WiFi Assistant!",
      });
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (!isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isMinimized]);

  // Show welcome message if no messages
  const showWelcome = !messagesLoading && (!messages || messages.length === 0);

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsMinimized(false)}
          className="rounded-full w-16 h-16 shadow-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all duration-300 transform hover:scale-105"
          size="lg"
        >
          <MessageCircle className="h-7 w-7" />
        </Button>
        {/* Notification dot for new messages */}
        {messages && messages.length > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse" />
        )}
      </div>
    );
  }

  const chatHeight = isExpanded ? "h-[600px]" : "h-96";
  const chatWidth = isExpanded ? "w-96" : "w-80";

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${chatWidth} ${chatHeight} transition-all duration-300`}>
      <Card className="h-full flex flex-col shadow-2xl border-2 border-indigo-200 bg-white/95 backdrop-blur-sm">
        <CardHeader className="pb-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1 bg-white/20 rounded-full">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">WiFi Assistant</CardTitle>
                <p className="text-xs opacity-90">Premium Support</p>
              </div>
              <Badge variant="secondary" className="text-xs bg-green-500 text-white border-none">
                Online
              </Badge>
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
                onClick={handleClearConversation}
                className="h-6 w-6 p-0 text-white hover:bg-white/20"
                title="Clear conversation"
                disabled={clearConversationMutation.isPending}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchMessages()}
                className="h-6 w-6 p-0 text-white hover:bg-white/20"
                title="Refresh"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEndConversation}
                className="h-6 w-6 p-0 text-white hover:bg-white/20"
                title="End conversation"
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
                  <div className="p-2 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full">
                    <Bot className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl rounded-tl-sm p-4 max-w-[240px] shadow-sm border">
                    <p className="text-sm text-gray-800 leading-relaxed">
                      👋 Hello! I'm your WiFi Assistant. I can help you:
                      <br />• Purchase WiFi packages
                      <br />• Get reconnection codes
                      <br />• Answer questions about services
                      <br /><br />
                      How can I assist you today?
                    </p>
                  </div>
                </div>
              )}

              {messages?.map((msg, index) => (
                <div
                  key={msg.id}
                  className={`flex items-start space-x-3 animate-fade-in ${
                    msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                  }`}
                >
                  <div className={`p-2 rounded-full ${
                    msg.role === 'user' 
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600' 
                      : 'bg-gradient-to-br from-gray-100 to-gray-200'
                  }`}>
                    {msg.role === 'user' ? (
                      <User className="h-4 w-4 text-white" />
                    ) : (
                      <Bot className="h-4 w-4 text-gray-600" />
                    )}
                  </div>
                  <div className={`rounded-2xl p-4 max-w-[240px] shadow-sm border transition-all hover:shadow-md ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-tr-sm'
                      : 'bg-gradient-to-br from-white to-gray-50 text-gray-800 rounded-tl-sm'
                  }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-2 opacity-70 ${
                      msg.role === 'user' ? 'text-white' : 'text-gray-500'
                    }`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              ))}

              {sendMessageMutation.isPending && (
                <div className="flex items-start space-x-3 animate-fade-in">
                  <div className="p-2 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full">
                    <Bot className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl rounded-tl-sm p-4 max-w-[240px] shadow-sm border">
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                      <span className="text-sm text-gray-600">Assistant is typing...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </ScrollArea>

          <div className="p-4 border-t bg-gray-50/50">
            <form onSubmit={handleSendMessage} className="space-y-2">
              <div className="flex space-x-2">
                <Textarea
                  ref={inputRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                  className="flex-1 text-sm resize-none min-h-[40px] max-h-[120px] border-gray-200 focus:border-indigo-300 focus:ring-indigo-200"
                  disabled={sendMessageMutation.isPending}
                  rows={1}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!message.trim() || sendMessageMutation.isPending}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 px-4"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500 text-center">
                Your conversation is private and secure
              </p>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
