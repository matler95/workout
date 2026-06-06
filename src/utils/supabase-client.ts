/**
 * Supabase client
 *
 * Exposes the Supabase client and a convenience `tables` object for
 * direct relational queries. All data-access logic lives in api.ts.
 *
 * Setup:
 *   cp .env.example .env.local
 *   # fill in your values, then restart the dev server
 *
 * Testing:
 *   In your test setup file (e.g. vitest.setup.ts), mock the module:
 *
 *     vi.mock('../utils/supabase-client', () => ({
 *       supabase: { auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() } },
 *     }));
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Env accessors ─────────────────────────────────────────────────────────────

function getEnv(key: string): string {
  return (
    (typeof import.meta !== 'undefined' && import.meta.env?.[key]) ||
    (typeof process !== 'undefined' && process.env?.[key]) ||
    ''
  );
}

// ── Lazy validation ───────────────────────────────────────────────────────────

let _validated = false;

function assertEnv(): void {
  if (_validated) return;
  const url  = getEnv('VITE_SUPABASE_URL');
  const anon = getEnv('VITE_SUPABASE_ANON_KEY');
  if (!url || !anon) {
    throw new Error(
      'Missing Supabase env vars. Copy .env.example → .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.',
    );
  }
  _validated = true;
}

// ── Lazy client ───────────────────────────────────────────────────────────────

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    assertEnv();
    _supabase = createClient(
      getEnv('VITE_SUPABASE_URL'),
      getEnv('VITE_SUPABASE_ANON_KEY'),
      {
        auth: {
          // Ensure sessions persist across reloads on the same device.
          persistSession: true,
          // Use browser localStorage when available (safe no-op on server).
          storage: typeof window !== 'undefined' ? window.localStorage : undefined,
          // Keep the session refreshed automatically when the access token expires.
          autoRefreshToken: true,
          // Prevent the auth library from trying to parse URL fragments in a SPA.
          detectSessionInUrl: false,
        },
      },
    );
  }
  return _supabase;
}

// ── Public exports ────────────────────────────────────────────────────────────

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabase()[prop as keyof SupabaseClient];
  },
});

// Typed table helpers for direct queries.
// Usage: supabase.from('user_profiles').select('*').eq('user_id', id)
// The `tables` helpers are optional syntactic sugar — you can also
// use `supabase.from('table_name')` directly.
export const tables = {
  profiles:       () => supabase.from('user_profiles'),
  workoutPlans:   () => supabase.from('workout_plans'),
  workoutSessions:() => supabase.from('workout_sessions'),
  workoutSets:    () => supabase.from('workout_sets'),
  bodyweightLog:  () => supabase.from('bodyweight_log'),
  bestSets:       () => supabase.from('best_sets_per_session'),
  weeklyVolume:   () => supabase.from('weekly_volume'),
  workoutsPerWeek:() => supabase.from('workouts_per_week'),
};

// ── Legacy stubs ──────────────────────────────────────────────────────────────
// These were previously used by the edge-function proxy. They are kept as
// no-op exports so existing imports don't break during the transition.
// Remove these after verifying nothing imports them anymore.

export const API_BASE = '';
export const apiCall = async () => {
  throw new Error(
    'apiCall() is no longer supported. Use the functions in api.ts instead, ' +
    'which query Supabase tables directly.',
  );
};