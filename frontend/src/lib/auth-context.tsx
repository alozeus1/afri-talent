"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { auth, User } from "./api";

interface AuthContextType {
  user: User | null;
  token: string | null;
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
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem("token");
      if (storedToken) {
        try {
          const userData = await auth.me(storedToken);
          setToken(storedToken);
          setUser(userData);
        } catch {
          localStorage.removeItem("token");
        }
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await auth.login(email, password);
    localStorage.setItem("token", response.token);
    setToken(response.token);
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
    localStorage.setItem("token", response.token);
    setToken(response.token);
    setUser(response.user);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
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
