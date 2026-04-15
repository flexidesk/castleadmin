'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { dbAuth } from '@/lib/db/client';

const AuthContext = createContext<any>({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

const clearAllAuthStorage = () => {
  try {
    Object.keys(localStorage)
      .filter(
        (k) =>
          k.includes('castleadmin') ||
          k.includes('auth') ||
          k.startsWith('sb-') ||
          k.startsWith('sb_')
      )
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
  try {
    document.cookie.split(';').forEach((c) => {
      const name = c.trim().split('=')[0];
      if (name.startsWith('sb-') || name.includes('auth-token') || name.includes('supabase')) {
        document.cookie = `${name}=; Path=/; Max-Age=0`;
      }
    });
  } catch {}
};

const redirectToLogin = () => {
  if (
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/login')
  ) {
    window.location.href = '/login';
  }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const initialSessionProcessed = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = dbAuth.onAuthStateChange((event, sessionData) => {
      if (event === 'INITIAL_SESSION') {
        if (initialSessionProcessed.current) return;
        initialSessionProcessed.current = true;

        if (!sessionData) {
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }

        setSession(sessionData);
        setUser(sessionData.user ?? null);
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        clearAllAuthStorage();
        setSession(null);
        setUser(null);
        setLoading(false);
        redirectToLogin();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Email/Password Sign Up
  const signUp = async (email: string, password: string, metadata: any = {}) => {
    const { data, error } = await dbAuth.signUp({
      email,
      password,
      options: { data: { full_name: metadata?.fullName || '' } },
    });
    if (error) throw error;
    if (data?.session) {
      setSession(data.session);
      setUser(data.user);
    }
    return data;
  };

  // Email/Password Sign In
  const signIn = async (email: string, password: string) => {
    const { data, error } = await dbAuth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data?.session) {
      setSession(data.session);
      setUser(data.user);
    }
    return data;
  };

  // Sign Out
  const signOut = async () => {
    const { error } = await dbAuth.signOut();
    if (error) throw error;
    clearAllAuthStorage();
    setSession(null);
    setUser(null);
    redirectToLogin();
  };

  // Get Current User
  const getCurrentUser = async () => {
    const { data, error } = await dbAuth.getUser();
    if (error) throw error;
    return data?.user ?? null;
  };

  // Check if Email is Verified
  const isEmailVerified = () => {
    return user?.email_confirmed_at !== null && user?.email_confirmed_at !== undefined;
  };

  // Get User Profile from Database
  const getUserProfile = async () => {
    if (!user) return null;
    try {
      const res = await fetch('/api/auth/profile', {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    getCurrentUser,
    isEmailVerified,
    getUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
