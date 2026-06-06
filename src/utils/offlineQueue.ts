/**
 * Offline Queue — workout set persistence
 *
 * Problem: ActiveWorkout holds all logged sets in React state. If the browser
 * crashes, the tab is killed, or Supabase is unreachable, all progress is lost.
 *
 * Solution:
 *   1. On every set completion, write the full session snapshot to localStorage.
 *   2. On workoutApi.log() success, clear the queue entry.
 *   3. On app load, check for orphaned queue entries and offer to retry.
 *
 * Storage key: `offline_workout_<sessionUUID>`
 * Index key:   `offline_workout_index`  (list of pending UUIDs)
 *
 * The session UUID is generated client-side when the workout starts so we
 * can track it across crashes without a DB round-trip.
 */

import { workoutApi, type WorkoutSet, type MuscleVolumeEntry } from './api';

export interface QueuedWorkout {
  sessionId:      string;
  dayName:        string;
  startedAt:      string;
  completedAt?:   string;
  sets:           WorkoutSet[];
  perceivedEffort?: number;
  feedback?:      string;
  rpeCorrections?: Record<string, number>;
  duration?:      number;
  muscleVolume?:  Record<string, MuscleVolumeEntry>;
  status:         'in_progress' | 'pending_sync' | 'synced';
}

const INDEX_KEY  = 'offline_workout_index';
const PREFIX     = 'offline_workout_';

// ── Read / write helpers ───────────────────────────────────────────────────────

function readIndex(): string[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(ids)); } catch {}
}

function readEntry(id: string): QueuedWorkout | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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

/** Generate a client-side session ID when starting a workout */
export function generateSessionId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Start tracking a new workout session */
export function queueStart(sessionId: string, dayName: string): void {
  const entry: QueuedWorkout = {
    sessionId,
    dayName,
    startedAt: new Date().toISOString(),
    sets: [],
    status: 'in_progress',
  };
  writeEntry(entry);
  const idx = readIndex();
  if (!idx.includes(sessionId)) {
    writeIndex([...idx, sessionId]);
  }
}

/** Snapshot current sets to localStorage — call after every set completion */
export function queueUpdate(sessionId: string, sets: WorkoutSet[]): void {
  const entry = readEntry(sessionId);
  if (!entry) return;
  writeEntry({ ...entry, sets });
}

/** Mark session as pending sync (workout finished, about to call API) */
export function queueMarkPending(
  sessionId: string,
  payload: Omit<QueuedWorkout, 'sessionId' | 'startedAt' | 'status'>
): void {
  const entry = readEntry(sessionId);
  if (!entry) return;
  writeEntry({
    ...entry,
    ...payload,
    status: 'pending_sync',
    completedAt: payload.completedAt || new Date().toISOString(),
  });
}

/** Remove after successful API sync */
export function queueClear(sessionId: string): void {
  deleteEntry(sessionId);
}

/** Get all pending (unsynced completed) workouts */
export function getPendingWorkouts(): QueuedWorkout[] {
  return readIndex()
    .map(readEntry)
    .filter((e): e is QueuedWorkout => e !== null && e.status === 'pending_sync');
}

/** Get in-progress workout (for crash recovery) */
export function getInProgressWorkout(): QueuedWorkout | null {
  const ids = readIndex();
  for (const id of ids) {
    const entry = readEntry(id);
    if (entry?.status === 'in_progress') return entry;
  }
  return null;
}

/**
 * Try to sync all pending workouts to Supabase.
 * Called on app startup. Returns number of successfully synced sessions.
 */
export async function flushPendingWorkouts(): Promise<number> {
  const pending = getPendingWorkouts();
  if (pending.length === 0) return 0;

  let synced = 0;
  for (const workout of pending) {
    try {
      await workoutApi.log({
        dayName:        workout.dayName,
        completedAt:    workout.completedAt || new Date().toISOString(),
        sets:           workout.sets,
        perceivedEffort: workout.perceivedEffort,
        feedback:       workout.feedback || '',
        rpeCorrections: workout.rpeCorrections || {},
        duration:       workout.duration,
        muscleVolume:   workout.muscleVolume,
      });
      queueClear(workout.sessionId);
      synced++;
    } catch {
      // Leave in queue — will retry next time
    }
  }
  return synced;
}

/** Total sets currently saved in an in-progress session (for crash recovery UI) */
export function getInProgressSetCount(sessionId: string): number {
  return readEntry(sessionId)?.sets.length ?? 0;
}
