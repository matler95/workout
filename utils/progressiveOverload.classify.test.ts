// Regression test for classifyExercise. Run with:
//   npx tsx utils/progressiveOverload.classify.test.ts
//
// Exists specifically to guard against the bug fixed in FIX #5 (see file
// header of progressiveOverload.ts): a bare "barbell" keyword and a
// mistaken "barbell curl" entry in HEAVY_BARBELL_KEYWORDS caused every
// barbell isolation exercise (curls, shrugs, calf raises, ab rollouts...)
// to get 4-8 rep targets and a flat +2.5kg suggested jump meant for squats
// and deadlifts. If this test starts failing, someone reintroduced an
// overly broad keyword — see the verification notes in the V2 build
// history for how to check a candidate keyword against the full DB before
// adding it.

import { classifyExercise, type ExerciseTier } from './progressiveOverload';

const cases: Array<[string, ExerciseTier]> = [
  // Must stay heavy_barbell — real compound lifts
  ['Barbell Squat', 'heavy_barbell'],
  ['Barbell Deadlift', 'heavy_barbell'],
  ['Bent Over Barbell Row', 'heavy_barbell'],
  ['Barbell Full Squat', 'heavy_barbell'],
  ['Barbell Bench Press - Medium Grip', 'heavy_barbell'],
  ['Romanian Deadlift', 'heavy_barbell'],

  // Must be isolation — this is the regression this test exists to catch
  ['Barbell Curl', 'isolation'],
  ['Barbell Shrug', 'isolation'],
  ['Barbell Seated Calf Raise', 'isolation'],
  ['Barbell Side Bend', 'isolation'],
  ['Close-Grip Standing Barbell Curl', 'isolation'],
  ['Barbell Ab Rollout', 'isolation'],
  ['Dumbbell Curl', 'isolation'],
  ['Cable Lateral Raise', 'isolation'],

  // Bodyweight
  ['Pull-Up', 'bodyweight'],
  ['Dip', 'bodyweight'],
  ['Push-Up', 'bodyweight'],
];

let failed = 0;
for (const [name, expected] of cases) {
  const actual = classifyExercise(name);
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗ FAIL'}  ${name.padEnd(38)} expected ${expected}, got ${actual}`);
}

if (failed === 0) {
  console.log(`\nAll ${cases.length} classification cases passed.`);
} else {
  console.error(`\n${failed}/${cases.length} case(s) failed.`);
  process.exitCode = 1;
}
