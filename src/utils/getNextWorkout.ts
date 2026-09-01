/**
 * getNextWorkout — skips rest days, resilient to renamed workout days
 *
 * FIX #5: isToday was always returned as `false` when history existed,
 * regardless of whether the suggested next workout day should be done today.
 * Fix: if the most recent completed session was done on a previous calendar
 * day (not today), the next workout in the rotation is "Today's Workout".
 * If the most recent session was done today, the next day is "Next Workout"
 * (user already trained today).
 *
 * Phase 6 (feedback item #2): the function previously only asked "was the
 * last session today?" — it had no concept of rest time at all. A session
 * Sunday night followed by one Monday morning passed that check cleanly,
 * even for a 3x/week plan that should have ~1 rest day between sessions.
 * We now derive a minimum rest-day gap from the user's target weekly
 * frequency and gate `isToday` on it, independent of calendar-week
 * boundaries (which is what let Sun+Mon count as "two different weeks").
 *
 * FIX (round 6): previous versions of the rotation logic all tried to
 * reconstruct "how much of the current cycle has been completed" by
 * walking history and collecting distinct training days, then either
 * picking the earliest untouched one (in plan order) or, once a full cycle
 * was detected, advancing past whichever day the walk happened to land on.
 * That whole model breaks the moment real training doesn't look like a
 * clean, non-repeating walk through the plan — which is the common case:
 * repeating a day (Pull, Pull), skipping a day, or doing a day out of plan
 * order all confuse "how many distinct days have I seen" as a proxy for
 * "where in the cycle am I." E.g. Pull, Pull, Push, Legs, Pull, Push (most
 * recent first) hits a repeat on the very first two entries, so the walk
 * only ever collects {Pull} and falls back to "earliest day not in that
 * set" = Push — even though Pull was just trained and Legs is next.
 *
 * A rotation doesn't need to reconstruct cycle progress at all: the only
 * thing that determines what's next is what was done most recently. So
 * nextDay is now simply "whichever training day comes after the most
 * recently completed one, in plan order" — cyclically wrapping past the
 * end of trainingDays. This is correct regardless of repeats, skips, gaps,
 * or out-of-order history, because it never tries to infer cycle state from
 * anything but the single most recent session.
 */

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
  /** Set when a minimum rest gap hasn't elapsed yet — ISO date it opens up. */
  availableOn?: string;
}

export function isRestDay(workoutPlan: WorkoutPlanShape, dayName: string): boolean {
  const exs = workoutPlan.workouts[dayName];
  return Array.isArray(exs) && exs.length === 1 && (exs[0] as any).__rest === true;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isToday(isoDate: string): boolean {
  return startOfDay(new Date(isoDate)).getTime() === startOfDay(new Date()).getTime();
}

function calendarDaysSince(isoDate: string): number {
  const ms = startOfDay(new Date()).getTime() - startOfDay(new Date(isoDate)).getTime();
  return Math.round(ms / 86400000);
}

/**
 * Rough minimum rest-day gap for a given weekly training frequency.
 * 3x/week → 1 rest day between sessions (e.g. Mon/Wed/Fri).
 * 5-6x/week → back-to-back days are normal, so no forced gap.
 * 1-2x/week → wider spacing expected.
 */
function minRestDaysFor(weeklyTargetDays: number | undefined): number {
  const n = weeklyTargetDays && weeklyTargetDays > 0 ? weeklyTargetDays : 3;
  return Math.max(0, Math.floor(7 / n) - 1);
}

export function getNextWorkout(
  workoutPlan: WorkoutPlanShape | null,
  workoutHistory: WorkoutHistoryEntry[],
  weeklyTargetDays?: number,
): NextWorkout | null {
  if (!workoutPlan?.workouts) return null;

  const allDays      = Object.keys(workoutPlan.workouts);
  const trainingDays = allDays.filter(d => !isRestDay(workoutPlan, d));
  if (trainingDays.length === 0) return null;

  // No history → first training day, treat as today
  if (workoutHistory.length === 0) {
    return { day: trainingDays[0], isToday: true };
  }

  const trainingDaySet = new Set(trainingDays);

  // Most recent session overall (regardless of which day it matched) governs
  // rest-gap spacing.
  const mostRecent = workoutHistory[0];
  const minRestDays = minRestDaysFor(weeklyTargetDays);
  const daysSinceMostRecent = mostRecent ? calendarDaysSince(mostRecent.completedAt) : Infinity;
  const restGapPending = daysSinceMostRecent < minRestDays;

  // Find the most recent session that actually matches a current training
  // day in the plan (the plan may have been edited since older sessions
  // were logged, so we can't just trust workoutHistory[0]).
  const referenceSession = workoutHistory.find(s => trainingDaySet.has(s.dayName));

  if (!referenceSession) {
    // No history matched current plan — start from beginning
    return { day: trainingDays[0], isToday: true };
  }

  // Next day in the rotation = whatever comes right after the most recently
  // completed day, in plan order, wrapping back to the start once the plan's
  // last training day was just done. This is deliberately the *only* signal
  // used — see the FIX (round 6) note above for why anything more clever
  // (reconstructing "cycle progress" from history) breaks on real-world
  // training patterns.
  const idx = trainingDays.indexOf(referenceSession.dayName);
  const nextDay = idx === -1 ? trainingDays[0] : trainingDays[(idx + 1) % trainingDays.length];

  if (restGapPending) {
    const availableOn = new Date(
      startOfDay(new Date(mostRecent.completedAt)).getTime() + minRestDays * 86400000
    ).toISOString();
    return { day: nextDay, isToday: false, availableOn };
  }

  // FIX #5: isToday is true only when the last session was NOT today —
  // meaning the user hasn't trained yet today and should do the next day.
  // If the last session was today, they already trained, so isToday=false.
  const lastSessionWasToday = isToday(referenceSession.completedAt);
  return { day: nextDay, isToday: !lastSessionWasToday };
}
