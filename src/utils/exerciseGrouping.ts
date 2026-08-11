/**
 * Exercise Grouping Utilities — Phase 1.2
 *
 * Groups flat exercise list by movementId so the WorkoutBuilder and
 * AddExerciseDrawer can show "Bench Press" once and let the user pick
 * equipment type, rather than showing four separate entries.
 *
 * All grouping is computed at runtime from exerciseDatabase using each
 * exercise's explicit movementId field — no runtime derivation, no override
 * table to keep in sync.
 */

import { exerciseDatabase, getMovementId, type Exercise } from '../data/exercises';

// ─── Core grouping ────────────────────────────────────────────────────────────

/**
 * Returns a map of movementId → Exercise[] (all variants of that movement).
 * Exercises without duplicate variants are still included (single-item arrays).
 */
export function groupExercisesByMovement(
  exercises: Exercise[],
): Map<string, Exercise[]> {
  const map = new Map<string, Exercise[]>();
  for (const ex of exercises) {
    const mid = getMovementId(ex);
    if (!map.has(mid)) map.set(mid, []);
    map.get(mid)!.push(ex);
  }
  return map;
}

// Pre-computed on module load — avoids re-grouping on every render
let _cachedGroupMap: Map<string, Exercise[]> | null = null;
function getCachedGroupMap(): Map<string, Exercise[]> {
  if (!_cachedGroupMap) _cachedGroupMap = groupExercisesByMovement(exerciseDatabase);
  return _cachedGroupMap;
}

// ─── Equipment options ────────────────────────────────────────────────────────

/**
 * Returns distinct equipmentType values for a given movementId,
 * sorted with the most common/useful first.
 */
const EQUIPMENT_ORDER: string[] = [
  'barbell', 'dumbbell', 'machine', 'cable', 'smith', 'kettlebell', 'band', 'bodyweight', 'other',
];

export function getEquipmentOptionsForMovement(movementId: string): string[] {
  const variants = getCachedGroupMap().get(movementId) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const ex of variants) {
    if (!seen.has(ex.equipmentType)) {
      seen.add(ex.equipmentType);
      result.push(ex.equipmentType);
    }
  }
  result.sort(
    (a, b) => (EQUIPMENT_ORDER.indexOf(a) ?? 99) - (EQUIPMENT_ORDER.indexOf(b) ?? 99),
  );
  return result;
}

// ─── Display name ─────────────────────────────────────────────────────────────

/**
 * Returns the best display name for a movement — the shortest name among
 * variants that doesn't start with an equipment prefix.
 * E.g. for "bench-press" → "Bench Press" (from "Barbell Bench Press" stripped).
 */
const EQUIPMENT_PREFIXES_RE =
  /^(barbell|dumbbell|ez[\s-]?bar|smith machine|cable|machine|kettlebell|resistance band|band|weighted|bodyweight|leverage|seated|standing|lying|kneeling|incline|decline)\s+/i;

export function getMovementDisplayName(movementId: string): string {
  const variants = getCachedGroupMap().get(movementId) ?? [];
  if (variants.length === 0) return movementId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Prefer names that don't start with an equipment keyword
  const clean = variants
    .map(v => v.name.replace(/\s*-\s*.+$/, '').trim())          // strip trailing " - Medium Grip" etc
    .filter(n => !EQUIPMENT_PREFIXES_RE.test(n));

  if (clean.length > 0) {
    // Return shortest clean name
    return clean.sort((a, b) => a.length - b.length)[0];
  }

  // Fallback: strip equipment prefix from shortest name
  const stripped = variants
    .map(v => v.name.replace(/\s*-\s*.+$/, '').trim())
    .sort((a, b) => a.length - b.length)[0]
    .replace(EQUIPMENT_PREFIXES_RE, '')
    .trim();

  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

// ─── Default variant ──────────────────────────────────────────────────────────

/**
 * Returns the best default variant for a movement given an optional preferred equipment.
 * Falls back to barbell → dumbbell → first variant.
 */
export function getDefaultVariant(
  movementId: string,
  preferredEquipment?: string,
): Exercise | undefined {
  const variants = getCachedGroupMap().get(movementId) ?? [];
  if (variants.length === 0) return undefined;
  if (preferredEquipment) {
    const match = variants.find(v => v.equipmentType === preferredEquipment);
    if (match) return match;
  }
  return (
    variants.find(v => v.equipmentType === 'barbell') ??
    variants.find(v => v.equipmentType === 'dumbbell') ??
    variants[0]
  );
}

// ─── Movement lookup ──────────────────────────────────────────────────────────

/** Returns all variants for a movementId */
export function getVariantsForMovement(movementId: string): Exercise[] {
  return getCachedGroupMap().get(movementId) ?? [];
}

/**
 * Returns true if a movement has more than one equipment variant —
 * i.e. should show an equipment picker rather than auto-selecting.
 */
export function movementHasMultipleEquipmentOptions(movementId: string): boolean {
  return getEquipmentOptionsForMovement(movementId).length > 1;
}

// ─── Filtered grouped list ────────────────────────────────────────────────────

export interface MovementGroup {
  movementId: string;
  displayName: string;
  primaryVariant: Exercise;
  equipmentOptions: string[];
  hasMultipleEquipment: boolean;
}

/**
 * Returns a deduplicated list of movements (not exercise variants) for display
 * in the exercise picker. Each entry represents one movement with its variants.
 */
export function getMovementGroups(exercises: Exercise[]): MovementGroup[] {
  const grouped = groupExercisesByMovement(exercises);
  const result: MovementGroup[] = [];

  for (const [movementId, variants] of grouped.entries()) {
    const equipmentOptions = getEquipmentOptionsForMovement(movementId);
    result.push({
      movementId,
      displayName: getMovementDisplayName(movementId),
      primaryVariant: getDefaultVariant(movementId) ?? variants[0],
      equipmentOptions,
      hasMultipleEquipment: equipmentOptions.length > 1,
    });
  }

  return result;
}
