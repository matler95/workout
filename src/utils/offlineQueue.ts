/**
 * Offline Queue — workout set persistence
 *
 * Phase 2: WorkoutSet now carries optional equipmentType.
 * All queue operations pass it through transparently.
 *
 * FIX #10 (preserved): Stale in-progress sessions are pruned on startup.
 */

import { workoutApi, type WorkoutSet, type MuscleVolumeEntry } from './api';

export interface QueuedWorkout {
  sessionId:        string;
  dayName:          string;
  startedAt:        string;
  completedAt?:     string;
  sets:             WorkoutSet[];
  perceivedEffort?: number;
  feedback?:        string;
  rpeCorrections?:  Record<string, number>;
  duration?:        number;
  muscleVolume?:    Record<string, MuscleVolumeEntry>;
  status:           'in_progress' | 'abandoned' | 'pending_sync' | 'synced';
}

const INDEX_KEY = 'offline_workout_index';
const PREFIX    = 'offline_workout_';
const STALE_MS  = 24 * 60 * 60 * 1000; // 24 hours

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

export function generateSessionId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function queueStart(sessionId: string, dayName: string): void {
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
