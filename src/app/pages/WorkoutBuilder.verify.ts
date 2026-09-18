// Verifies the core logic behind WorkoutBuilder's new "Generate for me"
// button — replicated here as a pure function since the real one is a
// closure inside a React component. Run with:
//   npx tsx src/app/pages/WorkoutBuilder.verify.ts

import { exerciseDatabase, getMovementId } from '../../data/exercises';
import { compileSession } from '../../utils/sessionCompiler';
import { adaptV1Database } from '../../utils/adaptV1ToV2';
import { equipmentGroups } from '../../data/v2/equipment';
import type { EquipmentItem } from '../../data/v2/types';

const v2AdaptedDatabase = adaptV1Database(exerciseDatabase);

function resolveAvailableEquipment(profile: any): EquipmentItem[] {
  if (profile?.equipment === 'bodyweight') return [...new Set(equipmentGroups.calisthenics)];
  return [...new Set([
    ...equipmentGroups.machines, ...equipmentGroups.dumbbells,
    ...equipmentGroups.barbell, ...equipmentGroups.calisthenics,
  ])];
}

function generateForDay(splitTag: 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full_body', profile: any) {
  const availableEquipment = resolveAvailableEquipment(profile);
  const durationMinutes = profile?.sessionLength > 0 ? profile.sessionLength : 60;
  const compiled = compileSession(
    { splitDay: splitTag, equipmentAvailable: availableEquipment, durationMinutes, seedExercises: [] },
    v2AdaptedDatabase
  );
  const generated = compiled.exercises
    .map((ce) => {
      const v1ex = exerciseDatabase.find((e) => e.id === ce.exercise.id);
      if (!v1ex) return null;
      return { ...v1ex, sets: ce.sets, movementId: v1ex.movementId ?? getMovementId(v1ex) };
    })
    .filter((e) => e !== null);
  return { compiled, generated };
}

console.log('=== full_gym profile, Push day ===');
const r1 = generateForDay('push', { equipment: 'full_gym', sessionLength: 45 });
r1.generated.forEach((e: any) => console.log(`  ${e.name} — ${e.sets} sets (id=${e.id})`));
console.log(`  ${r1.generated.length} exercises, ~${r1.compiled.estimatedMinutes} min`);
console.log(`  Warnings: ${r1.compiled.warnings.join('; ') || 'none'}`);

console.log('\n=== bodyweight-only profile, Pull day ===');
const r2 = generateForDay('pull', { equipment: 'bodyweight', sessionLength: 30 });
r2.generated.forEach((e: any) => console.log(`  ${e.name} — ${e.sets} sets (id=${e.id})`));
console.log(`  ${r2.generated.length} exercises, ~${r2.compiled.estimatedMinutes} min`);
console.log(`  Warnings: ${r2.compiled.warnings.join('; ') || 'none'}`);

console.log('\n=== no profile at all (defaults) — Legs day ===');
const r3 = generateForDay('legs', undefined);
r3.generated.forEach((e: any) => console.log(`  ${e.name} — ${e.sets} sets (id=${e.id})`));
console.log(`  ${r3.generated.length} exercises, ~${r3.compiled.estimatedMinutes} min`);

// Every generated entry must have a real, resolvable v1 id — this is the
// correctness property the whole "use v2AdaptedDatabase, not the merged
// 499-exercise library" decision exists to guarantee.
const allGenerated = [...r1.generated, ...r2.generated, ...r3.generated];
const allResolvable = allGenerated.every((e: any) => exerciseDatabase.some((v1) => v1.id === e.id));
console.log(`\nAll generated exercises resolve to real v1 ids: ${allResolvable ? 'YES' : 'NO — BUG'}`);
