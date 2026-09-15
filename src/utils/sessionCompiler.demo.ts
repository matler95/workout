// Smoke test for the session compiler. Run with:
//   npx tsx src/utils/sessionCompiler.demo.ts

import { compileSession } from './sessionCompiler';
import { exerciseDatabase } from '../data/v2/exercises';
import { equipmentGroups } from '../data/v2/equipment';
import type { Exercise } from '../data/v2/types';

function printSession(label: string, session: ReturnType<typeof compileSession>) {
  console.log(`\n=== ${label} ===`);
  console.log(`Split: ${session.splitDay}  |  Est. time: ${session.estimatedMinutes} min`);
  for (const ce of session.exercises) {
    console.log(
      `  ${ce.fromSeed ? '[seed]' : '      '} ${ce.exercise.name.padEnd(32)} ${ce.sets} sets  — ${ce.reason}`
    );
  }
  if (session.warnings.length) {
    console.log('  Warnings:');
    for (const w of session.warnings) console.log(`   - ${w}`);
  } else {
    console.log('  All muscle targets met.');
  }
}

// ── Scenario 1: pure template, home gym (dumbbells + calisthenics), 45 min push day ──
const homeEquipment = [...equipmentGroups.dumbbells, ...equipmentGroups.calisthenics];
printSession(
  'Template — Push, dumbbells+calisthenics only, 45 min',
  compileSession(
    { splitDay: 'push', equipmentAvailable: homeEquipment, durationMinutes: 45, seedExercises: [] },
    exerciseDatabase
  )
);

// ── Scenario 2: full commercial gym, Pull day, 60 min ──────────────────────
const fullGymEquipment = [
  ...equipmentGroups.machines,
  ...equipmentGroups.dumbbells,
  ...equipmentGroups.barbell,
  ...equipmentGroups.calisthenics,
];
printSession(
  'Template — Pull, full gym, 60 min',
  compileSession(
    { splitDay: 'pull', equipmentAvailable: fullGymEquipment, durationMinutes: 60, seedExercises: [] },
    exerciseDatabase
  )
);

// ── Scenario 3: build-your-own — user picked squat + leg press, legs day, full gym, 50 min ──
const seedLegs: Exercise[] = exerciseDatabase.filter((e) =>
  ['squat-barbell', 'leg-press-machine'].includes(e.id)
);
printSession(
  'Build-your-own — Legs, seeded with squat + leg press, full gym, 50 min',
  compileSession(
    { splitDay: 'legs', equipmentAvailable: fullGymEquipment, durationMinutes: 50, seedExercises: seedLegs },
    exerciseDatabase
  )
);

// ── Scenario 4: equipment-constrained edge case — barbell only, Push day, 40 min ──
printSession(
  'Template — Push, barbell only, 40 min (tests honest shortfall reporting)',
  compileSession(
    { splitDay: 'push', equipmentAvailable: equipmentGroups.barbell, durationMinutes: 40, seedExercises: [] },
    exerciseDatabase
  )
);
