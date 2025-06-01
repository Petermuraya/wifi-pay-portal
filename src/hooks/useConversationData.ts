
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessageType, ChatConversation } from "@/types/chat";

interface UseConversationDataProps {
  macAddress: string;
  phoneNumber?: string;
  conversationId: string | null;
  setConversationId: (id: string) => void;
  isOnline: boolean;
  username?: string;
}

export function useConversationData({ 
  macAddress, 
  phoneNumber, 
  conversationId, 
  setConversationId, 
  isOnline,
  username 
}: UseConversationDataProps) {
  // Create or get existing conversation
  const conversationQuery = useQuery<ChatConversation>({
    queryKey: ["chat-conversation", macAddress, username],
    queryFn: async () => {
      // Try to find existing conversation for this MAC address and username
      let query = supabase
        .from("chat_conversations")
        .select("*")
        .eq("mac_address", macAddress);
      
      if (username) {
        query = query.eq("username", username);
      }
      
      const { data: existing } = await query
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (existing) {
        setConversationId(existing.id);
        return existing as ChatConversation;
      }

      // Create new conversation
      const { data: newConversation, error } = await supabase
        .from("chat_conversations")
        .insert({
          mac_address: macAddress,
          phone_number: phoneNumber || null,
          username: username || null,
        })
        .select()
        .single();

      if (error) throw error;
      setConversationId(newConversation.id);
      return newConversation as ChatConversation;
    },
    staleTime: 0, // Always refetch to ensure fresh conversation
    enabled: !!username, // Only run when authenticated
  });

  // Get chat messages with optimized polling
  const messagesQuery = useQuery<ChatMessageType[]>({
    queryKey: ["chat-messages", conversationId],
    queryFn: async () => {
      if (!conversationId) {
        return [];
      }
      
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at");
      
      if (error) throw error;
      return (data || []) as ChatMessageType[];
    },
    enabled: !!conversationId && isOnline,
    refetchInterval: 2000, // Poll every 2 seconds when active
    staleTime: 1000,
  });

  return {
    conversation: conversationQuery.data,
    messages: messagesQuery.data,
    messagesLoading: messagesQuery.isLoading,
    refetchMessages: messagesQuery.refetch,
  };
}
