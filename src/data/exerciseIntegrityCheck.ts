/**
 * Exercise ID integrity guard
 *
 * FIX #1: Every exercise must have a stable, non-empty `id` field.
 * Without it, workout history, progression suggestions, and exercise charts
 * will silently break because the DB stores records by exercise_id.
 *
 * HOW TO USE
 * ----------
 * Import this file anywhere that imports `exerciseDatabase`, e.g. at the
 * top of src/data/exercises.ts itself, or in src/main.tsx:
 *
 *   import './data/exerciseIntegrityCheck';
 *
 * The check runs once at module load time (dev + prod). In production the
 * check throws so a misconfigured build is caught immediately rather than
 * producing silent data loss.
 *
 * WHAT TO CHECK IN exercises.ts
 * ------------------------------
 * Every entry must look like:
 *
 *   {
 *     id: 'bench-press',          // ← required, unique, URL-safe slug
 *     name: 'Barbell Bench Press',
 *     ...
 *   }
 *
 * IDs should:
 *   - Be lowercase kebab-case  ('romanian-deadlift', not 'RomanianDeadlift')
 *   - Never change once published (history rows reference them by this value)
 *   - Be unique across the entire database
 */

import { exerciseDatabase } from './exercises';

function assertExerciseIds(): void {
  const seen = new Set<string>();
  const errors: string[] = [];

  for (const ex of exerciseDatabase) {
    if (!ex.id || typeof ex.id !== 'string' || ex.id.trim() === '') {
      errors.push(`Exercise "${ex.name}" is missing an id.`);
      continue;
    }
    if (seen.has(ex.id)) {
      errors.push(`Duplicate exercise id "${ex.id}" (exercise: "${ex.name}").`);
    }
    seen.add(ex.id);
  }

  if (errors.length > 0) {
    const msg = [
      `[exerciseIntegrityCheck] ${errors.length} exercise ID problem(s) found:`,
      ...errors.map(e => `  • ${e}`),
      '',
      'Each exercise in src/data/exercises.ts must have a unique, non-empty id.',
      'Fix these before deploying — missing IDs cause silent data loss in workout history.',
    ].join('\n');

    // Throw in all environments so the issue is never silently ignored.
    throw new Error(msg);
  }
}

// Run immediately at module load.
assertExerciseIds();
