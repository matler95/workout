/**
 * Smart Set Count
 *
 * Two paths:
 *
 * ── New user (no history) ─────────────────────────────────────────────────────
 * Uses onboarding data that was previously ignored for this purpose:
 *
 *   sessionLength + exerciseCount → time budget per exercise
 *     Each set takes ~2.75 min (work + rest). If the plan doesn't fit in the
 *     session, we reduce sets until it does.
 *
 *   trainingDays → weekly volume budget
 *     Training 5-6×/week means each session should be lower volume to avoid
 *     accumulating too much fatigue. Training 2-3×/week means each session
 *     can carry more volume.
 *
 *   primaryGoal → set count bias
 *     Strength goals: fewer, heavier sets (3 for intermediate, 4 for advanced)
 *     Hypertrophy: moderate sets (3 baseline)
 *     Fat loss / general: start conservative (2-3)
 *
 *   experienceLevel → final floor/ceiling
 *     Beginner: max 3 sets regardless (technique > volume)
 *     Intermediate: 3-4
 *     Advanced: 3-5
 *
 * ── Returning user (has history) ─────────────────────────────────────────────
 * Uses the progression engine's action to adjust from last logged set count:
 *   - deload          → max(1, lastSets - 1)
 *   - increase_weight → lastSets  (weight is the variable, not sets)
 *   - increase_reps   → lastSets
 *   - maintain        → lastSets
 *
 * The user can always override manually in the builder. This is intentionally
 * conservative — set count changes are a bigger recovery commitment than weight.
 */

import {
  computeAllSuggestions,
  type WorkoutLog,
} from '../../utils/progressiveOverload';

/** Memoised suggestions — computed once per builder load, keyed by exercise id/name */
export type SuggestionMap = ReturnType<typeof computeAllSuggestions>;

export interface NewUserProfile {
  experienceLevel: string;
  primaryGoal?: string;
  trainingDays?: number;
  sessionLength?: number;  // minutes
}

/**
 * Build a suggestion map from workout history.
 * Call this once when the builder loads, then pass to `smartSetCount`.
 */
export function buildSuggestionMap(history: WorkoutLog[]): SuggestionMap {
  return computeAllSuggestions(history);
}

/**
 * How many sets were logged for an exercise in the most recent session
 * that included it. Returns null if not found.
 */
function lastLoggedSetCount(
  exerciseKey: string,
  history: WorkoutLog[],
): number | null {
  for (const log of history) {
    const setsForEx = (log.sets || []).filter(
      s => s.exerciseId === exerciseKey || s.exerciseName === exerciseKey,
    );
    if (setsForEx.length > 0) {
      return Math.min(6, Math.max(1, setsForEx.length));
    }
  }
  return null;
}

// ─── New-user baseline ────────────────────────────────────────────────────────

/**
 * Derive a sensible starting set count from onboarding data alone.
 *
 * @param profile          User's onboarding answers
 * @param exercisesInDay   How many exercises are in this workout day (for time budget)
 */
export function newUserSetCount(
  profile: NewUserProfile | null,
  exercisesInDay: number = 6,
): number {
  if (!profile) return 3;

  const level    = profile.experienceLevel ?? 'intermediate';
  const goal     = profile.primaryGoal    ?? 'general_fitness';
  const days     = profile.trainingDays   ?? 3;
  const minutes  = profile.sessionLength  ?? 60;

  // ── Step 1: goal-based target ────────────────────────────────────────────
  // Strength goals benefit from more sets at lower reps.
  // Fat loss / general: start conservative to manage fatigue.
  const goalSets: Record<string, number> = {
    increase_strength:    level === 'advanced' ? 5 : level === 'intermediate' ? 4 : 3,
    build_muscle:         level === 'advanced' ? 4 : 3,
    athletic_performance: level === 'advanced' ? 4 : 3,
    general_fitness:      3,
    lose_fat:             2,
  };
  let target = goalSets[goal] ?? 3;

  // ── Step 2: frequency adjustment ────────────────────────────────────────
  // High-frequency trainers (5-6×/week) need lower per-session volume.
  // Low-frequency trainers (2×/week) can afford more per session.
  if (days >= 5) target = Math.max(2, target - 1);
  if (days <= 2) target = Math.min(target + 1, 4);

  // ── Step 3: time budget ──────────────────────────────────────────────────
  // Each set ≈ 2.75 min (45s work + 90s rest, averaged across compound/isolation).
  // Reserve 10 min warmup + 5 min cooldown.
  const effectiveMinutes  = Math.max(15, minutes - 15);
  const exerciseCount     = Math.max(1, exercisesInDay);
  const minutesPerExercise = effectiveMinutes / exerciseCount;
  const timeBudgetSets    = Math.floor(minutesPerExercise / 2.75);

  // Don't let the time budget push sets below 1 or above the goal target
  const timeCappedTarget = Math.min(target, Math.max(1, timeBudgetSets));

  // ── Step 4: experience ceiling ───────────────────────────────────────────
  const expCeiling: Record<string, number> = {
    beginner:     3,
    intermediate: 4,
    advanced:     5,
  };
  const ceiling = expCeiling[level] ?? 4;

  return Math.min(ceiling, Math.max(1, timeCappedTarget));
}

/**
 * Return the smart set count for an exercise.
 *
 * @param exerciseId      Stable exercise id (e.g. 'bench-press')
 * @param exerciseName    Display name (fallback key when id is absent)
 * @param suggestions     Pre-built suggestion map from `buildSuggestionMap`
 * @param history         Full workout history (newest first)
 * @param profile         User profile
 * @param exercisesInDay  Total exercises in this day (for time-budget calc)
 */
export function smartSetCount(
  exerciseId: string | undefined,
  exerciseName: string,
  suggestions: SuggestionMap,
  history: WorkoutLog[],
  profile: NewUserProfile | null,
  exercisesInDay: number = 6,
): number {
  const key        = exerciseId || exerciseName;
  const suggestion = suggestions[key];
  const lastCount  = lastLoggedSetCount(key, history);

  // ── No history → new-user onboarding-based baseline ──────────────────────
  if (!suggestion || suggestion.action === 'insufficient_data') {
    // If there's a last-session count but no engine suggestion yet (< 2 sessions),
    // trust what was actually logged over the computed baseline.
    return lastCount ?? newUserSetCount(profile, exercisesInDay);
  }

  // ── Has history → use last logged count, adjusted by engine action ────────
  const currentSets = lastCount ?? newUserSetCount(profile, exercisesInDay);

  switch (suggestion.action) {
    case 'deload':
      return Math.max(1, currentSets - 1);

    case 'increase_weight':
    case 'increase_reps':
    case 'maintain':
      return currentSets;

    default:
      return currentSets;
  }
}

/**
 * Human-readable explanation for why a set count was chosen.
 * Shown as a hint in the builder for transparency.
 */
export function setCountReason(
  exerciseId: string | undefined,
  exerciseName: string,
  suggestions: SuggestionMap,
  history: WorkoutLog[],
  profile: NewUserProfile | null,
  exercisesInDay: number = 6,
): string {
  const key        = exerciseId || exerciseName;
  const suggestion = suggestions[key];
  const lastCount  = lastLoggedSetCount(key, history);

  if (!suggestion || suggestion.action === 'insufficient_data') {
    if (lastCount) return `From your last session (${lastCount} sets)`;

    // Explain which onboarding signal drove the count
    const computed = newUserSetCount(profile, exercisesInDay);
    const minutes  = profile?.sessionLength ?? 60;
    const days     = profile?.trainingDays  ?? 3;
    if (days >= 5) return `${computed} sets — reduced for high training frequency`;
    if (minutes < 45) return `${computed} sets — fits your ${minutes} min session`;
    const level = profile?.experienceLevel ?? 'intermediate';
    if (level === 'beginner') return `${computed} sets — beginner starting point`;
    const goal = profile?.primaryGoal ?? '';
    if (goal === 'increase_strength') return `${computed} sets — strength goal`;
    if (goal === 'lose_fat') return `${computed} sets — conservative for fat loss`;
    return `${computed} sets — based on your profile`;
  }

  switch (suggestion.action) {
    case 'deload':
      return `Reduced to ${Math.max(1, (lastCount ?? 3) - 1)} sets — deload suggested`;
    case 'increase_weight':
      return `${lastCount ?? 3} sets — focus is weight, not volume`;
    case 'increase_reps':
      return `${lastCount ?? 3} sets — focus is reps, not volume`;
    case 'maintain':
      return `${lastCount ?? 3} sets — maintaining current load`;
    default:
      return 'Based on your history';
  }
}
