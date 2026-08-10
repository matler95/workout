/**
 * Shared navigation helper for entering /active-workout.
 *
 * FIX (bug report round 5, #1): ActiveWorkout previously read dayName only
 * from React Router's in-memory location.state. That's lost on anything that
 * reloads the tab (iOS PWA backgrounding a discarded tab, a hard refresh,
 * opening the app fresh) — ActiveWorkout would then see dayName===undefined
 * and silently redirect back to /plan with no visible error, which is
 * indistinguishable from "the Start Workout button doesn't work."
 *
 * sessionStorage is a same-tab, reload-surviving fallback. It's read once by
 * ActiveWorkout only when location.state is missing, and cleared once a
 * dayName has been consumed so it can't cause a stale/unexpected redirect
 * later in the session.
 */

const STORAGE_KEY = 'activeWorkoutDay';

export function rememberActiveWorkoutDay(dayName: string): void {
  try { sessionStorage.setItem(STORAGE_KEY, dayName); } catch { /* ignore */ }
}

// Note: deliberately does NOT clear the stored value — it's overwritten
// every time goToActiveWorkout() is called, and leaving it in place means a
// re-render (or a second reload) can keep recovering the same day rather
// than only working once.
export function readRememberedActiveWorkoutDay(): string | undefined {
  try {
    const val = sessionStorage.getItem(STORAGE_KEY);
    return val ?? undefined;
  } catch {
    return undefined;
  }
}

/** Navigate helper: pass the react-router `navigate` fn and the target day. */
export function goToActiveWorkout(
  navigate: (path: string, opts?: any) => void,
  dayName: string,
): void {
  rememberActiveWorkoutDay(dayName);
  navigate('/active-workout', { state: { dayName } });
}
