
import type { Database } from "@/integrations/supabase/types";

// Simplified type definitions to avoid deep type instantiation
export interface ChatMessageType {
  id: string;
  conversation_id: string;
  content: string;
  role: string;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  mac_address: string;
  phone_number: string | null;
  username: string | null;
  created_at: string;
  updated_at: string;
}

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
