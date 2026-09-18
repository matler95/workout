/**
 * Seeds the v2 Supabase project's exercises/exercise_muscles/
 * exercise_equipment/exercise_split_tags tables from
 * src/data/v2/exercises.ts.
 *
 * Run AFTER migration_v2_exercise_schema.sql, against the NEW v2
 * Supabase project (not production):
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   npx tsx data_migration/seedExercisesV2.ts
 *
 * Uses the SERVICE ROLE key deliberately — the exercises tables have no
 * client-side write policy (see migration_v2_exercise_schema.sql), so a
 * normal anon/authenticated key can't insert here. Never commit this key
 * or run this script from client code.
 *
 * Idempotent: upserts on primary key, safe to re-run after editing
 * src/data/v2/exercises.ts to push updates.
 */

import { createClient } from '@supabase/supabase-js';
import { exerciseDatabase } from '../src/data/v2/exercises';
import { checkIntegrity } from '../src/data/v2/integrityCheck';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

// Don't push known-bad data — same integrity checker used locally,
// run again here as a last line of defense before it hits the DB.
const issues = checkIntegrity(exerciseDatabase);
const hardErrors = issues.filter((i) => !i.problem.includes('no swap candidates'));
if (hardErrors.length > 0) {
  console.error(`Refusing to seed — ${hardErrors.length} integrity issue(s):`);
  for (const issue of hardErrors) console.error(`  [${issue.exerciseId}] ${issue.problem}`);
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

async function seed() {
  console.log(`Seeding ${exerciseDatabase.length} exercises...`);

  const exerciseRows = exerciseDatabase.map((ex) => ({
    id: ex.id,
    movement_id: ex.movementId,
    name: ex.name,
    mechanic: ex.mechanic,
    force: ex.force,
    equipment_type: ex.equipmentType,
    space_requirement: ex.spaceRequirement,
    tier: ex.tier,
    default_rep_min: ex.defaultRepRange[0],
    default_rep_max: ex.defaultRepRange[1],
    fatigue_cost: ex.fatigueCost,
    unilateral: ex.unilateral,
    substitution_group_id: ex.substitutionGroupId,
    difficulty: ex.difficulty,
    instructions: ex.instructions,
    cues: ex.cues ?? null,
    tempo: ex.tempo ?? null,
    video_url: ex.videoUrl ?? null,
  }));

  const { error: exError } = await supabase.from('exercises').upsert(exerciseRows);
  if (exError) throw new Error(`exercises upsert failed: ${exError.message}`);
  console.log(`  ✓ exercises (${exerciseRows.length} rows)`);

  const muscleRows = exerciseDatabase.flatMap((ex) =>
    ex.muscles.map((m) => ({
      exercise_id: ex.id,
      muscle_id: m.muscle,
      role: m.role,
      involvement: m.involvement,
    }))
  );
  // Clear + reinsert per exercise rather than a single upsert, since a
  // muscle removed from an exercise in the TS source wouldn't be removed
  // by upsert alone (upsert only adds/updates, never deletes stale rows).
  const { error: delMuscleErr } = await supabase
    .from('exercise_muscles')
    .delete()
    .in('exercise_id', exerciseDatabase.map((e) => e.id));
  if (delMuscleErr) throw new Error(`exercise_muscles clear failed: ${delMuscleErr.message}`);
  const { error: muscleErr } = await supabase.from('exercise_muscles').insert(muscleRows);
  if (muscleErr) throw new Error(`exercise_muscles insert failed: ${muscleErr.message}`);
  console.log(`  ✓ exercise_muscles (${muscleRows.length} rows)`);

  const equipmentRows = exerciseDatabase.flatMap((ex) =>
    ex.equipmentNeeded.map((item) => ({ exercise_id: ex.id, equipment_item: item }))
  );
  const { error: delEquipErr } = await supabase
    .from('exercise_equipment')
    .delete()
    .in('exercise_id', exerciseDatabase.map((e) => e.id));
  if (delEquipErr) throw new Error(`exercise_equipment clear failed: ${delEquipErr.message}`);
  const { error: equipErr } = await supabase.from('exercise_equipment').insert(equipmentRows);
  if (equipErr) throw new Error(`exercise_equipment insert failed: ${equipErr.message}`);
  console.log(`  ✓ exercise_equipment (${equipmentRows.length} rows)`);

  const splitTagRows = exerciseDatabase.flatMap((ex) =>
    ex.splitTags.map((tag) => ({ exercise_id: ex.id, split_tag: tag }))
  );
  const { error: delSplitErr } = await supabase
    .from('exercise_split_tags')
    .delete()
    .in('exercise_id', exerciseDatabase.map((e) => e.id));
  if (delSplitErr) throw new Error(`exercise_split_tags clear failed: ${delSplitErr.message}`);
  const { error: splitErr } = await supabase.from('exercise_split_tags').insert(splitTagRows);
  if (splitErr) throw new Error(`exercise_split_tags insert failed: ${splitErr.message}`);
  console.log(`  ✓ exercise_split_tags (${splitTagRows.length} rows)`);

  console.log('\nDone.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
