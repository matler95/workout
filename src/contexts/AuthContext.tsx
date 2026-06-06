import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabase-client';
import type { User } from '@supabase/supabase-js';

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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) {
      // Friendly message when an account already exists for the provided email.
      const msg = (error as any)?.message ?? '';
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
        throw new Error('An account for that email already exists. Try signing in.');
      }
      throw error;
    }

    if (data.session) {
      // Email confirmation is disabled — session returned immediately
      return;
    }

    if (data?.user && !data.session) {
      // Created but needs email confirmation — try signing in anyway
      await sleep(500);
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (!signInError) return;
      throw new Error('Account created! Please check your email to confirm before signing in.');
    }

    // Fallback: sign in with backoff for auth propagation
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