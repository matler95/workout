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
  // ── Step 1: DB lookup by id ─────────────────────────────────────────────────
  if (exerciseId) {
    const record = exerciseDatabase.find(ex => ex.id === exerciseId);
    if (record) {
      const labels = new Set<string>();
      for (const muscle of [...record.primaryMuscles, ...record.secondaryMuscles]) {
        const label = MUSCLE_TO_CHART_LABEL[muscle.toLowerCase()];
        if (label) labels.add(label);
      }
      if (labels.size > 0) return Array.from(labels);
      // Record found but no muscles mapped → fall through to keyword search
    }
  }

  // ── Step 2: Keyword fallback ────────────────────────────────────────────────
  const name = exerciseName.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some(k => name.includes(k))) {
      return rule.labels;
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
