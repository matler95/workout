/**
 * Progressive Overload Engine
 *
 * Phase 2 changes:
 *   - WorkoutLog sets now carry optional `equipmentType` field
 *   - computeAllSuggestions groups history by composite key:
 *       `${exerciseId}::${equipmentType}` when equipmentType is present
 *       `${exerciseId}` (legacy fallback) when equipmentType is absent
 *   - This means barbell bench press and dumbbell bench press get separate
 *     progression curves, not merged together
 *   - BACKWARD COMPATIBLE: old rows without equipmentType use the plain
 *     exerciseId key, matching existing stored suggestion results
 *
 * Previous fixes preserved:
 *   - FIX #2: rpeCorrections propagation
 *   - FIX #4: One-session directional suggestion
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

// --- Exercise classification --------------------------------------------------

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

export function detectIntraSessionFatigue(sets: SessionSetData[]): {
  fatigued: boolean;
  decline: number;
  firstSetReps: number;
  lastSetReps: number;
} {
  if (sets.length < 2) {
    return { fatigued: false, decline: 0, firstSetReps: 0, lastSetReps: 0 };
  }

  const sorted = [...sets].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return 0;
  });

  const topWeight = sorted[0].weight;
  const topWeightSets = sorted.filter(s => s.weight === topWeight);

  if (topWeightSets.length < 2) {
    return { fatigued: false, decline: 0, firstSetReps: 0, lastSetReps: 0 };
  }

  const firstSetReps = topWeightSets[0].reps;
  const lastSetReps = topWeightSets[topWeightSets.length - 1].reps;
  const decline = (firstSetReps - lastSetReps) / firstSetReps;
  const fatigued = decline > 0.2;

  return { fatigued, decline, firstSetReps, lastSetReps };
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

// --- Phase 2: Composite history key ------------------------------------------

/**
 * Builds the history key for a set.
 *
 * With equipment type (Phase 2 new rows):
 *   "barbellbenchpress-mediumgrip::barbell"
 *   "dumbbellbenchpress::dumbbell"
 *   "legpress::machine"
 *
 * Without equipment type (legacy rows, backward compat):
 *   "barbellbenchpress-mediumgrip"
 *   "legpress"
 *
 * This ensures old progression history is never lost and new history
 * is separated cleanly by equipment variant.
 */
export function buildHistoryKey(
  exerciseId: string,
  exerciseName: string,
  equipmentType?: string,
): string {
  const base = (exerciseId && exerciseId.trim() !== '') ? exerciseId : exerciseName;
  if (equipmentType && equipmentType.trim() !== '') {
    return `${base}::${equipmentType}`;
  }
  return base;
}

/**
 * Extracts the base exercise key (without equipment suffix) from a history key.
 * Used when looking up legacy data alongside new equipment-aware data.
 */
export function stripEquipmentSuffix(historyKey: string): string {
  const idx = historyKey.lastIndexOf('::');
  return idx === -1 ? historyKey : historyKey.slice(0, idx);
}

/**
 * Extracts the equipment type from a composite key, if present.
 */
export function extractEquipmentType(historyKey: string): string | undefined {
  const idx = historyKey.lastIndexOf('::');
  return idx === -1 ? undefined : historyKey.slice(idx + 2);
}

// --- One-session directional suggestion (FIX #4) -----------------------------

function buildOneSuggestion(
  exerciseName: string,
  session: SessionData,
): ProgressionSuggestion {
  const tier = classifyExercise(exerciseName);
  const [repLo, repHi] = getRepTarget(tier);

  const currentWeight = topSetWeight(session.sets);
  const currentE1RM   = sessionE1RM(session.sets);
  const avgReps       = avgRepsAtTopWeight(session.sets);
  const rpe           = session.perceivedEffort ?? 6;

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
        reasoning: `First session: you averaged ${Math.round(avgReps)} reps - above the ${repHi}-rep ceiling at RPE ${rpe}. Aim for ${repLo + 2}-${repHi + 2} reps next time.`,
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
      reasoning: `First session: ${Math.round(avgReps)} reps. Keep working toward ${repHi} clean reps before progressing.`,
    };
  }

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
      reasoning: `First session: RPE ${rpe}/10${avgReps > repHi ? ` and ${Math.round(avgReps)} reps (above the ${repHi}-rep ceiling)` : ''}. Starting weight looks conservative - try ${suggested} kg next session.`,
      tip: 'Low confidence: one session is not enough to confirm this.',
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
      reasoning: `First session: RPE ${rpe}/10 - the starting weight may be too high. Try ${reduced} kg next session.`,
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
      reasoning: `First session: ${Math.round(avgReps)} reps - below the ${repLo}-${repHi} target. Focus on hitting ${repLo} clean reps before adding weight.`,
    };
  }

  return {
    action: 'maintain',
    currentWeight,
    suggestedReps: [repLo, repHi],
    currentE1RM,
    previousE1RM: null,
    e1RMTrend: 'unknown',
    confidence: 'low',
    reasoning: `First session: ${Math.round(avgReps)} reps at ${currentWeight} kg (RPE ${rpe}/10) - right in the target range. Complete a second session to confirm before progressing.`,
    tip: 'Good first session. One more at this weight and the engine will have enough data.',
  };
}

// --- Main suggestion engine ---------------------------------------------------

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
      reasoning: 'No history yet - establish a baseline first.',
    };
  }

  const lastSession = sessions[sessions.length - 1];
  const prevSession = sessions.length >= 2 ? sessions[sessions.length - 2] : null;

  const currentWeight = topSetWeight(lastSession.sets);
  const currentE1RM   = sessionE1RM(lastSession.sets);
  const previousE1RM  = prevSession ? sessionE1RM(prevSession.sets) : null;
  const avgReps       = avgRepsAtTopWeight(lastSession.sets);
  const lastRPE       = lastSession.perceivedEffort ?? 5;

  const fatigueMeasure = detectIntraSessionFatigue(lastSession.sets);
  const highIntraSessionFatigue = fatigueMeasure.fatigued;

  const e1RMTrend: ProgressionSuggestion['e1RMTrend'] =
    previousE1RM === null ? 'unknown' :
    currentE1RM > previousE1RM * 1.005 ? 'up' :
    currentE1RM < previousE1RM * 0.995 ? 'down' : 'flat';

  const allE1RMs = sessions.map(s => sessionE1RM(s.sets));

  const tooHard        = lastRPE >= 9;
  const stalling       = sessions.length >= 3 && isStalling(allE1RMs, 3);
  const regressedBadly = previousE1RM !== null && currentE1RM < previousE1RM * 0.93;

  if (sessions.length === 1) {
    return buildOneSuggestion(exerciseName, lastSession);
  }

  if (highIntraSessionFatigue && lastRPE >= 7) {
    const pctDecline = Math.round(fatigueMeasure.decline * 100);
    const reduced = computeDeloadWeight(tier, currentWeight);
    return {
      action: 'deload',
      currentWeight,
      suggestedWeight: reduced,
      suggestedReps: [repLo, repHi],
      currentE1RM,
      previousE1RM,
      e1RMTrend,
      confidence: 'high',
      reasoning: `Significant fatigue during session - reps dropped ${pctDecline}% from first to last set (${fatigueMeasure.firstSetReps} ↑ ${fatigueMeasure.lastSetReps}). A deload will help you recover.`,
      tip: 'When reps drop mid-session, your body is signaling it needs recovery.',
    };
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
      reasoning: `Your strength dropped more than 7% vs last session. A short deload (reduce weight ~10%) will help you recover.`,
      tip: 'Deloads are planned recovery - not failure.',
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
      reasoning: `RPE was ${lastRPE}/10 last session and strength has plateaued for 3 sessions. Try a light deload week.`,
      tip: 'Fatigue masks fitness - rest reveals it.',
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
        reasoning: `You averaged ${Math.round(avgReps)} reps - above the ${repHi}-rep ceiling. Bump your target to ${repLo + 2}-${repHi + 2} reps next session.`,
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
      reasoning: `You're at ${Math.round(avgReps)} reps - keep working toward ${repHi} clean reps before progressing.`,
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
      reasoning: `You're below the target rep range (${repLo}-${repHi}) and haven't improved in 3 sessions. Try a 10% reduction to rebuild momentum.`,
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

// --- Reasoning helpers --------------------------------------------------------

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
  return `You averaged ${Math.round(avgReps)} reps - above the ${repHi}-rep ceiling. For a ${tierLabel}, a ${
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
    return `You're averaging ${Math.round(avgReps)} reps - below the ${repLo}-${repHi} target range. Stay at ${weight} kg and focus on technique until you hit ${repLo} clean reps.`;
  }
  const trendPhrase = trend === 'up' ? 'and your estimated strength is trending up' :
    trend === 'flat' ? 'consistency is your current focus' : '';
  return `Good work - you're within the ${repLo}-${repHi} rep target at ${weight} kg ${trendPhrase}. Keep building volume before increasing the load.`.trim();
}

function buildTip(tier: ExerciseTier, increment: number, current: number): string {
  if (tier === 'heavy_barbell') {
    return `${increment} kg is the smallest standard plate increment - respect it. Consistent small jumps compound into big strength gains.`;
  }
  if (tier === 'isolation') {
    return `Small isolation increases (${increment} kg) keep joint stress manageable.`;
  }
  const pct = Math.round((increment / current) * 100);
  return `A ${pct}% increase keeps progress sustainable without spiking injury risk.`;
}

// --- WorkoutLog type ----------------------------------------------------------

export interface WorkoutLog {
  dayName: string;
  completedAt: string;
  sets: Array<{
    exerciseId: string;
    exerciseName: string;
    weight: number;
    reps: number;
    /** Phase 2: optional equipment type - enables composite history key */
    equipmentType?: string;
  }>;
  perceivedEffort?: number;
  rpeCorrections?: Record<string, number>;
}

// --- Phase 2: Equipment-aware computeAllSuggestions --------------------------

export function computeAllSuggestions(
  workoutHistory: WorkoutLog[],
): Record<string, ProgressionSuggestion> {
  const byKey: Record<string, {
    name: string;
    sessions: SessionData[];
    rpeCorrection?: number;
  }> = {};

  const sorted = [...workoutHistory].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
  );

  for (const log of sorted) {
    // Group sets within this log by their composite key
    const exerciseSets: Record<string, { sets: SessionSetData[]; name: string }> = {};

    for (const s of (log.sets || [])) {
      // Phase 2: use composite key when equipmentType is present
      const key = buildHistoryKey(s.exerciseId, s.exerciseName, s.equipmentType);

      if (!exerciseSets[key]) {
        exerciseSets[key] = { sets: [], name: s.exerciseName };
      }
      exerciseSets[key].sets.push({ weight: s.weight, reps: s.reps });
    }

    for (const [key, { sets, name }] of Object.entries(exerciseSets)) {
      if (!byKey[key]) byKey[key] = { name, sessions: [] };
      byKey[key].sessions.push({
        completedAt: log.completedAt,
        sets,
        perceivedEffort: log.perceivedEffort,
      });

      // rpeCorrections still keyed by base exerciseId (pre-Phase-2 format)
      // Try both the full composite key and the base key
      const baseKey = stripEquipmentSuffix(key);
      if (log.rpeCorrections?.[key] !== undefined) {
        byKey[key].rpeCorrection = log.rpeCorrections[key];
      } else if (log.rpeCorrections?.[baseKey] !== undefined) {
        byKey[key].rpeCorrection = log.rpeCorrections[baseKey];
      }
    }
  }

  const result: Record<string, ProgressionSuggestion> = {};

  for (const [key, { name, sessions, rpeCorrection }] of Object.entries(byKey)) {
    const suggestion = computeSuggestion(name, sessions);

    // FIX #4 (June 2026 feedback pass): rpeCorrection was previously applied
    // whenever it existed on ANY past session, with no bound on how many
    // sessions had occurred since. Because rpeCorrections is only ever
    // written on a first session, that one-time value stayed in byKey[key]
    // forever and permanently overrode suggestedWeight — ignoring whatever
    // the user actually logged in every session after that. Scoping this to
    // sessions.length === 1 restores the original intent: adjust the
    // estimated starting weight once, right before session #2, then let
    // computeSuggestion's real weight-trend logic take over from there.
    if (
      rpeCorrection !== undefined &&
      rpeCorrection > 0 &&
      sessions.length === 1 &&
      suggestion.action !== 'insufficient_data'
    ) {
      const tier = classifyExercise(name);
      if (tier !== 'bodyweight') {
        result[key] = {
          ...suggestion,
          action: rpeCorrection !== suggestion.currentWeight ? 'increase_weight' : 'maintain',
          suggestedWeight: rpeCorrection,
          reasoning: `Starting weight adjusted to ${rpeCorrection} kg based on your effort rating from the first session.`,
          confidence: 'medium',
        };
        continue;
      }
    }

    result[key] = suggestion;
  }

  return result;
}


