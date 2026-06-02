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

import { exerciseDatabase } from './exercises';

function assertExerciseIds(): void {
  const seen   = new Set<string>();
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
