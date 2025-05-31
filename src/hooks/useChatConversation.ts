
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import type { Database } from "@/integrations/supabase/types";

type ChatMessageType = Database["public"]["Tables"]["chat_messages"]["Row"];
type ChatConversation = Database["public"]["Tables"]["chat_conversations"]["Row"];

interface UseChatConversationProps {
  macAddress: string;
  phoneNumber?: string;
  onSessionCreated?: (session: any) => void;
}

export function useChatConversation({ macAddress, phoneNumber, onSessionCreated }: UseChatConversationProps) {
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
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
    refetchInterval: 2000, // Poll every 2 seconds when active
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
      clearConversationMutation.mutate();
      toast({
        title: "Conversation Ended",
        description: "Thank you for using WiFi Assistant! 👋",
      });
      return true; // Signal to close chat
    }
    return false;
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return {
    // State
    message,
    setMessage,
    conversationId,
    isOnline,
    messagesEndRef,
    inputRef,
    
    // Data
    conversation,
    messages,
    messagesLoading,
    
    // Actions
    handleSendMessage,
    handleKeyPress,
    handleClearConversation,
    handleEndConversation,
    refetchMessages,
    
    // Loading states
    sendMessagePending: sendMessageMutation.isPending,
    clearLoading: clearConversationMutation.isPending,
  };
}
