
import { useState, useEffect } from "react";

interface ChatSession {
  username: string;
  pin: string;
  timestamp: number;
}

export function useChatSession() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>("");

  useEffect(() => {
    // Check for existing session on mount
    const storedAuth = localStorage.getItem('wifi_chat_auth');
    if (storedAuth) {
      try {
        const authData: ChatSession = JSON.parse(storedAuth);
        // Session expires after 24 hours
        const sessionAge = Date.now() - authData.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (sessionAge < maxAge) {
          setIsAuthenticated(true);
          setCurrentUser(authData.username);
        } else {
          // Session expired, clear it
          localStorage.removeItem('wifi_chat_auth');
        }
      } catch (error) {
        console.error('Error parsing stored auth:', error);
        localStorage.removeItem('wifi_chat_auth');
      }
    }
  }, []);

  const login = (username: string) => {
    setIsAuthenticated(true);
    setCurrentUser(username);
  };

  const logout = () => {
    localStorage.removeItem('wifi_chat_auth');
    setIsAuthenticated(false);
    setCurrentUser("");
  };

  const endSession = () => {
    logout();
  };

  return {
    isAuthenticated,
    currentUser,
    login,
    logout,
    endSession,
  };
}
