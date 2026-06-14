/**
 * Exercise Weight Mode
 *
 * Determines how weight is entered and displayed for each exercise type.
 *
 * Modes:
 *   barbell   — total weight including 20 kg bar (user loads plates on top)
 *   smith     — plates only, bar weight omitted (Smith machine bar varies & is counterbalanced)
 *   dumbbell  — per-hand weight (each dumbbell, not combined)
 *   machine   — total stack weight (Phase 1.3: new mode, previously misclassified as dumbbell)
 *   bodyweight — reps primary; optional extra weight (vest, belt, plate)
 *
 * Classification priority:
 *   1. Smith machine keyword → smith
 *   2. Equipment === 'bodyweight' OR tier === 'bodyweight' → bodyweight
 *   3. Equipment === 'machine' OR equipment === 'cable' → machine   (NEW)
 *   4. Machine/cable name keywords → machine                        (NEW)
 *   5. Dumbbell / isolation keywords → dumbbell
 *   6. Heavy barbell tier → barbell
 *   7. Default → dumbbell
 */

import type { ExerciseTier } from '../../utils/progressiveOverload';

// Phase 1.3: Added 'machine' to WeightMode
export type WeightMode = 'barbell' | 'smith' | 'dumbbell' | 'bodyweight' | 'machine';

// ─── Keyword lists ─────────────────────────────────────────────────────────────

const SMITH_KEYWORDS = [
  'smith machine', 'smith-machine', 'smith squat', 'smith press',
  'smith row', 'smith deadlift', 'smith lunge', 'smith single',
];

const BARBELL_KEYWORDS = [
  'barbell', 'ez bar', 'ez-bar', 'ezbar',
  'straight bar curl', 'trap bar', 'hex bar',
];

// Phase 1.3: New machine keywords — these were previously falling through to 'dumbbell'
const MACHINE_KEYWORDS = [
  'leg press', 'leg extension', 'leg curl', 'seated leg curl', 'lying leg curl',
  'hack squat machine', 'pec deck', 'chest press machine', 'shoulder press machine',
  'lat pulldown', 'seated cable row', 'cable row', 'cable crossover',
  'cable chest press', 'cable fly', 'cable flye', 'cable crunch',
  'cable curl', 'cable push', 'cable pull', 'cable lateral', 'cable front',
  'cable hammer', 'cable rear', 'cable rope', 'cable iron', 'cable judo',
  'cable russian', 'cable standing', 'cable wood', 'cable lift',
  'cable incline', 'cable lying', 'cable one arm', 'cable preacher',
  'leverage chest', 'leverage decline', 'leverage incline', 'leverage high',
  'leverage iso', 'leverage shoulder', 'leverage shrug', 'leverage deadlift',
  'pulldown', 'pull-down',
  'machine bench', 'machine bicep', 'machine preacher', 'machine tricep',
  'machine shoulder', 'machine row',
  'thigh abductor', 'thigh adductor',
];

const DUMBBELL_KEYWORDS = [
  'dumbbell', ' db ', 'lateral raise', 'front raise',
  'fly', 'flye', 'preacher',
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

  // 1. Explicit equipment metadata overrides name-based guessing
  if (equipment === 'bodyweight') return 'bodyweight';
  if (equipment === 'smith') return 'smith';
  if (equipment === 'barbell') return 'barbell';
  // Phase 1.3: machine and cable equipment types → machine mode (NOT dumbbell)
  if (equipment === 'machine' || equipment === 'cable') return 'machine';
  if (equipment === 'dumbbell') return 'dumbbell';
  if (equipment === 'kettlebell' || equipment === 'band') return 'dumbbell';

  // 2. Smith machine — check name before other keywords
  if (SMITH_KEYWORDS.some(k => n.includes(k))) return 'smith';

  // 3. Bodyweight — tier OR name keywords
  if (
    tier === 'bodyweight' ||
    BODYWEIGHT_KEYWORDS.some(k => n.includes(k))
  ) return 'bodyweight';

  // 4. Phase 1.3: Machine/cable keywords → machine mode
  if (MACHINE_KEYWORDS.some(k => n.includes(k))) return 'machine';

  // 5. Dumbbell / isolation keywords
  if (DUMBBELL_KEYWORDS.some(k => n.includes(k))) return 'dumbbell';

  // 6. Heavy barbell tier or explicit barbell keywords
  if (tier === 'heavy_barbell' || BARBELL_KEYWORDS.some(k => n.includes(k))) return 'barbell';

  // 7. Default — dumbbell is the safer assumption
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
    // Phase 1.3: New machine mode config — total stack weight, 5kg steps
    case 'machine':
      return {
        inputLabel:     'kg total',
        hint:           'Total stack weight',
        barWeight:      0,
        weightOptional: false,
        step:           5,
      };
    case 'bodyweight':
      return {
        inputLabel:     'kg added',
        hint:           null,
        barWeight:      0,
        weightOptional: true,
        step:           2.5,
      };
  }
}

/**
 * Format a suggested weight value with the correct unit label.
 *
 * Examples:
 *   barbell,  80   → "80 kg"
 *   dumbbell, 22.5 → "22.5 kg/side"
 *   smith,    60   → "60 kg plates"
 *   machine,  100  → "100 kg"      (Phase 1.3: no /side)
 *   bodyweight, 0  → "bodyweight"
 */
export function formatWeight(weight: number, mode: WeightMode): string {
  if (mode === 'bodyweight') {
    return weight > 0 ? `+${weight} kg` : 'bodyweight';
  }
  if (mode === 'dumbbell') return `${weight} kg/side`;
  if (mode === 'smith')    return `${weight} kg plates`;
  // barbell and machine both show simple "X kg"
  return `${weight} kg`;
}

/**
 * Plates needed per side for a barbell exercise.
 * Returns empty string for all other modes (including machine — Phase 1.3).
 */
export function plateSuggestion(totalKg: number, mode: WeightMode): string {
  // Phase 1.3: explicitly return '' for machine (and any non-barbell mode)
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

// ─── Equipment label formatter ────────────────────────────────────────────────

/**
 * Converts an equipmentType string to a human-readable label.
 * Used in workout display: "Bench Press (Barbell)", exercise pickers, etc.
 */
export function formatEquipmentLabel(equipmentType: string): string {
  switch (equipmentType) {
    case 'barbell':    return 'Barbell';
    case 'dumbbell':   return 'Dumbbell';
    case 'smith':      return 'Smith Machine';
    case 'machine':    return 'Machine';
    case 'cable':      return 'Cable';
    case 'kettlebell': return 'Kettlebell';
    case 'band':       return 'Resistance Band';
    case 'bodyweight': return 'Bodyweight';
    case 'other':      return 'Other';
    default:
      return equipmentType.charAt(0).toUpperCase() + equipmentType.slice(1);
  }
}
