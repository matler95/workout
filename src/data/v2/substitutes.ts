import type { Exercise, EquipmentItem } from './types';

export interface SubstituteOption {
  exercise: Exercise;
  /** True if the user's currently-marked-available equipment covers this
   *  option. Unavailable options are still shown (greyed out in the UI)
   *  rather than hidden — seeing "there's a better match but you don't have
   *  the kit for it right now" is more honest than silently omitting it. */
  equipmentAvailable: boolean;
}

/** Alternatives for `exercise` — same substitution group, same session/split
 *  relevance. Precomputed at DB-build time via `substitutionGroupId`, so
 *  this is an O(n) filter, not a runtime similarity scoring pass. Sorted:
 *  equipment-available options first, then by matching tier (closest
 *  intensity/role match to the exercise being replaced). */
export function getSubstitutes(
  exercise: Exercise,
  availableEquipment: EquipmentItem[],
  db: Exercise[]
): SubstituteOption[] {
  const options: SubstituteOption[] = db
    .filter((ex) => ex.id !== exercise.id && ex.substitutionGroupId === exercise.substitutionGroupId)
    .map((ex) => ({
      exercise: ex,
      equipmentAvailable: ex.equipmentNeeded.every(
        (item) => item === 'none' || availableEquipment.includes(item)
      ),
    }));

  return options.sort((a, b) => {
    if (a.equipmentAvailable !== b.equipmentAvailable) return a.equipmentAvailable ? -1 : 1;
    const tierDistance = (ex: Exercise) =>
      Math.abs(['primary', 'secondary', 'accessory'].indexOf(ex.tier) - ['primary', 'secondary', 'accessory'].indexOf(exercise.tier));
    return tierDistance(a.exercise) - tierDistance(b.exercise);
  });
}
