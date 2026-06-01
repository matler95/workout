/**
 * Progressive Overload Engine
 *
 * FIX #2 (previous): WorkoutLog carries rpeCorrections so first-session
 *   calibrations propagate to the next suggestion.
 *
 * FIX #4 (this patch): One-session dead zone eliminated.
 *   Previously, sessions.length < 2 always returned action:'maintain' with
 *   confidence:'low' and no directional guidance. Now the engine generates a
 *   low-confidence directional suggestion based on the available data:
 *     - RPE from the session (if provided)
 *     - Avg reps vs the target range
 *     - Whether there is an RPE correction override
 *   This gives the user something actionable after their first session instead
 *   of just "come back after your second session."
 */

export type ExerciseTier =
  | 'heavy_barbell'
  | 'compound_db_machine'
  | 'isolation'
  | 'bodyweight';

export interface SessionSetData {
  weight: number;
  reps: number;
}

export interface SessionData {
  completedAt: string;
  sets: SessionSetData[];
  perceivedEffort?: number;
  feedback?: string;
}

export type SuggestionAction =
  | 'increase_weight'
  | 'increase_reps'
  | 'maintain'
  | 'deload'
  | 'insufficient_data';

export interface ProgressionSuggestion {
  action: SuggestionAction;
  currentWeight: number;
  suggestedWeight?: number;
  suggestedReps?: [number, number];
  currentE1RM: number;
  previousE1RM: number | null;
  e1RMTrend: 'up' | 'flat' | 'down' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  tip?: string;
}

// ─── Exercise classification ──────────────────────────────────────────────────

const HEAVY_BARBELL_KEYWORDS = [
  'barbell', 'squat', 'deadlift', 'bench press', 'overhead press',
  'barbell row', 'barbell curl', 'barbell lunge', 'barbell rdl',
  'romanian deadlift', 'sumo', 'front squat', 'hack squat',
];

const BODYWEIGHT_KEYWORDS = [
  'push-up', 'pushup', 'pull-up', 'pullup', 'chin-up', 'chinup',
  'dip', 'bodyweight', 'bw ', 'plank', 'hanging', 'l-sit',
];

const ISOLATION_KEYWORDS = [
  'curl', 'lateral raise', 'front raise', 'fly', 'flye',
  'extension', 'kickback', 'shrug', 'calf raise', 'face pull',
  'cable curl', 'hammer curl', 'preacher',
];

export function classifyExercise(exerciseName: string): ExerciseTier {
  const n = exerciseName.toLowerCase();
  if (BODYWEIGHT_KEYWORDS.some(k => n.includes(k))) return 'bodyweight';
  if (HEAVY_BARBELL_KEYWORDS.some(k => n.includes(k))) return 'heavy_barbell';
  if (ISOLATION_KEYWORDS.some(k => n.includes(k))) return 'isolation';
  return 'compound_db_machine';
}

export function getRepTarget(tier: ExerciseTier): [number, number] {
  switch (tier) {
    case 'heavy_barbell':        return [4, 8];
    case 'compound_db_machine':  return [8, 12];
    case 'isolation':            return [10, 15];
    case 'bodyweight':           return [8, 15];
  }
}

export function epley(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function sessionE1RM(sets: SessionSetData[]): number {
  return Math.max(...sets.map(s => epley(s.weight, s.reps)));
}

export function topSetWeight(sets: SessionSetData[]): number {
  return Math.max(...sets.map(s => s.weight));
}

export function avgRepsAtTopWeight(sets: SessionSetData[]): number {
  if (sets.length === 0) return 0;
  const sorted = [...sets].sort((a, b) => b.weight - a.weight);
  const topHalf = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  return topHalf.reduce((sum, s) => sum + s.reps, 0) / topHalf.length;
}

export function computeIncrease(tier: ExerciseTier, currentWeight: number): number {
  switch (tier) {
    case 'heavy_barbell':
      return 2.5;
    case 'compound_db_machine': {
      const raw = currentWeight * 0.05;
      const rounded = Math.round(raw / 2.5) * 2.5;
      return Math.max(2.5, rounded);
    }
    case 'isolation': {
      const raw = currentWeight * 0.05;
      const rounded = Math.round(raw);
      return Math.max(1, rounded);
    }
    case 'bodyweight':
      return 0;
  }
}

export function computeDeloadWeight(tier: ExerciseTier, currentWeight: number): number {
  const reduction = currentWeight * 0.10;
  switch (tier) {
    case 'heavy_barbell':
      return Math.round((currentWeight - reduction) / 2.5) * 2.5;
    case 'compound_db_machine':
      return Math.round((currentWeight - reduction) / 2.5) * 2.5;
    case 'isolation':
      return Math.round(currentWeight - reduction);
    case 'bodyweight':
      return 0;
  }
}

function isStalling(e1RMs: number[], windowSize = 3): boolean {
  if (e1RMs.length < windowSize) return false;
  const recent = e1RMs.slice(-windowSize);
  const first = recent[0];
  const last = recent[recent.length - 1];
  return (last - first) / first < 0.01;
}

// ─── FIX #4: One-session directional suggestion ───────────────────────────────
//
// When only a single session exists we can still give useful guidance.
// We have three signals:
//   1. avgReps vs target range  → weight too light / too heavy / about right
//   2. perceivedEffort (RPE)    → subjective difficulty
//   3. rpeCorrection override   → already handled by computeAllSuggestions
//
// Rules (conservative — confidence is always 'low'):
//   RPE ≤ 4 AND reps > repHi   → suggest increase_weight (too easy on both counts)
//   RPE ≤ 4                    → suggest increase_weight (felt very easy)
//   reps > repHi               → suggest increase_reps target for now, weight next
//   RPE ≥ 9                    → suggest deload (too hard on first exposure)
//   reps < repLo               → maintain, focus on hitting rep floor
//   otherwise                  → maintain, aiming for top of rep range

function buildOneSuggestion(
  exerciseName: string,
  session: SessionData,
): ProgressionSuggestion {
  const tier = classifyExercise(exerciseName);
  const [repLo, repHi] = getRepTarget(tier);

  const currentWeight = topSetWeight(session.sets);
  const currentE1RM   = sessionE1RM(session.sets);
  const avgReps       = avgRepsAtTopWeight(session.sets);
  const rpe           = session.perceivedEffort ?? 6; // default: moderate

  // Bodyweight: only rep guidance
  if (tier === 'bodyweight') {
    if (avgReps > repHi && rpe <= 6) {
      return {
        action: 'increase_reps',
        currentWeight: 0,
        suggestedReps: [repLo + 2, repHi + 2],
        currentE1RM,
        previousE1RM: null,
        e1RMTrend: 'unknown',
        confidence: 'low',
        reasoning: `First session: you averaged ${Math.round(avgReps)} reps — above the ${repHi}-rep ceiling at RPE ${rpe}. Aim for ${repLo + 2}–${repHi + 2} reps next time.`,
        tip: 'One session isn\'t enough to confirm progress, but this is a good sign.',
      };
    }
    return {
      action: 'maintain',
      currentWeight: 0,
      suggestedReps: [repLo, repHi],
      currentE1RM,
      previousE1RM: null,
      e1RMTrend: 'unknown',
      confidence: 'low',
      reasoning: `First session: ${Math.round(avgReps)} reps. Keep working toward ${repHi} clean reps before progressing. Complete a second session to get a more reliable suggestion.`,
    };
  }

  // Weighted: RPE + rep range signal
  if ((rpe <= 4 && avgReps > repHi) || rpe <= 3) {
    const increment = computeIncrease(tier, currentWeight);
    const suggested = Math.round((currentWeight + increment) * 10) / 10;
    return {
      action: 'increase_weight',
      currentWeight,
      suggestedWeight: suggested,
      suggestedReps: [repLo, repHi],
      currentE1RM,
      previousE1RM: null,
      e1RMTrend: 'unknown',
      confidence: 'low',
      reasoning: `First session: RPE ${rpe}/10${avgReps > repHi ? ` and ${Math.round(avgReps)} reps (above the ${repHi}-rep ceiling)` : ''}. Starting weight looks conservative — try ${suggested} kg next session.`,
      tip: 'Low confidence: one session is not enough to confirm this. Adjust if it feels wrong.',
    };
  }

  if (rpe >= 9) {
    const reduced = computeDeloadWeight(tier, currentWeight);
    return {
      action: 'deload',
      currentWeight,
      suggestedWeight: reduced,
      suggestedReps: [repLo, repHi],
      currentE1RM,
      previousE1RM: null,
      e1RMTrend: 'unknown',
      confidence: 'low',
      reasoning: `First session: RPE ${rpe}/10 — the starting weight may be too high. Try ${reduced} kg next session to build form and confidence.`,
      tip: 'Starting lighter is always safer than starting too heavy.',
    };
  }

  if (avgReps > repHi && rpe <= 7) {
    return {
      action: 'maintain',
      currentWeight,
      suggestedReps: [repHi, repHi],
      currentE1RM,
      previousE1RM: null,
      e1RMTrend: 'unknown',
      confidence: 'low',
      reasoning: `First session: ${Math.round(avgReps)} reps at ${currentWeight} kg (above target range) but RPE was ${rpe}/10. Stay at this weight and aim to hit ${repHi} reps consistently before adding load.`,
    };
  }

  if (avgReps < repLo) {
    return {
      action: 'maintain',
      currentWeight,
      suggestedReps: [repLo, repHi],
      currentE1RM,
      previousE1RM: null,
      e1RMTrend: 'unknown',
      confidence: 'low',
      reasoning: `First session: ${Math.round(avgReps)} reps — below the ${repLo}–${repHi} target. Focus on hitting ${repLo} clean reps before adding weight. Complete a second session for a better suggestion.`,
    };
  }

  // In range and moderate RPE — textbook first session
  return {
    action: 'maintain',
    currentWeight,
    suggestedReps: [repLo, repHi],
    currentE1RM,
    previousE1RM: null,
    e1RMTrend: 'unknown',
    confidence: 'low',
    reasoning: `First session: ${Math.round(avgReps)} reps at ${currentWeight} kg (RPE ${rpe}/10) — right in the target range. Complete a second session at the same weight to confirm before progressing.`,
    tip: 'Good first session. One more at this weight and the engine will have enough data to make a confident recommendation.',
  };
}

export function computeSuggestion(
  exerciseName: string,
  sessions: SessionData[],
): ProgressionSuggestion {
  const tier = classifyExercise(exerciseName);
  const [repLo, repHi] = getRepTarget(tier);

  if (sessions.length === 0) {
    return {
      action: 'insufficient_data',
      currentWeight: 0,
      currentE1RM: 0,
      previousE1RM: null,
      e1RMTrend: 'unknown',
      confidence: 'low',
      reasoning: 'No history yet — establish a baseline first.',
    };
  }

  const lastSession = sessions[sessions.length - 1];
  const prevSession = sessions.length >= 2 ? sessions[sessions.length - 2] : null;

  const currentWeight = topSetWeight(lastSession.sets);
  const currentE1RM   = sessionE1RM(lastSession.sets);
  const previousE1RM  = prevSession ? sessionE1RM(prevSession.sets) : null;
  const avgReps       = avgRepsAtTopWeight(lastSession.sets);
  const lastRPE       = lastSession.perceivedEffort ?? 5;

  const e1RMTrend: ProgressionSuggestion['e1RMTrend'] =
    previousE1RM === null ? 'unknown' :
    currentE1RM > previousE1RM * 1.005 ? 'up' :
    currentE1RM < previousE1RM * 0.995 ? 'down' : 'flat';

  const allE1RMs = sessions.map(s => sessionE1RM(s.sets));

  const tooHard        = lastRPE >= 9;
  const stalling       = sessions.length >= 3 && isStalling(allE1RMs, 3);
  const regressedBadly = previousE1RM !== null && currentE1RM < previousE1RM * 0.93;

  // FIX #4: delegate single-session path to the new directional helper
  if (sessions.length === 1) {
    return buildOneSuggestion(exerciseName, lastSession);
  }

  if (regressedBadly && sessions.length >= 2) {
    return {
      action: 'deload',
      currentWeight,
      suggestedWeight: computeDeloadWeight(tier, currentWeight),
      suggestedReps: [repLo, repHi],
      currentE1RM,
      previousE1RM,
      e1RMTrend,
      confidence: 'high',
      reasoning: `Your strength dropped more than 7% vs last session. A short deload (reduce weight ~10%) will help you recover and come back stronger.`,
      tip: 'Deloads are planned recovery — not failure.',
    };
  }

  if (tooHard && stalling) {
    return {
      action: 'deload',
      currentWeight,
      suggestedWeight: computeDeloadWeight(tier, currentWeight),
      suggestedReps: [repLo, repHi],
      currentE1RM,
      previousE1RM,
      e1RMTrend,
      confidence: 'medium',
      reasoning: `RPE was ${lastRPE}/10 last session and strength has plateaued for 3 sessions. Try a light deload week to reset fatigue.`,
      tip: 'Fatigue masks fitness — rest reveals it.',
    };
  }

  if (tier === 'bodyweight') {
    const hitUpper = avgReps >= repHi;
    if (hitUpper && !tooHard) {
      return {
        action: 'increase_reps',
        currentWeight: 0,
        suggestedReps: [repLo + 2, repHi + 2],
        currentE1RM,
        previousE1RM,
        e1RMTrend,
        confidence: sessions.length >= 2 ? 'high' : 'medium',
        reasoning: `You averaged ${Math.round(avgReps)} reps — above the ${repHi}-rep ceiling. Bump your target to ${repLo + 2}–${repHi + 2} reps next session.`,
        tip: 'Once you can do more than 20 bodyweight reps consistently, consider adding a weighted vest.',
      };
    }
    return {
      action: 'maintain',
      currentWeight: 0,
      suggestedReps: [repLo, repHi],
      currentE1RM,
      previousE1RM,
      e1RMTrend,
      confidence: 'medium',
      reasoning: `You're at ${Math.round(avgReps)} reps — keep working toward ${repHi} clean reps before progressing.`,
    };
  }

  const hitUpper    = avgReps >= repHi;
  const withinRange = avgReps >= repLo && avgReps < repHi;
  const belowRange  = avgReps < repLo;

  if (hitUpper && !tooHard) {
    const increment = computeIncrease(tier, currentWeight);
    const suggested = Math.round((currentWeight + increment) * 10) / 10;
    const confidence: ProgressionSuggestion['confidence'] =
      e1RMTrend === 'up' ? 'high' :
      e1RMTrend === 'flat' ? 'medium' : 'low';

    return {
      action: 'increase_weight',
      currentWeight,
      suggestedWeight: suggested,
      suggestedReps: [repLo, repHi],
      currentE1RM,
      previousE1RM,
      e1RMTrend,
      confidence,
      reasoning: buildIncreaseReasoning(tier, currentWeight, suggested, avgReps, repHi, increment),
      tip: buildTip(tier, increment, currentWeight),
    };
  }

  if (belowRange && stalling && !tooHard) {
    const lightReduction = computeDeloadWeight(tier, currentWeight);
    return {
      action: 'deload',
      currentWeight,
      suggestedWeight: lightReduction,
      suggestedReps: [repLo, repHi],
      currentE1RM,
      previousE1RM,
      e1RMTrend,
      confidence: 'medium',
      reasoning: `You're below the target rep range (${repLo}–${repHi}) and haven't improved in 3 sessions. Try a 10% reduction to rebuild momentum.`,
    };
  }

  return {
    action: 'maintain',
    currentWeight,
    suggestedReps: [repLo, repHi],
    currentE1RM,
    previousE1RM,
    e1RMTrend,
    confidence: withinRange ? 'high' : 'medium',
    reasoning: buildMaintainReasoning(avgReps, repLo, repHi, currentWeight, e1RMTrend),
  };
}

// ─── Reasoning helpers ────────────────────────────────────────────────────────

function buildIncreaseReasoning(
  tier: ExerciseTier,
  current: number,
  suggested: number,
  avgReps: number,
  repHi: number,
  increment: number,
): string {
  const pct = Math.round((increment / current) * 100);
  const tierLabel = {
    heavy_barbell: 'heavy barbell movement',
    compound_db_machine: 'compound movement',
    isolation: 'isolation exercise',
    bodyweight: 'bodyweight movement',
  }[tier];
  return `You averaged ${Math.round(avgReps)} reps — above the ${repHi}-rep ceiling. For a ${tierLabel}, a ${
    tier === 'heavy_barbell' ? `flat +${increment} kg` : `${pct}% increase (+${increment} kg)`
  } is appropriate. Try ${suggested} kg next session.`;
}

function buildMaintainReasoning(
  avgReps: number,
  repLo: number,
  repHi: number,
  weight: number,
  trend: string,
): string {
  if (avgReps < repLo) {
    return `You're averaging ${Math.round(avgReps)} reps — below the ${repLo}–${repHi} target range. Stay at ${weight} kg and focus on technique until you hit ${repLo} clean reps.`;
  }
  const trendPhrase = trend === 'up' ? 'and your estimated strength is trending up' :
    trend === 'flat' ? 'consistency is your current focus' : '';
  return `Good work — you're within the ${repLo}–${repHi} rep target at ${weight} kg ${trendPhrase}. Keep building volume before increasing the load.`.trim();
}

function buildTip(tier: ExerciseTier, increment: number, current: number): string {
  if (tier === 'heavy_barbell') {
    return `${increment} kg is the smallest standard plate increment — respect it. Consistent small jumps compound into big strength gains.`;
  }
  if (tier === 'isolation') {
    return `Small isolation increases (${increment} kg) keep joint stress manageable. If ${increment} kg feels like too much, try adding one extra set first.`;
  }
  const pct = Math.round((increment / current) * 100);
  return `A ${pct}% increase keeps progress sustainable without spiking injury risk.`;
}

// ─── WorkoutLog type ──────────────────────────────────────────────────────────

export interface WorkoutLog {
  dayName: string;
  completedAt: string;
  sets: Array<{
    exerciseId: string;
    exerciseName: string;
    weight: number;
    reps: number;
  }>;
  perceivedEffort?: number;
  rpeCorrections?: Record<string, number>;
}

export function computeAllSuggestions(
  workoutHistory: WorkoutLog[],
): Record<string, ProgressionSuggestion> {
  const byExercise: Record<string, { name: string; sessions: SessionData[]; rpeCorrection?: number }> = {};

  const sorted = [...workoutHistory].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
  );

  for (const log of sorted) {
    const exerciseSets: Record<string, { sets: SessionSetData[]; name: string }> = {};
    for (const s of (log.sets || [])) {
      const key = s.exerciseId || s.exerciseName;
      if (!exerciseSets[key]) exerciseSets[key] = { sets: [], name: s.exerciseName };
      exerciseSets[key].sets.push({ weight: s.weight, reps: s.reps });
    }

    for (const [key, { sets, name }] of Object.entries(exerciseSets)) {
      if (!byExercise[key]) byExercise[key] = { name, sessions: [] };
      byExercise[key].sessions.push({
        completedAt: log.completedAt,
        sets,
        perceivedEffort: log.perceivedEffort,
      });
      if (log.rpeCorrections?.[key] !== undefined) {
        byExercise[key].rpeCorrection = log.rpeCorrections[key];
      }
    }
  }

  const result: Record<string, ProgressionSuggestion> = {};

  for (const [key, { name, sessions, rpeCorrection }] of Object.entries(byExercise)) {
    const suggestion = computeSuggestion(name, sessions);

    // RPE correction override: one session + saved correction → use corrected weight
    if (
      sessions.length === 1 &&
      rpeCorrection !== undefined &&
      rpeCorrection > 0 &&
      suggestion.action !== 'insufficient_data'
    ) {
      const tier = classifyExercise(name);
      if (tier !== 'bodyweight') {
        result[key] = {
          ...suggestion,
          action: rpeCorrection !== suggestion.currentWeight ? 'increase_weight' : 'maintain',
          suggestedWeight: rpeCorrection,
          reasoning: `Starting weight adjusted to ${rpeCorrection} kg based on your effort rating from the first session. Complete another session to refine further.`,
          confidence: 'medium',
        };
        continue;
      }
    }

    result[key] = suggestion;
  }

  return result;
}
