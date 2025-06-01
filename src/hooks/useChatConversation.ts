
import { useRef, useEffect } from "react";
import { useOnlineStatus } from "./useOnlineStatus";
import { useConversationState } from "./useConversationState";
import { useConversationData } from "./useConversationData";
import { useChatActions } from "./useChatActions";
import type { UseChatConversationProps } from "@/types/chat";

export function useChatConversation({ macAddress, phoneNumber, onSessionCreated }: UseChatConversationProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isOnline = useOnlineStatus();
  
  const {
    message,
    setMessage,
    conversationId,
    setConversationId,
  } = useConversationState({ macAddress });

  const {
    conversation,
    messages,
    messagesLoading,
    refetchMessages,
  } = useConversationData({
    macAddress,
    phoneNumber,
    conversationId,
    setConversationId,
    isOnline,
  });

  const {
    handleSendMessage,
    handleKeyPress,
    handleClearConversation,
    handleEndConversation,
    sendMessagePending,
    clearLoading,
  } = useChatActions({
    conversationId,
    macAddress,
    phoneNumber,
    messages,
    isOnline,
    message,
    setMessage,
    inputRef,
  });

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
    sendMessagePending,
    clearLoading,
  };
}
