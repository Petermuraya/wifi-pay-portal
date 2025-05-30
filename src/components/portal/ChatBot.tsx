
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, Bot, User, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import type { Database } from "@/integrations/supabase/types";

type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
  });

  // Get chat messages
  const { data: messages, isLoading: messagesLoading } = useQuery({
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
    enabled: !!conversationId,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      if (!conversationId) throw new Error("No conversation found");

      const response = await supabase.functions.invoke('groq-chat', {
        body: {
          message: userMessage,
          conversationId,
          macAddress,
          phoneNumber
        }
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", conversationId] });
      setMessage("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(message);
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Show welcome message if no messages
  const showWelcome = !messagesLoading && (!messages || messages.length === 0);

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsMinimized(false)}
          className="rounded-full w-14 h-14 shadow-lg"
          size="lg"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 h-96">
      <Card className="h-full flex flex-col shadow-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bot className="h-5 w-5 text-indigo-600" />
              <CardTitle className="text-sm">WiFi Assistant</CardTitle>
              <Badge variant="secondary" className="text-xs">Online</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(true)}
              className="h-6 w-6 p-0"
            >
              ×
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-3 space-y-3">
          <ScrollArea className="flex-1 pr-3">
            <div className="space-y-3">
              {showWelcome && (
                <div className="flex items-start space-x-2">
                  <div className="p-1 bg-indigo-100 rounded-full">
                    <Bot className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="bg-gray-100 rounded-lg p-3 max-w-[200px]">
                    <p className="text-sm">
                      Hello! I'm here to help you purchase WiFi packages or reconnect to existing sessions. How can I assist you today?
                    </p>
                  </div>
                </div>
              )}

              {messages?.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start space-x-2 ${
                    msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                  }`}
                >
                  <div className={`p-1 rounded-full ${
                    msg.role === 'user' 
                      ? 'bg-indigo-100' 
                      : 'bg-gray-100'
                  }`}>
                    {msg.role === 'user' ? (
                      <User className="h-4 w-4 text-indigo-600" />
                    ) : (
                      <Bot className="h-4 w-4 text-gray-600" />
                    )}
                  </div>
                  <div className={`rounded-lg p-3 max-w-[200px] ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                </div>
              ))}

              {sendMessageMutation.isPending && (
                <div className="flex items-start space-x-2">
                  <div className="p-1 bg-gray-100 rounded-full">
                    <Bot className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="bg-gray-100 rounded-lg p-3 max-w-[200px]">
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-sm text-gray-500">Typing...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </ScrollArea>

          <form onSubmit={handleSendMessage} className="flex space-x-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 text-sm"
              disabled={sendMessageMutation.isPending}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!message.trim() || sendMessageMutation.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
