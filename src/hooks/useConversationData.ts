
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessageType, ChatConversation } from "@/types/chat";

interface UseConversationDataProps {
  macAddress: string;
  phoneNumber?: string;
  conversationId: string | null;
  setConversationId: (id: string) => void;
  isOnline: boolean;
}

export function useConversationData({ 
  macAddress, 
  phoneNumber, 
  conversationId, 
  setConversationId, 
  isOnline 
}: UseConversationDataProps) {
  // Create or get existing conversation
  const { data: conversation } = useQuery({
    queryKey: ["chat-conversation", macAddress],
    queryFn: async (): Promise<ChatConversation> => {
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
    queryFn: async (): Promise<ChatMessageType[]> => {
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

  return {
    conversation,
    messages,
    messagesLoading,
    refetchMessages,
  };
}
