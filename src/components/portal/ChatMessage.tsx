
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
      className={`flex items-start space-x-3 mb-4 animate-fade-in ${
        isUser ? 'flex-row-reverse space-x-reverse' : ''
      }`}
    >
      <div className={`flex-shrink-0 p-2 rounded-full shadow-sm ${
        isUser 
          ? 'bg-gradient-to-br from-indigo-500 to-purple-600' 
          : 'bg-gradient-to-br from-slate-600 to-slate-700'
      }`}>
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-white" />
        )}
      </div>
      <div className={`rounded-2xl p-4 max-w-[280px] shadow-sm border transition-all hover:shadow-md ${
        isUser
          ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-tr-sm border-indigo-200'
          : 'bg-white text-slate-800 rounded-tl-sm border-slate-200'
      }`}>
        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${
          isTyping ? 'typing-effect' : ''
        }`}>
          {message.content}
        </p>
        <p className={`text-xs mt-2 opacity-70 ${
          isUser ? 'text-indigo-100' : 'text-slate-500'
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
