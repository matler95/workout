/**
 * Supabase client + API helper
 *
 * FIX #9 (previous): credentials come from VITE_SUPABASE_URL /
 *   VITE_SUPABASE_ANON_KEY instead of the gitignored info.tsx.
 *
 * FIX #8 (this patch): test-safe initialisation.
 *   The previous version called `throw new Error(...)` at module load time
 *   when env vars were absent. This caused every test file that imported
 *   anything from the app (directly or transitively) to crash before any
 *   test setup could run — even tests that never touch Supabase at all.
 *
 *   The fix defers env validation to the first actual API call. In test
 *   environments the client is replaced with a stub, and `apiCall` is
 *   mocked before it's ever invoked, so the missing-env error is never hit.
 *
 *   In development and production, `assertEnv()` runs the first time a real
 *   API call is made — which is early enough to surface a misconfiguration
 *   clearly without breaking the module graph.
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
 *       apiCall: vi.fn(),
 *       API_BASE: 'http://localhost/mock',
 *     }));
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Env accessors ─────────────────────────────────────────────────────────────

function getEnv(key: string): string {
  // Vite exposes env vars through import.meta.env; Jest/Vitest may use
  // process.env instead depending on configuration.
  return (
    (typeof import.meta !== 'undefined' && import.meta.env?.[key]) ||
    (typeof process !== 'undefined' && process.env?.[key]) ||
    ''
  );
}

// ── Lazy validation ───────────────────────────────────────────────────────────
//
// Called before the first real API request. Does NOT run at module load, so
// test files that import this module (or anything that imports it) won't crash
// when VITE_SUPABASE_URL is absent.

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
//
// The Supabase client is created on first use rather than at module load.
// This prevents the client constructor (which reads env vars) from running
// during test collection.

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    assertEnv();
    _supabase = createClient(
      getEnv('VITE_SUPABASE_URL'),
      getEnv('VITE_SUPABASE_ANON_KEY'),
    );
  }
  return _supabase;
}

// ── Public exports ────────────────────────────────────────────────────────────
//
// `supabase` is exposed as a getter-backed proxy so existing code that does
// `supabase.auth.getSession()` etc. continues to work without changes.
// The proxy defers client creation to the first property access.

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabase()[prop as keyof SupabaseClient];
  },
});

export const API_BASE = (() => {
  // Computed lazily via a getter so module-level evaluation stays safe.
  // At runtime this is called from `apiCall` which already runs after
  // app init, so `getEnv` will find the value.
  let _base: string | null = null;
  return {
    get value(): string {
      if (!_base) {
        const url = getEnv('VITE_SUPABASE_URL');
        _base = url ? `${url}/functions/v1/make-server-975f4bc8` : '';
      }
      return _base;
    },
  };
})();

export async function apiCall(endpoint: string, options: RequestInit = {}) {
  assertEnv(); // deferred validation — throws here, not at module load

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || getEnv('VITE_SUPABASE_ANON_KEY');

  const response = await fetch(`${API_BASE.value}${endpoint}`, {
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
