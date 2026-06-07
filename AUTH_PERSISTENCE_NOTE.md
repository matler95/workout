# Auth Persistence Fix

This note documents how the app now remembers users across reloads and PWA restarts, and exactly what changed.

## What was changed

1. `src/utils/supabase-client.ts`
   - Updated Supabase client initialization to include explicit auth configuration:
     - `persistSession: true`
     - `storage: window.localStorage`
     - `autoRefreshToken: true`
     - `detectSessionInUrl: false`
   - This ensures the Supabase session is stored locally and automatically refreshed when the access token expires.

2. `src/context/AuthContext.tsx`
   - The auth flow already reads the current session with `supabase.auth.getSession()` on startup.
   - Session data is stored in React state and exposed through the `AuthProvider`.
   - `AuthContext` was also updated to provide a clearer error message when signup fails due to an already-registered email.

3. `src/app/App.tsx`
   - Routing logic was updated to wait for auth initialization before redirecting.
   - Added a `PublicRoute` wrapper so authenticated users are redirected to `/dashboard` instead of seeing the login/signup pages.
   - This prevents the app from prematurely sending a user to the login page before the restored session is available.

4. `src/app/pages/Signup.tsx`
   - Added password confirmation and password complexity validation.
   - Added show/hide password toggles.
   - Signup now passes the entered name to onboarding via `navigate('/onboarding', { state: { name } })`.

5. `src/app/pages/Onboarding.tsx`
   - Reads `location.state.name` so the user’s name is prefilled in the onboarding flow.

## How to test

1. Start the app in production or PWA mode.
2. Sign in or sign up.
3. Close the PWA or refresh the browser.
4. Reopen the app.

If everything is working, the user should remain signed in and be redirected to the protected app routes without needing to log in again.

## Why this matters

- With Supabase auth stored in `localStorage`, the session should survive page reloads and app restarts on the same device.
- Proper route guarding prevents the app from mistakenly redirecting authenticated users back to login during startup.
- This is the standard flow for persistent login in a browser-based PWA.
