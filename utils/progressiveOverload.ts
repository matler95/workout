/**
 * Progressive Overload Engine
 *
 * Analyses a user's workout history for a specific exercise and returns
 * a weight/rep suggestion for the next session.
 *
 * Design principles:
 * - Uses e1RM (Epley) to normalise across rep ranges so comparisons are fair
 * - Classifies exercises into 4 load tiers, each with appropriate increment logic
 * - Suppresses suggestions when safety signals indicate the athlete isn't ready
 * - Returns a typed result so the UI can render rich, contextual feedback
 */

export type ExerciseTier =
  | 'heavy_barbell'   // squat, deadlift, bench, row, OHP  — flat +2.5 kg
  | 'compound_db_machine' // DB press, cable row, leg press — +5 % rounded to 2.5
  | 'isolation'       // curl, lateral raise, extension     — +5 % rounded to 1 kg
  | 'bodyweight';     // push-up, pull-up, dip              — +1 rep target

export interface SessionSetData {
  weight: number;   // kg (0 for pure bodyweight)
  reps: number;
}

export interface SessionData {
  completedAt: string;        // ISO date
  sets: SessionSetData[];
  perceivedEffort?: number;   // RPE 1-10
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
  suggestedWeight?: number;       // for increase_weight / deload
  suggestedReps?: [number, number]; // target rep range [lo, hi]
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

// ─── Rep targets per tier ─────────────────────────────────────────────────────

export function getRepTarget(tier: ExerciseTier): [number, number] {
  switch (tier) {
    case 'heavy_barbell':        return [4, 8];
    case 'compound_db_machine':  return [8, 12];
    case 'isolation':            return [10, 15];
    case 'bodyweight':           return [8, 15];
  }
}

// ─── e1RM calculation ─────────────────────────────────────────────────────────

/** Epley formula: weight * (1 + reps / 30) */
export function epley(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** Best e1RM across all sets in a session */
export function sessionE1RM(sets: SessionSetData[]): number {
  return Math.max(...sets.map(s => epley(s.weight, s.reps)));
}

/** Best top-set weight in a session (heaviest single set) */
export function topSetWeight(sets: SessionSetData[]): number {
  return Math.max(...sets.map(s => s.weight));
}

/** Average reps for the heaviest sets (top 50% by weight) */
export function avgRepsAtTopWeight(sets: SessionSetData[]): number {
  if (sets.length === 0) return 0;
  const sorted = [...sets].sort((a, b) => b.weight - a.weight);
  const topHalf = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  return topHalf.reduce((sum, s) => sum + s.reps, 0) / topHalf.length;
}

// ─── Increment logic ──────────────────────────────────────────────────────────

export function computeIncrease(
  tier: ExerciseTier,
  currentWeight: number,
): number {
  switch (tier) {
    case 'heavy_barbell':
      return 2.5;

    case 'compound_db_machine': {
      // 5%, rounded to nearest 2.5 kg, minimum 2.5
      const raw = currentWeight * 0.05;
      const rounded = Math.round(raw / 2.5) * 2.5;
      return Math.max(2.5, rounded);
    }

    case 'isolation': {
      // 5%, rounded to nearest 1 kg, minimum 1
      const raw = currentWeight * 0.05;
      const rounded = Math.round(raw);
      return Math.max(1, rounded);
    }

    case 'bodyweight':
      // Handled separately as rep target increase
      return 0;
  }
}

export function computeDeloadWeight(
  tier: ExerciseTier,
  currentWeight: number,
): number {
  // 10% reduction, rounded to nearest increment
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

// ─── Stall detection ──────────────────────────────────────────────────────────

/** Returns true if e1RM hasn't improved over the last N sessions */
function isStalling(e1RMs: number[], windowSize = 3): boolean {
  if (e1RMs.length < windowSize) return false;
  const recent = e1RMs.slice(-windowSize);
  const first = recent[0];
  const last = recent[recent.length - 1];
  // "Stalling" = less than 1% gain over the window
  return (last - first) / first < 0.01;
}

// ─── Main suggestion function ─────────────────────────────────────────────────

/**
 * Given an exercise name and an array of past sessions (oldest first),
 * returns a structured progression suggestion for the next session.
 */
export function computeSuggestion(
  exerciseName: string,
  sessions: SessionData[],
): ProgressionSuggestion {

  const tier = classifyExercise(exerciseName);
  const [repLo, repHi] = getRepTarget(tier);

  // ── Need at least 1 session ───────────────────────────────────────────────
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

  // e1RM trend
  const e1RMTrend: ProgressionSuggestion['e1RMTrend'] =
    previousE1RM === null ? 'unknown' :
    currentE1RM > previousE1RM * 1.005 ? 'up' :
    currentE1RM < previousE1RM * 0.995 ? 'down' : 'flat';

  // All e1RMs oldest→newest for stall detection
  const allE1RMs = sessions.map(s => sessionE1RM(s.sets));

  // ── Safety gate: deload signals ───────────────────────────────────────────
  const tooHard     = lastRPE >= 9;
  const stalling    = sessions.length >= 3 && isStalling(allE1RMs, 3);
  const regressedBadly = previousE1RM !== null && currentE1RM < previousE1RM * 0.93;

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

  // ── Bodyweight: increase rep target ──────────────────────────────────────
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

  // ── Weighted exercises ────────────────────────────────────────────────────
  const hitUpper     = avgReps >= repHi;
  const withinRange  = avgReps >= repLo && avgReps < repHi;
  const belowRange   = avgReps < repLo;

  // Insufficient data for confident suggestion
  if (sessions.length < 2) {
    return {
      action: 'maintain',
      currentWeight,
      suggestedReps: [repLo, repHi],
      currentE1RM,
      previousE1RM: null,
      e1RMTrend: 'unknown',
      confidence: 'low',
      reasoning: `Only one session logged. Complete another session at ${currentWeight} kg to establish a baseline.`,
    };
  }

  // ── Main decision ─────────────────────────────────────────────────────────
  if (hitUpper && !tooHard) {
    const increment = computeIncrease(tier, currentWeight);
    const suggested = Math.round((currentWeight + increment) * 10) / 10;

    // Extra confidence check: did e1RM improve too?
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
    // Stuck below rep range AND not progressing — suggest slight weight drop
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

  // Maintain — within range or early stages
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

// ─── Batch: compute suggestions for all exercises in a plan ──────────────────

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
}

/**
 * Given the full workout history, returns a map of exerciseId → suggestion.
 * Only exercises with at least 1 logged session are included.
 */
export function computeAllSuggestions(
  workoutHistory: WorkoutLog[],
): Record<string, ProgressionSuggestion> {
  // Group by exerciseName (we use name because IDs aren't always consistent)
  const byExercise: Record<string, { name: string; sessions: SessionData[] }> = {};

  const sorted = [...workoutHistory].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
  );

  for (const log of sorted) {
    // Group sets within this log by exercise
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
    }
  }

  const result: Record<string, ProgressionSuggestion> = {};
  for (const [key, { name, sessions }] of Object.entries(byExercise)) {
    result[key] = computeSuggestion(name, sessions);
  }
  return result;
}
