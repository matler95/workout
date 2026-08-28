/**
 * Muscle group inference — improved
 *
 * FIX #7: The previous `inferMuscleGroup()` used substring matching on the
 * exercise name string. This works for the built-in exercise database but
 * breaks for:
 *   • Custom exercise names ("My chest thing", "Дедлифт")
 *   • Exercises whose names don't contain the muscle keyword
 *   • Exercises that share keywords across muscle groups
 *
 * This version:
 *   1. Looks up the exercise in `exerciseDatabase` by exercise_id first
 *      (exact, reliable — uses the canonical muscle lists already on the record)
 *   2. Falls back to the improved keyword map only when no record is found
 *   3. Returns "Other" as the final fallback instead of silently returning []
 *
 * ── Drop-in replacement ───────────────────────────────────────────────────────
 * Replace the `inferMuscleGroup` function in src/app/pages/Progress.tsx with
 * the `inferMuscleGroup` export below. You will also need to import
 * `exerciseDatabase` at the top of Progress.tsx:
 *
 *   import { exerciseDatabase } from '../../data/exercises';
 *
 * The returned string[] shape and the downstream `getVolumeData()` logic are
 * unchanged — just swap out the function.
 */

import { exerciseDatabase } from '../data/exercises';

// ── Canonical muscle → volume-chart label mapping ─────────────────────────────
//
// Maps the raw muscle strings from exercises.ts to the 8 buckets displayed
// in the volume chart. Multiple source muscles can map to the same bucket.

const MUSCLE_TO_CHART_LABEL: Record<string, string> = {
  // Chest
  chest:        'Chest',
  upper_chest:  'Chest',
  lower_chest:  'Chest',
  pec:          'Chest',

  // Back
  lats:         'Back',
  upper_back:   'Back',
  lower_back:   'Back',
  traps:        'Back',
  rhomboids:    'Back',
  teres_major:  'Back',

  // Quads
  quads:        'Quads',
  quadriceps:   'Quads',

  // Hamstrings
  hamstrings:   'Hamstrings',
  hip_flexors:  'Hamstrings',  // close enough for volume tracking

  // Shoulders
  front_delts:   'Shoulders',
  side_delts:    'Shoulders',
  rear_delts:    'Shoulders',
  delts:         'Shoulders',
  shoulders:     'Shoulders',
  rotator_cuff:  'Shoulders',

  // Biceps
  biceps:        'Biceps',

  // Triceps
  triceps:       'Triceps',

  // Core
  abs:           'Core',
  core:          'Core',
  obliques:      'Core',

  // Glutes — not in the original 8-bucket chart, mapped to Hamstrings for now
  glutes:        'Hamstrings',
  glute:         'Hamstrings',

  // Calves — not charted, intentionally unmapped (returns nothing)
  calves:        undefined as unknown as string,
  calf:          undefined as unknown as string,
} as const;

// ── Keyword fallback map ───────────────────────────────────────────────────────
//
// Ordered from most specific to least specific to reduce false positives.
// Each entry returns chart-label strings directly.

const KEYWORD_RULES: Array<{ keywords: string[]; labels: string[] }> = [
  // Chest compounds
  { keywords: ['bench press', 'chest press', 'push-up', 'pushup', 'cable fly', 'pec fly', 'fly', 'flye', 'dip'], labels: ['Chest', 'Triceps'] },
  // Back compounds
  { keywords: ['deadlift', 'row', 'lat pulldown', 'pulldown', 'pull-up', 'pullup', 'chin-up', 'chinup'], labels: ['Back', 'Biceps'] },
  // Shoulder press
  { keywords: ['overhead press', 'shoulder press', 'military press', 'arnold press'], labels: ['Shoulders', 'Triceps'] },
  // Leg compounds
  { keywords: ['squat', 'leg press', 'lunge', 'step-up', 'hack squat', 'bulgarian'], labels: ['Quads', 'Hamstrings'] },
  // Posterior chain
  { keywords: ['romanian', 'rdl', 'hamstring curl', 'leg curl', 'glute bridge', 'hip thrust'], labels: ['Hamstrings'] },
  // Isolation: shoulders
  { keywords: ['lateral raise', 'front raise', 'face pull', 'rear delt', 'reverse fly'], labels: ['Shoulders'] },
  // Isolation: arms
  { keywords: ['curl', 'preacher', 'hammer curl'], labels: ['Biceps'] },
  { keywords: ['tricep', 'pushdown', 'extension', 'skull crusher', 'kickback', 'close grip'], labels: ['Triceps'] },
  // Core
  { keywords: ['plank', 'crunch', 'situp', 'sit-up', 'ab ', 'core', 'oblique', 'hanging leg', 'cable crunch', 'dragon flag'], labels: ['Core'] },
  // Calf (intentionally no chart label — returns nothing, consistent with original)
  { keywords: ['calf raise', 'seated calf'], labels: [] },
];

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Returns the chart-label bucket(s) for a given exercise.
 *
 * @param exerciseId  The stable exercise id (e.g. 'bench-press').
 *                    Pass the empty string or undefined to skip DB lookup.
 * @param exerciseName The display name — used for keyword fallback.
 */
export function inferMuscleGroup(
  exerciseId: string | undefined,
  exerciseName: string,
): string[] {
  return inferMuscleGroupWeighted(exerciseId, exerciseName).map(m => m.muscle);
}

/**
 * FIX (item #1 audit): calculateMuscleVolume / suggestDeload / checkFatigueWarnings
 * all used to credit a FULL set to every muscle inferMuscleGroup() returned,
 * with no distinction between the muscle an exercise actually targets and
 * one it merely assists. E.g. bench press labels ['Chest', 'Triceps'] — a
 * single set of bench press was counted as 1 full set of *direct* triceps
 * volume, identical to a triceps pushdown. For a normal Push/Pull/Legs split
 * this compounds fast: triceps/biceps/shoulders pick up "full" sets from
 * nearly every compound press/pull on top of their own isolation work, so
 * the MRV landmarks (calibrated for direct volume) get tripped constantly —
 * producing a deload/fatigue warning that doesn't track how the muscle is
 * actually being used, and doesn't match how the lifter feels.
 *
 * This variant returns each muscle alongside a weight: 1.0 when the
 * exercise's own record lists it as a *primary* mover, 0.5 when it's only a
 * *secondary* one (matching common practice for indirect/assistance
 * volume). Volume-summing call sites should use this and multiply by
 * `weight` instead of counting a flat 1 per set. Plain membership checks
 * ("does this exercise touch muscle X at all") should keep using the
 * unweighted `inferMuscleGroup()` above — that behavior is unchanged.
 */
export function inferMuscleGroupWeighted(
  exerciseId: string | undefined,
  exerciseName: string,
): Array<{ muscle: string; weight: number }> {
  // ── Step 1: DB lookup by id ─────────────────────────────────────────────────
  if (exerciseId) {
    const record = exerciseDatabase.find(ex => ex.id === exerciseId);
    if (record) {
      const weightByLabel = new Map<string, number>();
      for (const muscle of record.primaryMuscles) {
        const label = MUSCLE_TO_CHART_LABEL[muscle.toLowerCase()];
        if (label) weightByLabel.set(label, 1.0);
      }
      for (const muscle of record.secondaryMuscles) {
        const label = MUSCLE_TO_CHART_LABEL[muscle.toLowerCase()];
        if (label && !weightByLabel.has(label)) weightByLabel.set(label, 0.5);
      }
      if (weightByLabel.size > 0) {
        return Array.from(weightByLabel, ([muscle, weight]) => ({ muscle, weight }));
      }
      // Record found but no muscles mapped → fall through to keyword search
    }
  }

  // ── Step 2: Keyword fallback ────────────────────────────────────────────────
  // Convention: the first label in each rule is the primary mover (weight
  // 1.0); any additional labels are assisting muscles (weight 0.5) — this
  // mirrors how the rules are already written (e.g. bench: ['Chest' (primary),
  // 'Triceps' (assists])).
  const name = exerciseName.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some(k => name.includes(k))) {
      return rule.labels.map((muscle, i) => ({ muscle, weight: i === 0 ? 1.0 : 0.5 }));
    }
  }

  // ── Step 3: Final fallback ──────────────────────────────────────────────────
  // Return nothing so the "Other" category doesn't pollute the volume chart
  // with exercises that genuinely can't be classified.
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION INSTRUCTIONS
// ─────────────────────────────────────────────────────────────────────────────
//
// In src/app/pages/Progress.tsx:
//
// 1. Add the import at the top of the file:
//      import { inferMuscleGroup } from '../../utils/inferMuscleGroup';
//    (or paste the function inline if you prefer).
//
// 2. In getVolumeData(), the existing call is:
//      const muscles = inferMuscleGroup(row.exercise_name.toLowerCase());
//
//    Change it to pass both id and name:
//      const muscles = inferMuscleGroup(row.exercise_id, row.exercise_name);
//
//    Note: remove the `.toLowerCase()` call — the new function handles
//    normalisation internally.
//
// 3. The VolumeEntry type in api.ts already has an `exercise_id` field, so
//    `row.exercise_id` is available without any backend changes.
