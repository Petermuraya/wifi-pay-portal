
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

  // Send message mutation with robust error handling
  const sendMessageMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      if (!conversationId) throw new Error("No conversation found");
      if (!isOnline) throw new Error("You're offline. Please check your connection.");

      console.log('Sending message to Groq function...', { userMessage, conversationId, macAddress });

      const response = await supabase.functions.invoke('groq-chat', {
        body: {
          message: userMessage,
          conversationId,
          macAddress,
          phoneNumber,
          username,
        }
      });

      console.log('Groq function response:', response);

      if (response.error) {
        console.error('Groq function error:', response.error);
        throw new Error(response.error.message || 'Failed to send message');
      }
      
      // Check if the response indicates success
      if (!response.data?.success) {
        console.error('Groq function returned error:', response.data);
        
        // Use the specific error message from the function if available
        const errorMessage = response.data?.message || response.data?.error || 'Message failed to send';
        throw new Error(errorMessage);
      }

      return response.data;
    },
    onSuccess: () => {
      console.log('Message sent successfully');
      queryClient.invalidateQueries({ queryKey: ["chat-messages", conversationId] });
      setMessage("");
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    onError: (error: any) => {
      console.error('Send message error:', error);
      
      // Provide more specific error messages based on the error type
      let errorMessage = "Failed to send message. Please try again.";
      
      if (error.message.includes("authentication")) {
        errorMessage = "Authentication error. Please refresh the page and try again.";
      } else if (error.message.includes("busy") || error.message.includes("429")) {
        errorMessage = "Service is busy. Please wait a moment and try again.";
      } else if (error.message.includes("unavailable") || error.message.includes("500")) {
        errorMessage = "Service temporarily unavailable. Please try again in a few minutes.";
      } else if (error.message.includes("connection") || error.message.includes("network")) {
        errorMessage = "Connection error. Please check your internet and try again.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Message Failed",
        description: errorMessage,
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
      return true;
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
