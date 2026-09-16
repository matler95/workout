// Smoke test for the full (curated + adapted) v2 exercise library. Run with:
//   npx tsx src/utils/fullLibrary.demo.ts

import { exerciseDatabase } from '../data/v2/exercises';
import { compileSession } from './sessionCompiler';
import { getSubstitutes } from '../data/v2/substitutes';
import type { EquipmentItem } from '../data/v2/types';

console.log(`Full library: ${exerciseDatabase.length} exercises`);

const allEquipment: EquipmentItem[] = [
  'barbell', 'ez-bar', 'trap-bar', 'dumbbell', 'kettlebell', 'bench-flat', 'bench-incline',
  'bench-decline', 'squat-rack', 'smith-machine', 'cable-tower', 'pull-up-bar', 'dip-bars',
  'resistance-band', 'leg-press-machine', 'leg-curl-machine', 'leg-extension-machine',
  'chest-press-machine', 'shoulder-press-machine', 'lat-pulldown-machine', 'seated-row-machine',
  'ab-wheel', 'adductor-machine', 'abductor-machine', 'hack-squat-machine', 'preacher-bench', 'none',
];

const session = compileSession(
  { splitDay: 'push', equipmentAvailable: allEquipment, durationMinutes: 45, seedExercises: [] },
  exerciseDatabase
);
console.log(`\nPush day, full gym, 45 min: ${session.exercises.length} exercises, ${session.estimatedMinutes} min`);
session.exercises.forEach((e) => console.log(`  ${e.exercise.name} — ${e.sets} sets`));
console.log(session.warnings.length ? `Warnings: ${session.warnings.join('; ')}` : 'All targets met.');

// Curated exercise — should get curated cross-movement substitutes
const bench = exerciseDatabase.find((e) => e.id === 'bench-press-barbell')!;
const benchSubs = getSubstitutes(bench, allEquipment, exerciseDatabase);
console.log(`\nSwap options for curated "${bench.name}": ${benchSubs.length} found`);
benchSubs.slice(0, 6).forEach((s) => console.log(`  ${s.exercise.name}`));

// Adapted-only exercise — should still get reasonable same-movementId substitutes,
// since v1's own movementId taxonomy already groups related variants
const curl = exerciseDatabase.find((e) => e.name === 'Barbell Curl' && e.tier === 'accessory');
if (curl) {
  const curlSubs = getSubstitutes(curl, allEquipment, exerciseDatabase);
  console.log(`\nSwap options for adapted "${curl.name}" (movementId=${curl.movementId}): ${curlSubs.length} found`);
  curlSubs.forEach((s) => console.log(`  ${s.exercise.name}`));
}
