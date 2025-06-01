import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import type { ChatMessageType } from "@/types/chat";

interface UseChatActionsProps {
  conversationId: string | null;
  macAddress: string;
  phoneNumber?: string;
  messages?: ChatMessageType[];
  isOnline: boolean;
  message: string;
  setMessage: (message: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  username?: string;
}

export function useChatActions({
  conversationId,
  macAddress,
  phoneNumber,
  messages,
  isOnline,
  message,
  setMessage,
  inputRef,
  username,
}: UseChatActionsProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
          username,
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

  return {
    handleSendMessage,
    handleKeyPress,
    handleClearConversation,
    handleEndConversation,
    sendMessagePending: sendMessageMutation.isPending,
    clearLoading: clearConversationMutation.isPending,
  };
}
