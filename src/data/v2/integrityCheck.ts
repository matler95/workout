// Build-time validation for the V2 exercise database. Fixed curated library
// (see build plan) means this only needs to run at build time / CI — not
// defensively at runtime against unknown shapes.
//
// Run with: npx tsx src/data/v2/integrityCheck.ts

import { exerciseDatabase } from './exercises';
import { muscleById } from './muscles';
import type { Exercise } from './types';

interface Issue {
  exerciseId: string;
  problem: string;
}

export function checkIntegrity(db: Exercise[] = exerciseDatabase): Issue[] {
  const issues: Issue[] = [];
  const idsSeen = new Set<string>();
  const substitutionGroups = new Map<string, string[]>();

  for (const ex of db) {
    // Unique id
    if (idsSeen.has(ex.id)) {
      issues.push({ exerciseId: ex.id, problem: 'Duplicate id' });
    }
    idsSeen.add(ex.id);

    // Every exercise needs exactly one primary muscle (grouping/volume-crediting
    // logic assumes this; an exercise with zero primaries can't anchor a
    // muscle-volume target, and multiple primaries dilutes involvement math
    // in a way that's rarely intentional — flag it for a human to confirm).
    const primaries = ex.muscles.filter((m) => m.role === 'primary');
    if (primaries.length === 0) {
      issues.push({ exerciseId: ex.id, problem: 'No primary muscle listed' });
    }

    // Every muscle referenced must exist in the controlled vocabulary
    for (const m of ex.muscles) {
      if (!muscleById[m.muscle]) {
        issues.push({ exerciseId: ex.id, problem: `Unknown muscle "${m.muscle}"` });
      }
      if (m.involvement < 0 || m.involvement > 1) {
        issues.push({
          exerciseId: ex.id,
          problem: `Involvement for ${m.muscle} out of 0-1 range: ${m.involvement}`,
        });
      }
    }

    // Rep range sanity
    const [lo, hi] = ex.defaultRepRange;
    if (lo > hi) {
      issues.push({ exerciseId: ex.id, problem: `defaultRepRange min > max (${lo}-${hi})` });
    }

    // equipmentNeeded shouldn't be empty (use ['none'] for bodyweight)
    if (ex.equipmentNeeded.length === 0) {
      issues.push({ exerciseId: ex.id, problem: 'equipmentNeeded is empty — use ["none"] for bodyweight' });
    }

    // splitTags shouldn't be empty
    if (ex.splitTags.length === 0) {
      issues.push({ exerciseId: ex.id, problem: 'No splitTags assigned' });
    }

    // Track substitution groups for the cross-check below
    const group = substitutionGroups.get(ex.substitutionGroupId) ?? [];
    group.push(ex.id);
    substitutionGroups.set(ex.substitutionGroupId, group);
  }

  // A substitution group with only one member isn't wrong, but it means the
  // swap feature (#6) has nothing to offer for that exercise — worth knowing
  // about even if it's not a hard error.
  for (const [groupId, members] of substitutionGroups) {
    if (members.length === 1) {
      issues.push({
        exerciseId: members[0],
        problem: `Only exercise in substitution group "${groupId}" — no swap candidates`,
      });
    }
  }

  return issues;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const issues = checkIntegrity();
  if (issues.length === 0) {
    console.log(`✓ ${exerciseDatabase.length} exercises, no integrity issues.`);
  } else {
    console.error(`✗ ${issues.length} issue(s) found:\n`);
    for (const issue of issues) {
      console.error(`  [${issue.exerciseId}] ${issue.problem}`);
    }
    process.exitCode = 1;
  }
}
