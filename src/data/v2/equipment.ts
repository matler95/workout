import type { EquipmentItem } from './types';

export interface EquipmentDef {
  id: EquipmentItem;
  name: string;
}

export const equipmentDatabase: EquipmentDef[] = [
  { id: 'barbell', name: 'Barbell' },
  { id: 'ez-bar', name: 'EZ Bar' },
  { id: 'trap-bar', name: 'Trap Bar' },
  { id: 'dumbbell', name: 'Dumbbell' },
  { id: 'kettlebell', name: 'Kettlebell' },
  { id: 'bench-flat', name: 'Flat Bench' },
  { id: 'bench-incline', name: 'Incline Bench' },
  { id: 'bench-decline', name: 'Decline Bench' },
  { id: 'squat-rack', name: 'Squat / Power Rack' },
  { id: 'smith-machine', name: 'Smith Machine' },
  { id: 'cable-tower', name: 'Cable Tower' },
  { id: 'pull-up-bar', name: 'Pull-Up Bar' },
  { id: 'dip-bars', name: 'Dip Bars' },
  { id: 'resistance-band', name: 'Resistance Band' },
  { id: 'leg-press-machine', name: 'Leg Press Machine' },
  { id: 'leg-curl-machine', name: 'Leg Curl Machine' },
  { id: 'leg-extension-machine', name: 'Leg Extension Machine' },
  { id: 'chest-press-machine', name: 'Chest Press Machine' },
  { id: 'shoulder-press-machine', name: 'Shoulder Press Machine' },
  { id: 'lat-pulldown-machine', name: 'Lat Pulldown Machine' },
  { id: 'seated-row-machine', name: 'Seated Row Machine' },
  { id: 'ab-wheel', name: 'Ab Wheel' },
  { id: 'adductor-machine', name: 'Hip Adductor Machine' },
  { id: 'abductor-machine', name: 'Hip Abductor Machine' },
  { id: 'hack-squat-machine', name: 'Hack Squat Machine' },
  { id: 'preacher-bench', name: 'Preacher Bench' },
  { id: 'none', name: 'Bodyweight Only' },
];

/** Onboarding asks the coarse question ("machines, dumbbells, barbell,
 *  calisthenics") — this maps each broad answer to the granular
 *  EquipmentItem set it unlocks for the session compiler's filtering.
 *  A user can select multiple groups; the compiler unions the resulting
 *  equipmentAvailable set. */
export const equipmentGroups: Record<
  'machines' | 'dumbbells' | 'barbell' | 'calisthenics',
  EquipmentItem[]
> = {
  machines: [
    'smith-machine',
    'cable-tower',
    'leg-press-machine',
    'leg-curl-machine',
    'leg-extension-machine',
    'chest-press-machine',
    'shoulder-press-machine',
    'lat-pulldown-machine',
    'seated-row-machine',
    'adductor-machine',
    'abductor-machine',
    'hack-squat-machine',
  ],
  dumbbells: ['dumbbell', 'kettlebell', 'bench-flat', 'bench-incline', 'bench-decline', 'preacher-bench'],
  barbell: ['barbell', 'ez-bar', 'trap-bar', 'squat-rack', 'bench-flat', 'bench-incline', 'preacher-bench'],
  calisthenics: ['pull-up-bar', 'dip-bars', 'resistance-band', 'ab-wheel', 'none'],
};
