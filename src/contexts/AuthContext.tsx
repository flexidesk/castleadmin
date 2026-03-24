'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

const AuthContext = createContext<any>({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

const isRefreshTokenError = (error: any): boolean => {
  if (!error) return false;
  return (
    error?.code === 'refresh_token_not_found' || error?.message?.includes('Refresh Token Not Found') ||
    error?.message?.includes('refresh_token_not_found') ||
    error?.message?.includes('Invalid Refresh Token') ||
    (error?.status === 400 && error?.__isAuthError === true)
  );
};

const clearAllAuthStorage = () => {
  try {
    Object.keys(localStorage)
      .filter(
        (k) =>
          k.startsWith('sb-') ||
          k.startsWith('sb_') ||
          k === 'castleadmin-auth'|| k.includes('castleadmin-auth') ||
          k.includes('supabase') ||
          k.startsWith('sb_castleadmin') ||
          k.startsWith('sb_sb-')
      )
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
  try {
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
    document.cookie.split(';').forEach((c) => {
      const name = c.trim().split('=')[0];
      if (
        name.startsWith('sb-') ||
        name.includes('auth-token') ||
        name.includes('supabase') ||
        name.includes('castleadmin-auth')
      ) {
        document.cookie = secure
          ? `${name}=; Path=/; Max-Age=0; SameSite=None; Secure`
          : `${name}=; Path=/; Max-Age=0`;
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

const handleStaleSession = async (
  supabase: any,
  setSession: any,
  setUser: any,
  setLoading: any
) => {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {}
  clearAllAuthStorage();
  setSession(null);
  setUser(null);
  setLoading(false);
  redirectToLogin();
};

// Module-level flag stored on globalThis so it truly survives React Strict Mode's
// unmount→remount cycle within the same JS module evaluation.
// The flag is keyed by a page-load timestamp so it resets on genuine navigation.
const PAGE_LOAD_KEY = typeof window !== 'undefined' ? window.performance?.now?.() ?? Date.now() : 0;
const HANDLED_KEY = `__sbInitialSessionHandled_${PAGE_LOAD_KEY}`;

function isInitialSessionHandled(): boolean {
  return !!(globalThis as any)[HANDLED_KEY];
}

function markInitialSessionHandled(): void {
  (globalThis as any)[HANDLED_KEY] = true;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const initializedRef = useRef(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        // Guard: only process INITIAL_SESSION once per page load.
        // Uses globalThis so React Strict Mode's unmount→remount doesn't reset it.
        if (isInitialSessionHandled()) return;
        markInitialSessionHandled();

        if (!session) {
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }

        // Use session.user directly — avoids an extra getUser() API call
        const sessionUser = session.user ?? null;

        if (!sessionUser) {
          clearAllAuthStorage();
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(sessionUser);
        setLoading(false);
        initializedRef.current = true;
      } else if (
        event === 'TOKEN_REFRESHED' ||
        event === 'SIGNED_IN' ||
        event === 'USER_UPDATED'
      ) {
        if (session) {
          setSession(session);
          setUser(session.user ?? null);
        }
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        clearAllAuthStorage();
        setSession(null);
        setUser(null);
        setLoading(false);
        redirectToLogin();
      } else if ((event as string) === 'TOKEN_REFRESH_FAILED') {
        await handleStaleSession(supabase, setSession, setUser, setLoading);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Email/Password Sign Up
  const signUp = async (email: string, password: string, metadata: any = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: metadata?.fullName || '',
          avatar_url: metadata?.avatarUrl || '',
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
    return data;
  };

  // Email/Password Sign In
  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  // Sign Out
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  // Get Current User
  const getCurrentUser = async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  };

  // Check if Email is Verified
  const isEmailVerified = () => {
    return user?.email_confirmed_at !== null;
  };

  // Get User Profile from Database
  const getUserProfile = async () => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    return data;
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
