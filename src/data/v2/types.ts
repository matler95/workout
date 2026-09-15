// ─── V2 Exercise Data Model ────────────────────────────────────────────────
// Greenfield rebuild. Fixed curated library (no runtime/user-added exercises
// for now — see atlas-v2-build-plan.md §"Decision: fixed curated library").
// Every field here is meant to be assigned once, at DB-build time, and never
// mutated at runtime. If you need per-user customization later, that's a
// separate "user override" layer on top of this, not a change to this shape.

/** Controlled vocabulary — see muscles.ts for the canonical list. Using a
 *  union type (not `string`) means a typo in an exercise record is a
 *  compile error, not a silent runtime miss (this bit the old movementId
 *  system — see the comment in the old exercises.ts). */
export type Muscle =
  | 'chest'
  | 'front-delts'
  | 'side-delts'
  | 'rear-delts'
  | 'lats'
  | 'traps'
  | 'rhomboids'
  | 'lower-back'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abdominals'
  | 'obliques'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'hip-flexors'
  | 'adductors'
  | 'abductors';

/** Controlled vocabulary — see equipment.ts. Granular ("what physical thing
 *  do I need") — distinct from `equipmentType`, which is the broad category
 *  used for weight-mode classification (per-side vs total, plate math, etc). */
export type EquipmentItem =
  | 'barbell'
  | 'ez-bar'
  | 'trap-bar'
  | 'dumbbell'
  | 'kettlebell'
  | 'bench-flat'
  | 'bench-incline'
  | 'bench-decline'
  | 'squat-rack'
  | 'smith-machine'
  | 'cable-tower'
  | 'pull-up-bar'
  | 'dip-bars'
  | 'resistance-band'
  | 'leg-press-machine'
  | 'leg-curl-machine'
  | 'leg-extension-machine'
  | 'chest-press-machine'
  | 'shoulder-press-machine'
  | 'lat-pulldown-machine'
  | 'seated-row-machine'
  | 'ab-wheel'
  | 'none'; // bodyweight, no equipment

export type EquipmentType =
  | 'barbell'
  | 'dumbbell'
  | 'smith'
  | 'machine'
  | 'cable'
  | 'kettlebell'
  | 'band'
  | 'bodyweight'
  | 'other';

export type SplitTag = 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full_body' | 'abs';

export type Tier = 'primary' | 'secondary' | 'accessory';

export interface MuscleInvolvement {
  muscle: Muscle;
  role: 'primary' | 'secondary';
  /** 0-1. Used to weight how much a set of this exercise counts toward a
   *  muscle's volume target in the session compiler. A primary mover on a
   *  compound lift is typically 0.8-1.0; a stabilizer/secondary is 0.2-0.5. */
  involvement: number;
}

export interface Exercise {
  /** Unique per variant, e.g. "bench-press-barbell". */
  id: string;
  /** Groups variants of the same movement across equipment, e.g. "bench-press".
   *  Carried over from the v1 schema — it already works, don't reinvent it. */
  movementId: string;
  name: string;

  mechanic: 'compound' | 'isolation';
  force: 'push' | 'pull' | 'static';
  splitTags: SplitTag[];

  muscles: MuscleInvolvement[];

  equipmentType: EquipmentType;
  equipmentNeeded: EquipmentItem[];
  spaceRequirement: 'stall' | 'bench' | 'floor' | 'rack';

  tier: Tier;
  defaultRepRange: [number, number];
  /** Rough relative recovery cost. 1 = low (isolation, short lever), 3 = high
   *  (heavy compound, high systemic fatigue). Used by the session compiler's
   *  time/fatigue budget, not just wall-clock time. */
  fatigueCost: 1 | 2 | 3;
  unilateral: boolean;

  /** Exercises that share this id are valid swap candidates for each other.
   *  Assigned at build time (see integrityCheck.ts for validation), not
   *  computed at runtime — keeps the in-workout swap list instant and stable. */
  substitutionGroupId: string;

  difficulty: 'beginner' | 'intermediate' | 'advanced';
  instructions: string;
  cues?: string[];
  tempo?: string;
  videoUrl?: string;
}
