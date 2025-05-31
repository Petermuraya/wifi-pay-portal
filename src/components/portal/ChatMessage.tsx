
import React from "react";
import { Bot, User } from "lucide-react";

interface ChatMessageProps {
  message: {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    created_at: string;
  };
  isTyping?: boolean;
}

export function ChatMessage({ message, isTyping = false }: ChatMessageProps) {
  const isUser = message.role === 'user';
  
  return (
    <div
      className={`flex items-start space-x-3 animate-fade-in ${
        isUser ? 'flex-row-reverse space-x-reverse' : ''
      }`}
    >
      <div className={`p-2 rounded-full shadow-sm ${
        isUser 
          ? 'bg-gradient-to-br from-blue-500 to-indigo-600' 
          : 'bg-gradient-to-br from-emerald-400 to-teal-500'
      }`}>
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-white" />
        )}
      </div>
      <div className={`rounded-2xl p-4 max-w-[240px] shadow-sm border transition-all hover:shadow-md ${
        isUser
          ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-tr-sm'
          : 'bg-gradient-to-br from-white to-gray-50 text-gray-800 rounded-tl-sm border-emerald-100'
      }`}>
        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${
          isTyping ? 'typing-effect' : ''
        }`}>
          {message.content}
        </p>
        <p className={`text-xs mt-2 opacity-70 ${
          isUser ? 'text-blue-100' : 'text-gray-500'
        }`}>
          {new Date(message.created_at).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </p>
      </div>
    </div>
  );
}
