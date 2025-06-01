
import type { Database } from "@/integrations/supabase/types";

export type ChatMessageType = Database["public"]["Tables"]["chat_messages"]["Row"];
export type ChatConversation = Database["public"]["Tables"]["chat_conversations"]["Row"];

export interface UseChatConversationProps {
  macAddress: string;
  phoneNumber?: string;
  onSessionCreated?: (session: any) => void;
}

export interface ChatConversationState {
  message: string;
  conversationId: string | null;
  lastMacAddress: string;
  isOnline: boolean;
}

export interface ChatConversationActions {
  handleSendMessage: (e: React.FormEvent) => void;
  handleKeyPress: (e: React.KeyboardEvent) => void;
  handleClearConversation: () => void;
  handleEndConversation: () => boolean;
  refetchMessages: () => void;
}
