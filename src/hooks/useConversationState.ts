
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface UseConversationStateProps {
  macAddress: string;
}

export function useConversationState({ macAddress }: UseConversationStateProps) {
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lastMacAddress, setLastMacAddress] = useState<string>("");
  const queryClient = useQueryClient();

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

  return {
    message,
    setMessage,
    conversationId,
    setConversationId,
  };
}
