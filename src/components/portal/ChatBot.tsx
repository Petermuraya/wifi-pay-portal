
import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { ChatMessage } from "./ChatMessage";
import { ChatHeader } from "./ChatHeader";
import { ChatInput } from "./ChatInput";
import { TypingIndicator } from "./TypingIndicator";
import type { Database } from "@/integrations/supabase/types";

type ChatMessage as ChatMessageType = Database["public"]["Tables"]["chat_messages"]["Row"];
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
  const [lastMacAddress, setLastMacAddress] = useState<string>("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Auto-clear conversation when MAC address changes
  useEffect(() => {
    if (lastMacAddress && lastMacAddress !== macAddress) {
      console.log('MAC address changed, clearing conversation');
      setConversationId(null);
      queryClient.removeQueries({ queryKey: ["chat-messages"] });
      queryClient.removeQueries({ queryKey: ["chat-conversation"] });
    }
    setLastMacAddress(macAddress);
  }, [macAddress, lastMacAddress, queryClient]);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
    staleTime: 0, // Always refetch to ensure fresh conversation
  });

  // Get chat messages with optimized polling
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
    enabled: !!conversationId && isOnline,
    refetchInterval: isMinimized ? false : 2000, // Only poll when chat is open
    staleTime: 1000,
  });

  // Send message mutation with improved error handling
  const sendMessageMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      if (!conversationId) throw new Error("No conversation found");
      if (!isOnline) throw new Error("You're offline. Please check your connection.");

      // Store conversation context for AI memory
      const conversationHistory = messages?.slice(-10) || []; // Last 10 messages for context

      const response = await supabase.functions.invoke('groq-chat', {
        body: {
          message: userMessage,
          conversationId,
          macAddress,
          phoneNumber,
          conversationHistory: conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
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
    if (!message.trim() || sendMessageMutation.isPending || !isOnline) return;
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
      // Clear the conversation and close chat
      clearConversationMutation.mutate();
      setIsMinimized(true);
      toast({
        title: "Conversation Ended",
        description: "Thank you for using WiFi Assistant! 👋",
      });
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (!isMinimized && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isMinimized]);

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
            onEndConversation={handleEndConversation}
            clearLoading={clearConversationMutation.isPending}
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
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {sendMessageMutation.isPending && <TypingIndicator />}
            </div>
            <div ref={messagesEndRef} />
          </ScrollArea>

          <ChatInput
            message={message}
            setMessage={setMessage}
            onSendMessage={handleSendMessage}
            onKeyPress={handleKeyPress}
            isLoading={sendMessageMutation.isPending}
            inputRef={inputRef}
          />
        </CardContent>
      </Card>
    </div>
  );
}
