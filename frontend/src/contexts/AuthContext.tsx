import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthUser {
  merchantId: string;
  role: string;
  name: string;
  email?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, merchantId: string, role: string, name: string) => void;
  logout: () => void;
  updateUserName: (name: string) => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isMerchant: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('aibuyable_token');
    const storedUser = localStorage.getItem('aibuyable_user');
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.clear();
      }
    }
  }, []);

  const login = (accessToken: string, merchantId: string, role: string, name: string) => {
    const userData = { merchantId, role, name };
    localStorage.setItem('aibuyable_token', accessToken);
    localStorage.setItem('aibuyable_user', JSON.stringify(userData));
    setToken(accessToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('aibuyable_token');
    localStorage.removeItem('aibuyable_user');
    setToken(null);
    setUser(null);
  };

  const updateUserName = (name: string) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, name };
      localStorage.setItem('aibuyable_user', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        updateUserName,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        isMerchant: user?.role === 'merchant',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
