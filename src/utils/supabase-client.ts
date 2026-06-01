/**
 * Supabase client + API helper
 *
 * FIX #9: credentials now come from environment variables (VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY) instead of the gitignored utils/supabase/info.tsx.
 *
 * Setup:
 *   cp .env.example .env.local
 *   # fill in your values, then restart the dev server
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example → .env.local and fill in your values.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnon);

export const API_BASE = `${supabaseUrl}/functions/v1/make-server-975f4bc8`;

export async function apiCall(endpoint: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || supabaseAnon;

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'API call failed');
  }

  return response.json();
}
