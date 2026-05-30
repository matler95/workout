/**
 * Starting Weight Estimator
 *
 * Converts onboarding profile data into a sensible starting weight
 * for each exercise — before the user has any logged history.
 *
 * Design philosophy:
 * - Always start conservative (better to feel easy and adjust up than fail)
 * - Base ratios are derived from population strength standards (Symmetric Strength /
 *   ExRx norms) for untrained individuals, expressed as bodyweight multiples
 * - Multiplied by experience and gender factors calibrated to intermediate/advanced
 *   population distributions
 * - Goal shifts the bias slightly (strength goal → allow heavier starting weight,
 *   fat-loss goal → start lighter to keep intensity high on lower weights)
 * - After the first session the RPE feedback immediately corrects large errors,
 *   then the progressive overload engine takes over permanently
 */

import { classifyExercise, getRepTarget, type ExerciseTier } from '../../utils/progressiveOverload';

// ─── Profile shape (subset used here) ────────────────────────────────────────

export interface UserProfile {
  weight: number;           // kg
  gender: 'male' | 'female' | 'other';
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  primaryGoal: 'build_muscle' | 'lose_fat' | 'increase_strength' | 'general_fitness' | 'athletic_performance';
}

// ─── Base ratios (bodyweight multiples for a beginner male) ──────────────────
//
// These are conservative estimates at the 30th percentile of untrained males.
// They represent the "working weight" for 3×8-10, not a 1RM.
//
// Sources: ExRx strength standards, Symmetric Strength, NSCA guidelines.
// Scaled down 15% from "untrained" 1RM norms → working weight in rep range.

const BASE_RATIOS: Record<string, number> = {
  // ── Heavy barbell ──────────────────────────────────────────────
  'barbell back squat':      0.65,
  'barbell bench press':     0.45,
  'deadlift':                0.80,
  'romanian deadlift':       0.55,
  'overhead press':          0.28,
  'barbell row':             0.38,
  'barbell curl':            0.18,
  'front squat':             0.50,
  'sumo deadlift':           0.80,
  'incline barbell press':   0.38,
  'close grip bench press':  0.38,
  'hack squat barbell':      0.55,

  // ── Compound DB / machine ──────────────────────────────────────
  // DB values are per-hand (so 20 kg DB = 20, not 40)
  'dumbbell bench press':    0.18,  // per DB
  'dumbbell row':            0.20,  // per DB
  'dumbbell shoulder press': 0.13,  // per DB
  'leg press':               1.20,  // machine — higher ratio
  'lat pulldown':            0.38,
  'cable row':               0.32,
  'chest press machine':     0.35,
  'shoulder press machine':  0.28,
  'bulgarian split squat':   0.18,  // per DB
  'goblet squat':            0.22,
  'dumbbell lunge':          0.14,  // per DB
  'cable fly':               0.08,  // per side
  'dumbbell incline press':  0.15,  // per DB

  // ── Isolation ──────────────────────────────────────────────────
  'dumbbell curl':           0.10,  // per DB
  'hammer curl':             0.11,  // per DB
  'lateral raise':           0.06,  // per DB
  'front raise':             0.06,  // per DB
  'tricep pushdown':         0.15,
  'cable curl':              0.12,
  'face pull':               0.12,
  'leg extension':           0.25,
  'leg curl':                0.20,
  'calf raise':              0.55,
  'preacher curl':           0.12,
  'skull crusher':           0.12,
  'cable lateral raise':     0.05,  // per side
  'reverse fly':             0.06,  // per DB
  'cable crunch':            0.18,

  // ── Bodyweight ─────────────────────────────────────────────────
  // ratio = irrelevant (bodyweight), but we store 0 as a sentinel
  'push-up':                 0,
  'pull-up':                 0,
  'dip':                     0,
  'chin-up':                 0,
  'plank':                   0,
  'hanging leg raise':       0,
};

// ─── Experience multipliers ───────────────────────────────────────────────────
//
// Calibrated so intermediate ≈ 1.35× beginner and advanced ≈ 1.7× beginner.
// These are conservative — the RPE correction after session 1 handles outliers.

const EXPERIENCE_MULTIPLIER: Record<UserProfile['experienceLevel'], number> = {
  beginner:     1.00,
  intermediate: 1.35,
  advanced:     1.70,
};

// ─── Gender factor ────────────────────────────────────────────────────────────
//
// Based on population-level strength differences (NSCA, ExRx data).
// Upper body gap is larger than lower body, but we use a single blended factor
// per exercise tier rather than separate upper/lower adjustments for simplicity.

function genderFactor(gender: UserProfile['gender'], tier: ExerciseTier): number {
  if (gender === 'male') return 1.00;
  // Female population norms: lower body ~80% of male, upper body ~60%.
  // Blended: heavy barbell = 0.68, compound = 0.72, isolation = 0.75, bodyweight = 1.0
  const factors: Record<ExerciseTier, number> = {
    heavy_barbell:        0.68,
    compound_db_machine:  0.72,
    isolation:            0.75,
    bodyweight:           1.00,
  };
  // "other" gender — use 0.86 (midpoint, deferring to individual calibration)
  return gender === 'female' ? factors[tier] : 0.86;
}

// ─── Goal modifier ────────────────────────────────────────────────────────────

function goalModifier(goal: UserProfile['primaryGoal']): number {
  switch (goal) {
    case 'increase_strength':   return 1.15; // allow heavier starting point
    case 'build_muscle':        return 1.00; // neutral
    case 'athletic_performance': return 0.95;
    case 'general_fitness':     return 0.90; // start lighter, emphasis on form
    case 'lose_fat':            return 0.85; // metabolic training, higher reps lower load
  }
}

// ─── Rounding ─────────────────────────────────────────────────────────────────

function roundToIncrement(weight: number, tier: ExerciseTier): number {
  if (tier === 'bodyweight') return 0;
  const step = tier === 'isolation' ? 1 : 2.5;
  const rounded = Math.round(weight / step) * step;
  // Minimum sensible weights per tier
  const minimums: Record<ExerciseTier, number> = {
    heavy_barbell:       20,   // empty barbell
    compound_db_machine:  5,
    isolation:            2,
    bodyweight:           0,
  };
  return Math.max(rounded, minimums[tier]);
}

// ─── Fuzzy name matching ──────────────────────────────────────────────────────
//
// Exercise names in the DB won't exactly match our keys.
// We do a loose substring match, preferring longer (more specific) matches.

function findBaseRatio(exerciseName: string): number | null {
  const name = exerciseName.toLowerCase();

  // Exact match first
  if (BASE_RATIOS[name] !== undefined) return BASE_RATIOS[name];

  // Longest partial match
  let bestKey = '';
  let bestRatio: number | null = null;

  for (const [key, ratio] of Object.entries(BASE_RATIOS)) {
    if (name.includes(key) || key.includes(name)) {
      if (key.length > bestKey.length) {
        bestKey = key;
        bestRatio = ratio;
      }
    }
  }

  if (bestRatio !== null) return bestRatio;

  // Fallback by tier using tier averages
  return null;
}

// Tier average ratios — used when no exercise match found
const TIER_FALLBACK_RATIO: Record<ExerciseTier, number> = {
  heavy_barbell:        0.45,
  compound_db_machine:  0.25,
  isolation:            0.10,
  bodyweight:           0,
};

// ─── Main function ────────────────────────────────────────────────────────────

export interface StartingWeightResult {
  weight: number;           // kg, rounded to appropriate increment
  reps: [number, number];   // [lo, hi] target rep range
  sets: number;             // recommended sets
  isBodyweight: boolean;
  confidence: 'matched' | 'tier_fallback';
  reasoning: string;        // human-readable explanation for dev/debug
}

export function estimateStartingWeight(
  exerciseName: string,
  profile: UserProfile,
): StartingWeightResult {
  const tier = classifyExercise(exerciseName);
  const [repLo, repHi] = getRepTarget(tier);

  // Bodyweight exercises — no weight to estimate
  if (tier === 'bodyweight') {
    const bwReps = profile.experienceLevel === 'beginner' ? [3, 8] as [number, number]
      : profile.experienceLevel === 'intermediate' ? [6, 12] as [number, number]
      : [10, 15] as [number, number];
    const sets = profile.experienceLevel === 'beginner' ? 2 : 3;
    return {
      weight: 0,
      reps: bwReps,
      sets,
      isBodyweight: true,
      confidence: 'matched',
      reasoning: `Bodyweight — target ${bwReps[0]}–${bwReps[1]} reps based on ${profile.experienceLevel} level`,
    };
  }

  // Find base ratio
  const rawRatio = findBaseRatio(exerciseName);
  const confidence: StartingWeightResult['confidence'] =
    rawRatio !== null ? 'matched' : 'tier_fallback';
  const ratio = rawRatio ?? TIER_FALLBACK_RATIO[tier];

  // Compute weight
  const base     = profile.weight * ratio;
  const expAdj   = base * EXPERIENCE_MULTIPLIER[profile.experienceLevel];
  const genAdj   = expAdj * genderFactor(profile.gender, tier);
  const goalAdj  = genAdj * goalModifier(profile.primaryGoal);
  const final    = roundToIncrement(goalAdj, tier);

  // Sets: beginners do 2 sets, everyone else 3
  const sets = profile.experienceLevel === 'beginner' ? 2 : 3;

  const reasoning = [
    `Base: ${profile.weight} kg BW × ${ratio} ratio = ${Math.round(base)} kg`,
    `× ${EXPERIENCE_MULTIPLIER[profile.experienceLevel]} (${profile.experienceLevel})`,
    `× ${Math.round(genderFactor(profile.gender, tier) * 100)}% (gender)`,
    `× ${Math.round(goalModifier(profile.primaryGoal) * 100)}% (${profile.primaryGoal.replace(/_/g, ' ')})`,
    `→ ${Math.round(goalAdj)} kg → rounded to ${final} kg`,
    confidence === 'tier_fallback' ? `[tier fallback — no specific ratio for "${exerciseName}"]` : '',
  ].filter(Boolean).join(' ');

  return { weight: final, reps: [repLo, repHi], sets, isBodyweight: false, confidence, reasoning };
}

// ─── Batch: estimate for a full workout day ───────────────────────────────────

export function estimateWorkoutStartingWeights(
  exercises: Array<{ id: string; name: string }>,
  profile: UserProfile,
): Record<string, StartingWeightResult> {
  const result: Record<string, StartingWeightResult> = {};
  for (const ex of exercises) {
    result[ex.id || ex.name] = estimateStartingWeight(ex.name, profile);
  }
  return result;
}

// ─── First-session RPE correction ─────────────────────────────────────────────
//
// After the user's very first session with an exercise, their RPE rating
// tells us immediately if the starting weight was way off.
// This correction is applied ONCE before the progressive overload engine takes over.

export function applyFirstSessionRPECorrection(
  currentWeight: number,
  rpe: number,
  tier: ExerciseTier,
): { newWeight: number; adjustment: string } {
  if (tier === 'bodyweight') return { newWeight: 0, adjustment: 'none' };

  let factor = 1.0;
  let adjustment = 'none';

  if (rpe <= 3) {
    // Way too easy — jump up significantly
    factor = 1.20;
    adjustment = `+20% (RPE ${rpe} — too easy)`;
  } else if (rpe <= 5) {
    // A bit easy — moderate increase
    factor = 1.10;
    adjustment = `+10% (RPE ${rpe} — slightly easy)`;
  } else if (rpe >= 9) {
    // Too hard — reduce
    factor = 0.85;
    adjustment = `-15% (RPE ${rpe} — too hard)`;
  } else if (rpe === 8) {
    // Slightly too hard — small reduction
    factor = 0.92;
    adjustment = `-8% (RPE ${rpe} — slightly hard)`;
  } else {
    // RPE 6–7: perfect range, no change
    adjustment = 'no change (RPE in target range)';
  }

  const raw = currentWeight * factor;
  const step = tier === 'isolation' ? 1 : 2.5;
  const newWeight = Math.round(raw / step) * step;

  return { newWeight, adjustment };
}
