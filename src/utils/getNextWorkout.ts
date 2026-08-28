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
  // rest-gap spacing — unaffected by the rotation fix below.
  const mostRecent = workoutHistory[0];
  const minRestDays = minRestDaysFor(weeklyTargetDays);
  const daysSinceMostRecent = mostRecent ? calendarDaysSince(mostRecent.completedAt) : Infinity;
  const restGapPending = daysSinceMostRecent < minRestDays;

  // Walk history newest-first and collect which training days have been
  // completed *since the current rotation cycle started* — stop as soon as
  // we see a day repeat (that marks the start of the previous cycle) or
  // once every training day has been checked off (this cycle just
  // completed).
  //
  // This replaces the old "(lastDoneDayIndex + 1) % trainingDays.length"
  // approach, which assumed sessions always happen in plan order. If a
  // user trains out of order (plan is Push/Pull/Legs, they do Pull when
  // Push was suggested), the old logic advanced one slot past Pull and
  // suggested Legs next — permanently skipping Push for that cycle. This
  // version always suggests the earliest day (in plan order) not yet done
  // in the current cycle, so nothing gets silently skipped.
  const completedThisCycle = new Set<string>();
  let referenceSession: WorkoutHistoryEntry | undefined;
  for (const session of workoutHistory) {
    if (!trainingDaySet.has(session.dayName)) continue;
    if (!referenceSession) referenceSession = session;
    if (completedThisCycle.has(session.dayName)) break; // previous cycle boundary
    completedThisCycle.add(session.dayName);
    if (completedThisCycle.size === trainingDays.length) break; // cycle just completed
  }

  if (!referenceSession) {
    // No history matched current plan — start from beginning
    return { day: trainingDays[0], isToday: true };
  }

  // FIX (round 5): "full cycle done, restart at trainingDays[0]" ignored
  // *which* day the cycle actually ended on. It only looked at *how many*
  // distinct training days had been seen, not their order — so a user who
  // trained Legs -> Push -> Pull (a perfectly in-order cycle, just not
  // starting from trainingDays[0]) would see all 3 days checked off and get
  // sent back to trainingDays[0] ("Push") right after finishing Pull, even
  // though the natural next day in the rotation is Legs. The previous patch
  // only caught the narrower case where that restart happened to repeat the
  // exact day just trained; it didn't fix the general case of restarting to
  // the wrong day. Now, once a cycle completes, we continue the rotation
  // from whichever day was most recently completed — trainingDays[0] is
  // only used as a fallback if that day isn't found in the plan at all.
  let nextDay: string;
  if (completedThisCycle.size >= trainingDays.length) {
    const idx = trainingDays.indexOf(referenceSession.dayName);
    nextDay = idx === -1 ? trainingDays[0] : trainingDays[(idx + 1) % trainingDays.length];
  } else {
    nextDay = trainingDays.find(d => !completedThisCycle.has(d))!;  // earliest not-yet-done day, in plan order
  }

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
