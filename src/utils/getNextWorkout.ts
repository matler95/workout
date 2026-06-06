/**
 * getNextWorkout — skips rest days, resilient to renamed workout days
 *
 * Changes:
 * - Rest days (exercises = [{ __rest: true }]) are filtered out of the cycle.
 *   getNextWorkout only returns training days.
 * - Original rename-resilience logic preserved.
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

// A day is a rest day if its exercises array is [{ __rest: true }]
function isRestDay(workoutPlan: WorkoutPlanShape, dayName: string): boolean {
  const exs = workoutPlan.workouts[dayName];
  return Array.isArray(exs) && exs.length === 1 && (exs[0] as any).__rest === true;
}

export function getNextWorkout(
  workoutPlan: WorkoutPlanShape | null,
  workoutHistory: WorkoutHistoryEntry[],
): NextWorkout | null {
  if (!workoutPlan?.workouts) return null;

  // Only cycle through training days — rest days are skipped entirely
  const allDays      = Object.keys(workoutPlan.workouts);
  const trainingDays = allDays.filter(d => !isRestDay(workoutPlan, d));
  if (trainingDays.length === 0) return null;

  // No history — suggest first training day
  if (workoutHistory.length === 0) {
    return { day: trainingDays[0], isToday: true };
  }

  // Map training day name → index for O(1) lookup
  const dayIndexByName = new Map<string, number>(
    trainingDays.map((name, idx) => [name, idx])
  );

  // Walk history newest-first to find the last completed training day
  for (const session of workoutHistory) {
    const idx = dayIndexByName.get(session.dayName);
    if (idx !== undefined) {
      const nextIdx = (idx + 1) % trainingDays.length;
      return { day: trainingDays[nextIdx], isToday: false };
    }
  }

  // No history matched current plan — start from beginning
  return { day: trainingDays[0], isToday: false };
}
