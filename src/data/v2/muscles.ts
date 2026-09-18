import type { Muscle } from './types';

export interface MuscleDef {
  id: Muscle;
  name: string;
  region: 'upper' | 'lower' | 'core';
}

// The canonical list. If you need to add one, add it here AND to the
// `Muscle` union in types.ts — the type is the source of truth for
// compile-time safety, this is the source of truth for display/UI.
export const muscleDatabase: MuscleDef[] = [
  { id: 'chest', name: 'Chest', region: 'upper' },
  { id: 'front-delts', name: 'Front Delts', region: 'upper' },
  { id: 'side-delts', name: 'Side Delts', region: 'upper' },
  { id: 'rear-delts', name: 'Rear Delts', region: 'upper' },
  { id: 'lats', name: 'Lats', region: 'upper' },
  { id: 'traps', name: 'Traps', region: 'upper' },
  { id: 'rhomboids', name: 'Rhomboids', region: 'upper' },
  { id: 'lower-back', name: 'Lower Back', region: 'core' },
  { id: 'biceps', name: 'Biceps', region: 'upper' },
  { id: 'triceps', name: 'Triceps', region: 'upper' },
  { id: 'forearms', name: 'Forearms', region: 'upper' },
  { id: 'abdominals', name: 'Abdominals', region: 'core' },
  { id: 'obliques', name: 'Obliques', region: 'core' },
  { id: 'quads', name: 'Quads', region: 'lower' },
  { id: 'hamstrings', name: 'Hamstrings', region: 'lower' },
  { id: 'glutes', name: 'Glutes', region: 'lower' },
  { id: 'calves', name: 'Calves', region: 'lower' },
  { id: 'hip-flexors', name: 'Hip Flexors', region: 'lower' },
  { id: 'adductors', name: 'Adductors', region: 'lower' },
  { id: 'abductors', name: 'Abductors', region: 'lower' },
];

export const muscleById: Record<Muscle, MuscleDef> = muscleDatabase.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<Muscle, MuscleDef>
);
