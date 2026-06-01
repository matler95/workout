import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, API_BASE } from '../utils/supabase-client';
import type { User } from '@supabase/supabase-js';

// FIX #1: Removed import of projectId from gitignored utils/supabase/info.tsx.
// The signup URL is now derived from API_BASE (itself built from VITE_SUPABASE_URL).

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, name: string) => {
    // Step 1: client-side signup (works when email confirm is OFF)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (!error && data.session) {
      // Email confirmation is OFF — session returned immediately
      return;
    }

    if (!error && data?.user && !data.session) {
      // Created but needs email confirmation — try signing in anyway
      await sleep(500);
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (!signInError) return;
      throw new Error('Account created! Please check your email to confirm before signing in.');
    }

    // Step 2: Edge function fallback (admin.createUser bypasses email confirmation)
    // FIX #1: use API_BASE instead of constructing URL from projectId
    const response = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const result = await response.json();
    if (result.error) throw new Error(result.error);

    // Step 3: sign in with backoff for auth propagation
    let lastSignInError: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(300 + attempt * 400);
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (!signInError) return;
      lastSignInError = signInError;
    }
    throw lastSignInError;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}