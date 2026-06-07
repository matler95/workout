/**
 * Exercise Weight Mode
 *
 * Determines how weight is entered and displayed for each exercise type.
 *
 * Modes:
 *   barbell   — total weight including 20 kg bar (user loads plates on top)
 *   smith     — plates only, bar weight omitted (Smith machine bar varies & is counterbalanced)
 *   dumbbell  — per-hand weight (each dumbbell, not combined)
 *   bodyweight — reps primary; optional extra weight (vest, belt, plate)
 *
 * Classification priority:
 *   1. Smith machine keyword → smith
 *   2. Equipment === 'bodyweight' OR tier === 'bodyweight' → bodyweight
 *   3. Dumbbell / cable / isolation keywords → dumbbell
 *   4. Heavy barbell tier → barbell
 *   5. Default → dumbbell (safer assumption than barbell)
 */

import type { ExerciseTier } from '../../utils/progressiveOverload';

export type WeightMode = 'barbell' | 'smith' | 'dumbbell' | 'bodyweight';

// ─── Keyword lists ─────────────────────────────────────────────────────────────

const SMITH_KEYWORDS = [
  'smith machine', 'smith-machine', 'smith squat', 'smith press',
  'smith row', 'smith deadlift', 'smith lunge',
];

const BARBELL_KEYWORDS = [
  'barbell', 'ez bar', 'ez-bar', 'ezbar',
  'straight bar curl', 'trap bar', 'hex bar',
];

const DUMBBELL_KEYWORDS = [
  'dumbbell', ' db ', 'db curl', 'db press', 'db row', 'db fly',
  'cable', 'machine', 'lateral raise', 'front raise',
  'fly', 'flye', 'pec deck', 'leg extension', 'leg curl',
  'calf raise', 'preacher curl', 'face pull', 'pull-down',
  'pulldown', 'seated row', 'chest press machine',
];

const BODYWEIGHT_KEYWORDS = [
  'push-up', 'pushup', 'push up',
  'pull-up', 'pullup', 'pull up',
  'chin-up', 'chinup', 'chin up',
  'dip', 'bodyweight', 'bw squat', 'air squat',
  'plank', 'sit-up', 'situp', 'crunch',
  'hanging leg raise', 'leg raise', 'l-sit',
  'muscle-up', 'muscle up', 'ring', 'inverted row',
  'pike push', 'handstand', 'nordic curl',
];

// ─── Main classifier ───────────────────────────────────────────────────────────

export function getWeightMode(
  exerciseName: string,
  equipment: string,
  tier: ExerciseTier,
): WeightMode {
  const n = exerciseName.toLowerCase();

  // 1. Explicit equipment type metadata should override name-based guessing.
  if (equipment === 'bodyweight') return 'bodyweight';
  if (equipment === 'smith') return 'smith';
  if (equipment === 'barbell') return 'barbell';
  if (equipment === 'dumbbell') return 'dumbbell';
  if (equipment === 'machine' || equipment === 'cable' || equipment === 'kettlebell' || equipment === 'band') return 'dumbbell';

  // 2. Smith machine — explicit override before anything else
  if (SMITH_KEYWORDS.some(k => n.includes(k))) return 'smith';

  // 3. Bodyweight — tier OR name keywords
  if (
    tier === 'bodyweight' ||
    BODYWEIGHT_KEYWORDS.some(k => n.includes(k))
  ) return 'bodyweight';

  // 3. Dumbbell / cable / machine keywords
  if (DUMBBELL_KEYWORDS.some(k => n.includes(k))) return 'dumbbell';

  // 4. Heavy barbell tier or explicit barbell keywords
  if (tier === 'heavy_barbell' || BARBELL_KEYWORDS.some(k => n.includes(k))) return 'barbell';

  // 5. Default — dumbbell is the safer assumption for unknown exercises
  return 'dumbbell';
}

// ─── UI helpers ────────────────────────────────────────────────────────────────

export interface WeightModeConfig {
  /** Short label shown inside/next to the weight input */
  inputLabel: string;
  /** Subtle note below input explaining the convention */
  hint: string | null;
  /** Standard bar weight to add when computing total load (for display/info only) */
  barWeight: number;
  /** Whether weight entry is optional (bodyweight) */
  weightOptional: boolean;
  /** Step size for +/- buttons */
  step: number;
}

export function getWeightModeConfig(mode: WeightMode): WeightModeConfig {
  switch (mode) {
    case 'barbell':
      return {
        inputLabel:     'kg total',
        hint:           'Includes 20 kg bar — enter the total weight on the bar',
        barWeight:      20,
        weightOptional: false,
        step:           2.5,
      };
    case 'smith':
      return {
        inputLabel:     'kg plates',
        hint:           'Plates only — Smith machine bar weight not counted',
        barWeight:      0,
        weightOptional: false,
        step:           2.5,
      };
    case 'dumbbell':
      return {
        inputLabel:     'kg / side',
        hint:           'Weight per dumbbell — not combined',
        barWeight:      0,
        weightOptional: false,
        step:           2,
      };
    case 'bodyweight':
      return {
        inputLabel:     'kg added',
        hint:           null,  // shown contextually in the UI
        barWeight:      0,
        weightOptional: true,
        step:           2.5,
      };
  }
}

/**
 * Format a suggested weight value with the correct unit label.
 * Used in SuggestionPill and warmup screen.
 *
 * Examples:
 *   barbell,  80   → "80 kg"
 *   dumbbell, 22.5 → "22.5 kg/side"
 *   smith,    60   → "60 kg plates"
 *   bodyweight, 0  → "bodyweight"
 */
export function formatWeight(weight: number, mode: WeightMode): string {
  if (mode === 'bodyweight') {
    return weight > 0 ? `+${weight} kg` : 'bodyweight';
  }
  if (mode === 'dumbbell') return `${weight} kg/side`;
  if (mode === 'smith')    return `${weight} kg plates`;
  return `${weight} kg`;
}

/**
 * Plates needed per side for a barbell exercise.
 * Useful for displaying "add 2× 10 kg + 1× 5 kg per side" style hints.
 * Returns empty string if not applicable.
 */
export function plateSuggestion(totalKg: number, mode: WeightMode): string {
  if (mode !== 'barbell') return '';
  const platesWeight = (totalKg - 20) / 2;
  if (platesWeight <= 0) return 'bar only (20 kg)';

  const plateSet = [25, 20, 15, 10, 5, 2.5, 1.25];
  const result: string[] = [];
  let remaining = platesWeight;

  for (const plate of plateSet) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / plate);
    if (count > 0) {
      result.push(`${count}× ${plate} kg`);
      remaining = Math.round((remaining - count * plate) * 100) / 100;
    }
  }

  return result.length > 0 ? `${result.join(' + ')} per side` : '';
}
