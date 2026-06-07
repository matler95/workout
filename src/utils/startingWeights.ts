/**
 * Starting Weight Estimator — Fixed
 *
 * Changes from original:
 * 1. ID-first lookup: checks exercise ID against WEIGHT_BY_ID map before
 *    any string matching. IDs are stable and exact.
 * 2. Name-based lookup uses the exercise's canonical name from the DB
 *    (via exerciseDatabase), not fuzzy substring matching on user-typed strings.
 * 3. Removed BASE_RATIOS fuzzy substring matching entirely — it was the
 *    source of silent mismatches (e.g. "Cable Lateral Raise" matching
 *    "Lateral Raise" ratio, or "DB Bench" matching nothing).
 * 4. Tier fallback is now explicit and documented.
 * 5. estimateSessionDuration removed — it referenced Exercise fields that
 *    don't exist (sets, minReps, maxReps). Session duration is no longer
 *    shown in the UI.
 */

import { classifyExercise, getRepTarget, type ExerciseTier } from '../../utils/progressiveOverload';
import { exerciseDatabase } from '../data/exercises';
import { getWeightMode, type WeightMode } from './exerciseWeightMode';

// ─── Profile shape ────────────────────────────────────────────────────────────

export interface UserProfile {
  weight: number;           // kg
  gender: 'male' | 'female' | 'other';
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  primaryGoal: 'build_muscle' | 'lose_fat' | 'increase_strength' | 'general_fitness' | 'athletic_performance';
}

// ─── Weight ratios keyed by exercise ID ──────────────────────────────────────
//
// Values are bodyweight multiples for a beginner male at working weight
// (3×8-10), not 1RM. Conservative 30th-percentile estimates.
//
// Keyed by the exact exercise.id from exercises.ts — no string matching needed.
// When adding new exercises to exercises.ts, add their ratio here too.

const WEIGHT_BY_ID: Record<string, number> = {
  // ── Heavy barbell ─────────────────────────────────────────────────────────
  'barbell-back-squat':       0.65,
  'squat':                    0.65,
  'barbell-bench-press':      0.45,
  'bench-press':              0.45,
  'deadlift':                 0.80,
  'romanian-deadlift':        0.55,
  'rdl':                      0.55,
  'overhead-press':           0.28,
  'barbell-row':              0.38,
  'bent-over-row':            0.38,
  'barbell-curl':             0.18,
  'front-squat':              0.50,
  'sumo-deadlift':            0.80,
  'incline-barbell-press':    0.38,
  'close-grip-bench-press':   0.38,
  'hack-squat-barbell':       0.55,
  'good-morning':             0.30,
  'barbell-lunge':            0.35,
  'barbell-hip-thrust':       0.60,

  // ── Compound dumbbell / machine ────────────────────────────────────────────
  'dumbbell-bench-press':     0.18,   // per dumbbell
  'dumbbell-row':             0.20,   // per dumbbell
  'dumbbell-shoulder-press':  0.13,   // per dumbbell
  'leg-press':                1.20,   // machine — higher absolute ratio
  'lat-pulldown':             0.38,
  'cable-row':                0.32,
  'seated-cable-row':         0.32,
  'chest-press-machine':      0.35,
  'shoulder-press-machine':   0.28,
  'bulgarian-split-squat':    0.18,   // per dumbbell
  'goblet-squat':             0.22,
  'dumbbell-lunge':           0.14,   // per dumbbell
  'dumbbell-incline-press':   0.15,   // per dumbbell
  'cable-fly':                0.08,   // per side
  'chest-fly-machine':        0.25,
  'incline-dumbbell-press':   0.15,
  'hip-thrust':               0.50,
  'smith-machine-squat':      0.55,
  'hack-squat-machine':       0.80,
  'leg-extension':            0.25,
  'leg-curl':                 0.20,
  'seated-leg-curl':          0.20,

  // ── Isolation ──────────────────────────────────────────────────────────────
  'dumbbell-curl':            0.10,   // per dumbbell
  'hammer-curl':              0.11,   // per dumbbell
  'lateral-raise':            0.06,   // per dumbbell
  'dumbbell-lateral-raise':   0.06,
  'cable-lateral-raise':      0.04,   // per side (cable lighter than DB)
  'front-raise':              0.06,   // per dumbbell
  'tricep-pushdown':          0.15,
  'cable-pushdown':           0.15,
  'cable-curl':               0.12,
  'face-pull':                0.12,
  'reverse-fly':              0.06,   // per dumbbell
  'cable-reverse-fly':        0.05,
  'calf-raise':               0.55,
  'seated-calf-raise':        0.40,
  'preacher-curl':            0.12,
  'skull-crusher':            0.12,
  'ez-bar-curl':              0.15,
  'tricep-overhead-extension':0.10,
  'cable-crunch':             0.18,
  'ab-wheel':                 0,      // bodyweight

  // ── Bodyweight ─────────────────────────────────────────────────────────────
  // ratio = 0 (sentinel — handled by bodyweight branch)
  'pushup':                   0,
  'push-up':                  0,
  'pullup':                   0,
  'pull-up':                  0,
  'chinup':                   0,
  'chin-up':                  0,
  'dips':                     0,
  'dip':                      0,
  'plank':                    0,
  'hanging-leg-raise':        0,
  'bodyweight-squat':         0,
  'bodyweight-lunge':         0,
  'inverted-row':             0,
};

// ─── Tier fallback ratios ─────────────────────────────────────────────────────
// Used when an exercise ID isn't in WEIGHT_BY_ID.
// Represents the average working weight for each movement category.

const TIER_FALLBACK: Record<ExerciseTier, number> = {
  heavy_barbell:        0.45,
  compound_db_machine:  0.22,
  isolation:            0.10,
  bodyweight:           0,
};

// ─── Experience multipliers ───────────────────────────────────────────────────

const EXPERIENCE_MULT: Record<UserProfile['experienceLevel'], number> = {
  beginner:     1.00,
  intermediate: 1.35,
  advanced:     1.70,
};

// ─── Gender factor ────────────────────────────────────────────────────────────

function genderFactor(gender: UserProfile['gender'], tier: ExerciseTier): number {
  if (gender === 'male') return 1.00;
  const female: Record<ExerciseTier, number> = {
    heavy_barbell:        0.68,
    compound_db_machine:  0.72,
    isolation:            0.75,
    bodyweight:           1.00,
  };
  return gender === 'female' ? female[tier] : 0.86; // 'other' = midpoint
}

// ─── Goal modifier ────────────────────────────────────────────────────────────

function goalModifier(goal: UserProfile['primaryGoal']): number {
  switch (goal) {
    case 'increase_strength':    return 1.15;
    case 'build_muscle':         return 1.00;
    case 'athletic_performance': return 0.95;
    case 'general_fitness':      return 0.90;
    case 'lose_fat':             return 0.85;
  }
}

// ─── Rounding ─────────────────────────────────────────────────────────────────

function roundToIncrement(weight: number, tier: ExerciseTier): number {
  if (tier === 'bodyweight') return 0;
  const step = tier === 'isolation' ? 1 : 2.5;
  const rounded = Math.round(weight / step) * step;
  const minimums: Record<ExerciseTier, number> = {
    heavy_barbell:        20,  // empty barbell
    compound_db_machine:  5,
    isolation:            2,
    bodyweight:           0,
  };
  return Math.max(rounded, minimums[tier]);
}

// ─── Ratio lookup — ID first, then name normalisation ────────────────────────

function findRatio(exerciseId: string | undefined, exerciseName: string): {
  ratio: number;
  confidence: 'id_match' | 'name_match' | 'tier_fallback';
} {
  // 1. Try exact ID match
  if (exerciseId && WEIGHT_BY_ID[exerciseId] !== undefined) {
    return { ratio: WEIGHT_BY_ID[exerciseId], confidence: 'id_match' };
  }

  // 2. Try to find the exercise in the DB by name (normalized) and use its ID
  const normalized = exerciseName.toLowerCase().trim();
  const dbEntry = exerciseDatabase.find(
    e => e.name.toLowerCase() === normalized
  );
  if (dbEntry && WEIGHT_BY_ID[dbEntry.id] !== undefined) {
    return { ratio: WEIGHT_BY_ID[dbEntry.id], confidence: 'name_match' };
  }

  // 3. Try ID derived from name (kebab-case conversion)
  const kebabId = normalized.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (WEIGHT_BY_ID[kebabId] !== undefined) {
    return { ratio: WEIGHT_BY_ID[kebabId], confidence: 'name_match' };
  }

  // 4. Tier fallback — no match found
  return { ratio: -1, confidence: 'tier_fallback' };
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface StartingWeightResult {
  weight: number;
  reps: [number, number];
  sets: number;
  isBodyweight: boolean;
  confidence: 'id_match' | 'name_match' | 'tier_fallback';
  mode: WeightMode;
}

// ─── Main function ────────────────────────────────────────────────────────────

export function estimateStartingWeight(
  exerciseName: string,
  profile: UserProfile,
  exerciseId?: string,
): StartingWeightResult {
  const tier       = classifyExercise(exerciseName);
  const [repLo, repHi] = getRepTarget(tier);

  // Bodyweight — no weight to estimate
  if (tier === 'bodyweight') {
    const bwReps: [number, number] =
      profile.experienceLevel === 'beginner'     ? [3, 8] :
      profile.experienceLevel === 'intermediate' ? [6, 12] :
                                                   [10, 15];
    return {
      weight: 0,
      reps:   bwReps,
      sets:   profile.experienceLevel === 'beginner' ? 2 : 3,
      isBodyweight: true,
      confidence: 'id_match',
      mode: 'bodyweight' as WeightMode,
    };
  }

  const { ratio: rawRatio, confidence } = findRatio(exerciseId, exerciseName);
  const ratio = rawRatio >= 0 ? rawRatio : TIER_FALLBACK[tier];

  const base   = profile.weight * ratio;
  const expAdj = base  * EXPERIENCE_MULT[profile.experienceLevel];
  const genAdj = expAdj * genderFactor(profile.gender, tier);
  const final  = roundToIncrement(genAdj * goalModifier(profile.primaryGoal), tier);

  const mode = getWeightMode(exerciseName, 'full_gym', tier);
  return {
    weight: final,
    reps:   [repLo, repHi],
    sets:   profile.experienceLevel === 'beginner' ? 2 : 3,
    isBodyweight: false,
    confidence,
    mode,
  };
}

// ─── Batch estimate ───────────────────────────────────────────────────────────

export function estimateWorkoutStartingWeights(
  exercises: Array<{ id: string; name: string }>,
  profile: UserProfile,
): Record<string, StartingWeightResult> {
  const result: Record<string, StartingWeightResult> = {};
  for (const ex of exercises) {
    result[ex.id || ex.name] = estimateStartingWeight(ex.name, profile, ex.id);
  }
  return result;
}

// ─── First-session RPE correction ────────────────────────────────────────────

export function applyFirstSessionRPECorrection(
  currentWeight: number,
  rpe: number,
  tier: ExerciseTier,
): { newWeight: number; adjustment: string } {
  if (tier === 'bodyweight') return { newWeight: 0, adjustment: 'none' };

  let factor = 1.0;
  let adjustment = 'no change';

  if      (rpe <= 3) { factor = 1.20; adjustment = '+20% (too easy)'; }
  else if (rpe <= 5) { factor = 1.10; adjustment = '+10% (slightly easy)'; }
  else if (rpe >= 9) { factor = 0.85; adjustment = '-15% (too hard)'; }
  else if (rpe === 8) { factor = 0.92; adjustment = '-8% (slightly hard)'; }

  const step      = tier === 'isolation' ? 1 : 2.5;
  const newWeight = Math.round((currentWeight * factor) / step) * step;
  return { newWeight, adjustment };
}
