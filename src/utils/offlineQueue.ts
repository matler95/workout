/**
 * Offline Queue — workout set persistence
 *
 * FIX #10: Stale in-progress sessions were never cleaned up. If a user
 * started a workout, killed the app without finishing, then started a new
 * workout, the old in-progress entry stayed in localStorage indefinitely.
 * getInProgressWorkout() would return the old stale session, and there was
 * no way to clean it up short of clearing all localStorage.
 *
 * Fix: queueStart now marks any existing in-progress sessions as abandoned
 * before creating the new one. A separate pruneAbandoned() helper (called on
 * app startup) removes in-progress sessions older than 24 h.
 */

import { workoutApi, type WorkoutSet, type MuscleVolumeEntry } from './api';

export interface QueuedWorkout {
  sessionId:       string;
  dayName:         string;
  startedAt:       string;
  completedAt?:    string;
  sets:            WorkoutSet[];
  perceivedEffort?: number;
  feedback?:       string;
  rpeCorrections?: Record<string, number>;
  duration?:       number;
  muscleVolume?:   Record<string, MuscleVolumeEntry>;
  status:          'in_progress' | 'abandoned' | 'pending_sync' | 'synced';
}

const INDEX_KEY = 'offline_workout_index';
const PREFIX    = 'offline_workout_';
const STALE_MS  = 24 * 60 * 60 * 1000; // 24 hours

// ── Read / write helpers ───────────────────────────────────────────────────────

function readIndex(): string[] {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); }
  catch { return []; }
}

function writeIndex(ids: string[]) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(ids)); } catch {}
}

function readEntry(id: string): QueuedWorkout | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeEntry(entry: QueuedWorkout) {
  try { localStorage.setItem(PREFIX + entry.sessionId, JSON.stringify(entry)); } catch {}
}

function deleteEntry(id: string) {
  try {
    localStorage.removeItem(PREFIX + id);
    writeIndex(readIndex().filter(i => i !== id));
  } catch {}
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function generateSessionId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * FIX #10: Before creating a new in-progress session, mark any existing
 * in-progress sessions as 'abandoned'. This prevents getInProgressWorkout()
 * from returning a stale session from a previous app launch.
 *
 * We don't delete them immediately in case they contain valuable set data
 * (the CrashRecoveryBanner only surfaces 'pending_sync' entries, so abandoned
 * entries are invisible to the user but can be recovered by support if needed).
 * They will be pruned by pruneAbandoned() on the next app startup.
 */
export function queueStart(sessionId: string, dayName: string): void {
  // Abandon any lingering in-progress sessions
  for (const id of readIndex()) {
    const entry = readEntry(id);
    if (entry?.status === 'in_progress') {
      writeEntry({ ...entry, status: 'abandoned' });
    }
  }

  const entry: QueuedWorkout = {
    sessionId,
    dayName,
    startedAt: new Date().toISOString(),
    sets:      [],
    status:    'in_progress',
  };
  writeEntry(entry);
  const idx = readIndex();
  if (!idx.includes(sessionId)) writeIndex([...idx, sessionId]);
}

export function queueUpdate(sessionId: string, sets: WorkoutSet[]): void {
  const entry = readEntry(sessionId);
  if (!entry) return;
  writeEntry({ ...entry, sets });
}

export function queueMarkPending(
  sessionId: string,
  payload: Omit<QueuedWorkout, 'sessionId' | 'startedAt' | 'status'>
): void {
  const entry = readEntry(sessionId);
  if (!entry) return;
  writeEntry({
    ...entry,
    ...payload,
    status:      'pending_sync',
    completedAt: payload.completedAt || new Date().toISOString(),
  });
}

export function queueClear(sessionId: string): void {
  deleteEntry(sessionId);
}

export function getPendingWorkouts(): QueuedWorkout[] {
  return readIndex()
    .map(readEntry)
    .filter((e): e is QueuedWorkout => e !== null && e.status === 'pending_sync');
}

export function getInProgressWorkout(): QueuedWorkout | null {
  for (const id of readIndex()) {
    const entry = readEntry(id);
    if (entry?.status === 'in_progress') return entry;
  }
  return null;
}

/**
 * FIX #10: Remove in-progress and abandoned sessions older than STALE_MS (24 h).
 * Called once on app startup (main.tsx) before flushPendingWorkouts so the index
 * stays lean and getInProgressWorkout() never returns truly stale data.
 */
export function pruneAbandoned(): void {
  const now = Date.now();
  for (const id of readIndex()) {
    const entry = readEntry(id);
    if (!entry) { deleteEntry(id); continue; }
    if (
      (entry.status === 'in_progress' || entry.status === 'abandoned') &&
      now - new Date(entry.startedAt).getTime() > STALE_MS
    ) {
      deleteEntry(id);
    }
  }
}

export async function flushPendingWorkouts(): Promise<number> {
  const pending = getPendingWorkouts();
  if (pending.length === 0) return 0;

  let synced = 0;
  for (const workout of pending) {
    try {
      await workoutApi.log({
        dayName:         workout.dayName,
        completedAt:     workout.completedAt || new Date().toISOString(),
        sets:            workout.sets,
        perceivedEffort: workout.perceivedEffort,
        feedback:        workout.feedback || '',
        rpeCorrections:  workout.rpeCorrections || {},
        duration:        workout.duration,
        muscleVolume:    workout.muscleVolume,
      });
      queueClear(workout.sessionId);
      synced++;
    } catch {
      // Leave in queue — will retry next time
    }
  }
  return synced;
}

export function getInProgressSetCount(sessionId: string): number {
  return readEntry(sessionId)?.sets.length ?? 0;
}
