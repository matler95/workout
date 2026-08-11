/// <reference types="vite/client" />

/**
 * Exercise ID integrity guard
 *
 * FIX: Previously threw in all environments, meaning a single bad exercise ID
 * would crash the app for all production users. Now:
 *   - DEV:  throws immediately so the developer sees it during build/test
 *   - PROD: logs to console.error (wire to Sentry/monitoring if available)
 *           and does NOT crash the app — bad IDs just won't appear in history charts
 */

import { exerciseDatabase } from '../data/exercises';

function assertExerciseIds(): void {
  const seen   = new Set<string>();
  const movementIds = new Set<string>();
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

    // movementId used to be derived at runtime via a heuristic plus a
    // hand-maintained override table (MOVEMENT_ID_OVERRIDES). That table
    // silently drifted out of sync with real exercise ids (45 of 99 entries
    // were already dead) and broke equipment-variant grouping with no
    // warning. It's now explicit data — this check is the replacement
    // guardrail: catch a missing movementId at build time instead of a user
    // finding out months later that "start workout" or weight progression
    // silently misbehaved.
    if (!ex.movementId || typeof ex.movementId !== 'string' || ex.movementId.trim() === '') {
      errors.push(`Exercise "${ex.name}" (id: "${ex.id}") is missing a movementId.`);
    } else {
      movementIds.add(ex.movementId);
    }
  }

  if (errors.length === 0) return;

  const msg = [
    `[exerciseIntegrityCheck] ${errors.length} exercise ID problem(s) found:`,
    ...errors.map(e => `  • ${e}`),
    '',
    'Each exercise in src/data/exercises.ts must have a unique, non-empty id.',
    'Fix these before deploying — missing IDs cause silent data loss in workout history.',
  ].join('\n');

  // In development: throw so the issue is caught immediately during local testing.
  // In production: log to console.error (wire to monitoring) but don't crash the app —
  //                affected exercises simply won't track history until fixed.
  const isDev = import.meta.env.DEV;

  if (isDev) {
    throw new Error(msg);
  } else {
    console.error(msg);
    // TODO: send to error monitoring, e.g.:
    // Sentry.captureException(new Error(msg));
  }
}

assertExerciseIds();
