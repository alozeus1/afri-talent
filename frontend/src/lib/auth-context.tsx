"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { auth, User } from "./api";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    name: string;
    role: "CANDIDATE" | "EMPLOYER";
    companyName?: string;
    location?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // On mount, restore session from HttpOnly cookie via /api/auth/me.
    // No localStorage — the browser sends the cookie automatically.
    const initAuth = async () => {
      try {
        const userData = await auth.me();
        setUser(userData);
      } catch {
        // No valid session — stay logged out
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await auth.login(email, password);
    // Token is set as HttpOnly cookie by the server — we only store the user object
    setUser(response.user);
  };

  const register = async (data: {
    email: string;
    password: string;
    name: string;
    role: "CANDIDATE" | "EMPLOYER";
    companyName?: string;
    location?: string;
  }) => {
    const response = await auth.register(data);
    // Token is set as HttpOnly cookie by the server — we only store the user object
    setUser(response.user);
  };

  const logout = async () => {
    try {
      await auth.logout();
    } catch {
      // Even if the server call fails, clear local state
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
