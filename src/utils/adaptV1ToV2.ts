// ─── V1 → V2 Exercise Adapter ───────────────────────────────────────────────
// Converts the existing 422-exercise v1 database (src/data/exercises.ts) into
// the v2 Exercise shape at runtime, so the session compiler and swap sheet
// (which are built against v2's richer model) can run against real,
// production data TODAY — instead of being blocked on the Supabase
// migration (Phase 6). This is a bridge, not a replacement for the real v2
// library: several v2 fields don't exist in v1 source data and have to be
// inferred, with real precision loss. Read the "Known limitations" block
// below before trusting this for anything beyond swap suggestions and rough
// session generation.
//
// Once v2 data is live in Supabase, this file becomes unnecessary — the app
// reads real v2 records instead of adapted v1 ones.

import type { Exercise as V1Exercise } from '../data/exercises';
import type {
  Exercise as V2Exercise,
  Muscle,
  SplitTag,
  EquipmentItem,
  MuscleInvolvement,
} from '../data/v2/types';
import { classifyExercise, getRepTarget, type ExerciseTier as ClassifierTier } from '../../utils/progressiveOverload';

// ── Muscle vocabulary mapping ────────────────────────────────────────────
// v1's muscle strings, exhaustively enumerated from the real data (16
// distinct values used across all 422 exercises — checked directly against
// src/data/exercises.ts, not assumed).
const MUSCLE_MAP: Record<string, Muscle> = {
  abdominals: 'abdominals',
  abductors: 'abductors',
  adductors: 'adductors',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  forearms: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'lats',
  'lower back': 'lower-back',
  // v1 has no separate rhomboids/mid-traps category — "middle back" is the
  // closest existing v1 label to what v2 calls rhomboids.
  'middle back': 'rhomboids',
  quadriceps: 'quads',
  // KNOWN LOSS: v1 doesn't distinguish delt heads (front/side/rear) the way
  // v2 does — it's just "shoulders". Mapping to front-delts as the single
  // most common bias for generic shoulder work, but this is measurably
  // coarser than real v2 data, which is exactly the gap the real exercise
  // library rebuild closes. Don't rely on this mapping for anything where
  // delt-head specificity matters (e.g. don't trust "shoulders" secondary
  // credit to correctly fill a side-delt volume target).
  shoulders: 'front-delts',
  traps: 'traps',
  triceps: 'triceps',
};

function mapMuscles(primary: string[], secondary: string[]): MuscleInvolvement[] {
  const result = new Map<Muscle, MuscleInvolvement>();
  for (const m of primary) {
    const mapped = MUSCLE_MAP[m.toLowerCase()];
    if (mapped) result.set(mapped, { muscle: mapped, role: 'primary', involvement: 0.9 });
  }
  for (const m of secondary) {
    const mapped = MUSCLE_MAP[m.toLowerCase()];
    if (mapped && !result.has(mapped)) {
      result.set(mapped, { muscle: mapped, role: 'secondary', involvement: 0.4 });
    }
  }
  return [...result.values()];
}

function mapSplitTags(category: V1Exercise['category']): SplitTag[] {
  switch (category) {
    case 'push':
      return ['push', 'upper'];
    case 'pull':
      return ['pull', 'upper'];
    case 'legs':
      return ['legs', 'lower'];
    case 'abs':
      return ['abs'];
    case 'full_body':
      return ['full_body'];
  }
}

const PULL_PATTERN_KEYWORDS = ['deadlift', 'rdl', 'curl', 'row', 'pulldown', 'pull-up', 'pullup'];

function inferForce(name: string, category: V1Exercise['category']): V2Exercise['force'] {
  const n = name.toLowerCase();
  if (category === 'abs') return 'static';
  if (PULL_PATTERN_KEYWORDS.some((k) => n.includes(k))) return 'pull';
  if (category === 'push') return 'push';
  if (category === 'pull') return 'pull';
  return 'push'; // legs/full_body default — most leg compounds (squat, press, lunge) are push-pattern
}

function tierAndMechanic(classifierTier: ClassifierTier): { tier: V2Exercise['tier']; mechanic: V2Exercise['mechanic']; fatigueCost: 1 | 2 | 3 } {
  switch (classifierTier) {
    case 'heavy_barbell':
      return { tier: 'primary', mechanic: 'compound', fatigueCost: 3 };
    case 'compound_db_machine':
      return { tier: 'secondary', mechanic: 'compound', fatigueCost: 2 };
    case 'isolation':
      return { tier: 'accessory', mechanic: 'isolation', fatigueCost: 1 };
    case 'bodyweight':
      return { tier: 'secondary', mechanic: 'compound', fatigueCost: 2 };
  }
}

// v1's equipmentType matches v2's EquipmentType union exactly (see the v1
// interface comment) — this maps each broad type to ONE representative
// granular EquipmentItem, since v1 has no granular equipment list at all.
// KNOWN LOSS: a v1 "machine" exercise could be a leg press, a chest press,
// a lat pulldown, etc — all genuinely different machines — but v1 doesn't
// say which, so equipment-availability filtering on adapted data is coarser
// than real v2 data. Same for "cable": could be a tower, a crossover
// station, a low pulley — v1 just says "cable".
const EQUIPMENT_TYPE_TO_ITEM: Record<V1Exercise['equipmentType'], EquipmentItem> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  smith: 'smith-machine',
  machine: 'chest-press-machine', // most common guess; see KNOWN LOSS above
  cable: 'cable-tower',
  kettlebell: 'kettlebell',
  band: 'resistance-band',
  bodyweight: 'none',
  other: 'none',
};

const UNILATERAL_KEYWORDS = ['single-arm', 'single arm', 'single-leg', 'single leg', 'one-arm', 'one arm', 'alternating'];

export function adaptV1Exercise(v1: V1Exercise): V2Exercise {
  const classifierTier = classifyExercise(v1.name);
  const { tier, mechanic, fatigueCost } = tierAndMechanic(classifierTier);
  const [repMin, repMax] = getRepTarget(classifierTier);

  return {
    id: v1.id,
    movementId: v1.movementId,
    name: v1.name,
    mechanic,
    force: inferForce(v1.name, v1.category),
    splitTags: mapSplitTags(v1.category),
    muscles: mapMuscles(v1.primaryMuscles, v1.secondaryMuscles),
    equipmentType: v1.equipmentType,
    equipmentNeeded: [EQUIPMENT_TYPE_TO_ITEM[v1.equipmentType]],
    // v1 has no space-requirement concept — 'stall' is the safest generic
    // default (doesn't block anything in the session compiler's logic,
    // which doesn't currently use this field for filtering).
    spaceRequirement: 'stall',
    tier,
    defaultRepRange: [repMin, repMax],
    fatigueCost,
    unilateral: UNILATERAL_KEYWORDS.some((k) => v1.name.toLowerCase().includes(k)),
    // Fallback substitution grouping: same movementId. This is narrower
    // than the curated v2 groups (which deliberately span different
    // movements — e.g. bench press variants AND push-ups in one group) but
    // it's honest and immediately useful: v1's own movementId already
    // groups equipment variants of the same movement (that's what it's
    // for — see the comment on the v1 Exercise interface), so "Barbell
    // Bench Press" and "Dumbbell Bench Press" will correctly suggest each
    // other. Cross-movement substitutes (dip ↔ close-grip bench) won't
    // surface until real v2 data is live.
    substitutionGroupId: v1.movementId,
    difficulty: v1.difficulty,
    instructions: v1.instructions,
    tempo: v1.tempo,
  };
}

/** Converts the full v1 database. Cheap enough to call once at module load
 *  (422 records, no async work) — memoize at the call site if this ends up
 *  running inside a hot render path. */
export function adaptV1Database(v1db: V1Exercise[]): V2Exercise[] {
  return v1db.map(adaptV1Exercise);
}
