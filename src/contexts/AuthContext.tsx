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
      const msg = (error as any)?.message ?? '';
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
        throw new Error('An account for that email already exists. Try signing in.');
      }
      throw error;
    }

    // Session returned immediately — email confirmation disabled on this project
    if (data.session) return;

    // FIX #9: data.user exists but no session means email confirmation IS required.
    // The original code tried signing in anyway (which fails with "Email not confirmed")
    // and gave the user a confusing "Invalid login credentials" error after 3 retries.
    // Now we detect this case explicitly and surface a clear actionable message.
    if (data?.user && !data.session) {
      // Check if the user's email is already confirmed (some Supabase configurations
      // auto-confirm but still don't return a session on the signup call).
      await sleep(400);
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (!signInError) return; // auto-confirmed and session established

      // FIX #9: At this point we know confirmation is genuinely required.
      // Don't retry — it will keep failing. Surface a clear message instead.
      const signInMsg = (signInError as any)?.message?.toLowerCase() ?? '';
      if (
        signInMsg.includes('email not confirmed') ||
        signInMsg.includes('not confirmed')
      ) {
        throw new Error('Account created! Please check your email and click the confirmation link before signing in.');
      }

      // Some other sign-in error (e.g. rate limit) — propagate it directly
      throw new Error(signInError.message || 'Account created but sign-in failed. Please try signing in manually.');
    }

    // Fallback: sign in with backoff for auth propagation delays
    let lastSignInError: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(300 + attempt * 400);
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (!signInError) return;
      lastSignInError = signInError;

      // FIX #9: Stop retrying immediately if confirmation is required —
      // no amount of retrying will help and it confuses the user.
      const msg = (signInError as any)?.message?.toLowerCase() ?? '';
      if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
        throw new Error('Account created! Please check your email and click the confirmation link before signing in.');
      }
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
