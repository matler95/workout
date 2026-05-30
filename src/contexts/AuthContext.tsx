import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabase-client';
import { projectId } from '../../utils/supabase/info';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
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
    // Step 1: Try client-side signup (works if email confirm is OFF or already configured)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (!error && data.session) {
      // Email confirmation is OFF → session returned, user is signed in
      return;
    }

    if (!error && data?.user && !data.session) {
      // User was created but email confirmation is required.
      // Try signing in anyway — some projects have email confirm enabled
      // at the auth level but auto-confirm via triggers
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (!signInError) return;
      // If sign-in fails, user needs to check their email
      throw new Error('Account created! Please check your email to confirm before signing in.');
    }

    // Step 2: Edge function fallback (uses admin.createUser, bypasses confirmation)
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-975f4bc8/auth/signup`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, name }) }
    );
    const result = await response.json();
    if (result.error) throw new Error(result.error);

    // Step 3: Sign in after admin-created account
    await signIn(email, password);
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
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
