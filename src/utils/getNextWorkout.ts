/**
 * getNextWorkout — skips rest days, resilient to renamed workout days
 *
 * FIX #5: isToday was always returned as `false` when history existed,
 * regardless of whether the suggested next workout day should be done today.
 * Fix: if the most recent completed session was done on a previous calendar
 * day (not today), the next workout in the rotation is "Today's Workout".
 * If the most recent session was done today, the next day is "Next Workout"
 * (user already trained today).
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
}

function isRestDay(workoutPlan: WorkoutPlanShape, dayName: string): boolean {
  const exs = workoutPlan.workouts[dayName];
  return Array.isArray(exs) && exs.length === 1 && (exs[0] as any).__rest === true;
}

function isToday(isoDate: string): boolean {
  const d = new Date(isoDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate()
  );
}

export function getNextWorkout(
  workoutPlan: WorkoutPlanShape | null,
  workoutHistory: WorkoutHistoryEntry[],
): NextWorkout | null {
  if (!workoutPlan?.workouts) return null;

  const allDays      = Object.keys(workoutPlan.workouts);
  const trainingDays = allDays.filter(d => !isRestDay(workoutPlan, d));
  if (trainingDays.length === 0) return null;

  // No history → first training day, treat as today
  if (workoutHistory.length === 0) {
    return { day: trainingDays[0], isToday: true };
  }

  const dayIndexByName = new Map<string, number>(
    trainingDays.map((name, idx) => [name, idx])
  );

  // Walk history newest-first to find the last completed training day
  for (const session of workoutHistory) {
    const idx = dayIndexByName.get(session.dayName);
    if (idx !== undefined) {
      const nextIdx = (idx + 1) % trainingDays.length;
      // FIX #5: isToday is true only when the last session was NOT today —
      // meaning the user hasn't trained yet today and should do the next day.
      // If the last session was today, they already trained, so isToday=false.
      const lastSessionWasToday = isToday(session.completedAt);
      return { day: trainingDays[nextIdx], isToday: !lastSessionWasToday };
    }
  }

  // No history matched current plan — start from beginning
  return { day: trainingDays[0], isToday: true };
}
