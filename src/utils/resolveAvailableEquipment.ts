import { equipmentGroups } from '../data/v2/equipment';
import type { EquipmentItem } from '../data/v2/types';

/** Prefers the real per-category equipment selection from onboarding
 *  (profile.customEquipment — see Onboarding.tsx step 5, a multi-select of
 *  'barbell' | 'dumbbells' | 'machines' | 'calisthenics'). Falls back to
 *  the older binary full_gym/bodyweight flag for any profile saved before
 *  that field existed, so existing users don't get an empty equipment list
 *  until they revisit onboarding. */
export function resolveAvailableEquipment(profile: any): EquipmentItem[] {
  const categories: string[] = Array.isArray(profile?.customEquipment) ? profile.customEquipment : [];
  if (categories.length > 0) {
    const items = categories.flatMap((c) => equipmentGroups[c as keyof typeof equipmentGroups] ?? []);
    if (items.length > 0) return [...new Set(items)];
  }
  if (profile?.equipment === 'bodyweight') {
    return [...new Set(equipmentGroups.calisthenics)];
  }
  return [...new Set([
    ...equipmentGroups.machines,
    ...equipmentGroups.dumbbells,
    ...equipmentGroups.barbell,
    ...equipmentGroups.calisthenics,
  ])];
}
