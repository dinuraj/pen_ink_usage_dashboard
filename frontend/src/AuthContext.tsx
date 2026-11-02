import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';

interface AuthContextType {
  isAdmin: boolean;
  authEnabled: boolean;
  loading: boolean;
  login: (passcode: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isAdmin: true,
  authEnabled: false,
  loading: true,
  login: async () => ({ success: false }),
  logout: async () => {},
  checkAuth: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAdmin, setIsAdmin] = useState<boolean>(true);
  const [authEnabled, setAuthEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const checkAuth = useCallback(async () => {
    try {
      const status = await api.auth.getStatus();
      setIsAdmin(status.is_admin);
      setAuthEnabled(status.auth_enabled);
    } catch {
      // Default to read-only if status fails to load but app is running
      setIsAdmin(false);
      setAuthEnabled(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const login = async (passcode: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await api.auth.login(passcode);
      setIsAdmin(res.is_admin);
      setAuthEnabled(res.auth_enabled);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Invalid passcode',
      };
    }
  };

  const logout = async () => {
    try {
      const res = await api.auth.logout();
      setIsAdmin(res.is_admin);
      setAuthEnabled(res.auth_enabled);
    } catch {
      setIsAdmin(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAdmin,
        authEnabled,
        loading,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
