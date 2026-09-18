// Run with: npx tsx src/utils/adaptV1ToV2.verify.ts

import { exerciseDatabase as v1db } from '../data/exercises';
import { adaptV1Database } from './adaptV1ToV2';
import { getSubstitutes } from '../data/v2/substitutes';
import { compileSession } from './sessionCompiler';

const v2Adapted = adaptV1Database(v1db);
console.log(`Adapted ${v2Adapted.length} of ${v1db.length} v1 exercises.\n`);

// ── Spot-check a few conversions ─────────────────────────────────────────
const spotCheck = ['Barbell Bench Press - Medium Grip', 'Barbell Curl', 'Barbell Squat', 'Band Assisted Pull-Up'];
console.log('=== Spot-check conversions ===');
for (const name of spotCheck) {
  const ex = v2Adapted.find((e) => e.name === name);
  if (!ex) {
    console.log(`  MISSING: ${name}`);
    continue;
  }
  console.log(
    `  ${ex.name.padEnd(35)} tier=${ex.tier.padEnd(10)} mechanic=${ex.mechanic.padEnd(10)} reps=${ex.defaultRepRange[0]}-${ex.defaultRepRange[1]}  muscles=${ex.muscles.map((m) => `${m.muscle}(${m.role})`).join(', ')}`
  );
}

// ── Prove the swap lookup works against adapted data ─────────────────────
console.log('\n=== Swap suggestions for "Barbell Bench Press - Medium Grip" ===');
const bench = v2Adapted.find((e) => e.name === 'Barbell Bench Press - Medium Grip')!;
const allEquipment: import('../data/v2/types').EquipmentItem[] = [
  'barbell', 'dumbbell', 'smith-machine', 'cable-tower', 'chest-press-machine', 'kettlebell', 'resistance-band', 'none',
];
const subs = getSubstitutes(bench, allEquipment, v2Adapted);
for (const s of subs.slice(0, 5)) {
  console.log(`  ${s.exercise.name} (equipment available: ${s.equipmentAvailable})`);
}
if (subs.length === 0) console.log('  (none found — see note below)');

// ── Prove the session compiler works against adapted data ────────────────
console.log('\n=== Session compiler against adapted v1 data — Push day, full gym, 45 min ===');
const session = compileSession(
  { splitDay: 'push', equipmentAvailable: allEquipment, durationMinutes: 45, seedExercises: [] },
  v2Adapted
);
for (const ce of session.exercises) {
  console.log(`  ${ce.exercise.name.padEnd(35)} ${ce.sets} sets — ${ce.reason}`);
}
console.log(`  Est. time: ${session.estimatedMinutes} min`);
if (session.warnings.length) {
  console.log('  Warnings:');
  session.warnings.forEach((w) => console.log(`   - ${w}`));
}
