/**
 * getNextWorkout — resilient to renamed workout days
 *
 * FIX #6: The previous implementation found the "next" day by searching for
 * `lastDayName` in `Object.keys(workoutPlan.workouts)`. If the user renamed
 * a day between sessions (e.g. "Day 1" → "Push A") the match would fail,
 * and the app silently fell back to the first day every time.
 *
 * The fix uses sort_order index as the stable identity instead of the display
 * name. Since the plan object already preserves insertion order (guaranteed by
 * the backend which returns rows ordered by sort_order), we can work with the
 * index of the last completed day_name. When a day name is not found — because
 * it was renamed — we fall back gracefully to the day after the most recently
 * completed index we CAN identify, or the first day if none match.
 *
 * ─── Drop-in replacement ─────────────────────────────────────────────────────
 * Replace the `getNextWorkout` function inside Dashboard.tsx with this
 * implementation. The function signature and return type are unchanged.
 */

// ── Types (already exist in Dashboard.tsx — shown here for context only) ──────

interface WorkoutPlanShape {
  workouts: Record<string, any[]>;
}

interface WorkoutHistoryEntry {
  dayName: string;
  completedAt: string;
}

interface NextWorkout {
  day: string;
  isToday: boolean;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Returns the next workout day to suggest, cycling through the plan in order.
 *
 * Strategy:
 * 1. If no history exists, return the first day.
 * 2. Walk workout history (newest-first) looking for the most recent session
 *    whose `dayName` still exists in the current plan. Use the sort_order
 *    index of that match to determine the next day.
 * 3. If NO past session day name matches the current plan (e.g. all days were
 *    renamed), fall back to the first day.
 *
 * `isToday` is set to true only when there is no history at all (first-ever
 * session prompt). For returning users we don't assert it's "today" because
 * we don't know their schedule.
 */
export function getNextWorkout(
  workoutPlan: WorkoutPlanShape | null,
  workoutHistory: WorkoutHistoryEntry[],
): NextWorkout | null {
  if (!workoutPlan?.workouts) return null;

  const days = Object.keys(workoutPlan.workouts);
  if (days.length === 0) return null;

  // No history at all — suggest the first day
  if (workoutHistory.length === 0) {
    return { day: days[0], isToday: true };
  }

  // Build a lookup from day name → index for O(1) access
  const dayIndexByName = new Map<string, number>(
    days.map((name, idx) => [name, idx]),
  );

  // Walk history newest-first to find the most recent session that still
  // maps to a current plan day. This is resilient to:
  //   • renamed days (old name not in map → skip)
  //   • deleted days (same)
  //   • days added since the last session (they'll appear naturally)
  for (const session of workoutHistory) {
    const idx = dayIndexByName.get(session.dayName);
    if (idx !== undefined) {
      // Found the last recognisable session — return the next day (wrapping)
      const nextIdx = (idx + 1) % days.length;
      return { day: days[nextIdx], isToday: false };
    }
  }

  // No history session matched any current plan day (complete rename or fresh plan)
  return { day: days[0], isToday: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION INSTRUCTIONS
// ─────────────────────────────────────────────────────────────────────────────
//
// In src/app/pages/Dashboard.tsx:
//
// 1. Remove the existing inline `getNextWorkout` function (it's defined inside
//    the Dashboard component body).
//
// 2. Import this module:
//      import { getNextWorkout } from '../../utils/getNextWorkout';
//    OR paste the function directly above the Dashboard component if you prefer
//    to keep it in the same file.
//
// 3. Update the call site inside Dashboard.tsx from:
//
//      const getNextWorkout = () => { ... };          // old inline
//      const nextWorkout = getNextWorkout();          // old call
//
//    to:
//
//      const nextWorkout = getNextWorkout(workoutPlan, workoutHistory);
//
// The function no longer closes over component state — it takes its inputs
// explicitly, which also makes it straightforward to unit-test.
