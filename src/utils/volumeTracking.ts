/**
 * Volume Tracking Utilities
 *
 * Calculates per-muscle-group volume from a workout session.
 * This is used to:
 *   1. Track weekly volume per muscle (MEV/MAV/MRV detection)
 *   2. Inform deload decisions
 *   3. Enable adaptive volume scaling in the future
 */

import { inferMuscleGroupWeighted } from './inferMuscleGroup';
import type { WorkoutSet, MuscleVolumeEntry } from './api';

/**
 * Calculates volume per muscle group for a session
 *
 * @param sets Array of workout sets (each set has weight, reps, exercise info)
 * @returns Object mapping muscle group names to volume metrics
 */
export function calculateMuscleVolume(
  sets: WorkoutSet[],
): Record<string, MuscleVolumeEntry> {
  const volumeByMuscle: Record<string, MuscleVolumeEntry> = {};

  for (const set of sets) {
    // Infer which muscles this exercise targets, and how directly
    // (primary mover = 1 full set, secondary/assisting = half a set — see
    // FIX note on inferMuscleGroupWeighted for why this matters).
    const muscles = inferMuscleGroupWeighted(set.exerciseId, set.exerciseName);

    // Skip if no muscles identified (e.g., mobility work)
    if (muscles.length === 0) continue;

    for (const { muscle, weight } of muscles) {
      if (!volumeByMuscle[muscle]) {
        volumeByMuscle[muscle] = { sets: 0, reps: 0, volumeKg: 0 };
      }

      volumeByMuscle[muscle].sets += weight;
      volumeByMuscle[muscle].reps += set.reps * weight;
      volumeByMuscle[muscle].volumeKg += set.weight * set.reps * weight;
    }
  }

  return volumeByMuscle;
}

/**
 * Aggregates volume across multiple sessions (e.g., weekly total)
 */
export function aggregateVolume(
  sessionVolumes: Record<string, MuscleVolumeEntry>[],
): Record<string, MuscleVolumeEntry> {
  const aggregated: Record<string, MuscleVolumeEntry> = {};

  for (const session of sessionVolumes) {
    for (const [muscle, data] of Object.entries(session)) {
      const d = data as MuscleVolumeEntry;
      if (!aggregated[muscle]) {
        aggregated[muscle] = { sets: 0, reps: 0, volumeKg: 0 };
      }
      aggregated[muscle].sets += d.sets;
      aggregated[muscle].reps += d.reps;
      aggregated[muscle].volumeKg += d.volumeKg;
    }
  }

  return aggregated;
}

// ─── Volume Landmarks (Population Defaults) ──────────────────────────────────
//
// Based on Renaissance Periodization research (Mike Israetel).
// These are weekly set targets per muscle group.
// After 8-12 weeks of data, replace with user-specific adaptive landmarks.

export const VOLUME_LANDMARKS: Record<string, { MEV: number; MAV: number; MRV: number }> = {
  Chest: { MEV: 10, MAV: 14, MRV: 18 },
  Back: { MEV: 8, MAV: 14, MRV: 18 },
  Quads: { MEV: 10, MAV: 16, MRV: 22 },
  Hamstrings: { MEV: 8, MAV: 12, MRV: 16 },
  Shoulders: { MEV: 8, MAV: 12, MRV: 16 },
  Biceps: { MEV: 8, MAV: 12, MRV: 16 },
  Triceps: { MEV: 8, MAV: 12, MRV: 16 },
  Core: { MEV: 8, MAV: 12, MRV: 16 },
};

/**
 * Checks if weekly volume for a muscle is excessive (above MRV)
 * Used to inform deload decisions
 */
export function isVolumeExcessive(muscle: string, weeklyVolume: number): boolean {
  const landmark = VOLUME_LANDMARKS[muscle];
  if (!landmark) return false; // Unknown muscle, assume OK
  return weeklyVolume > landmark.MRV;
}

/**
 * Checks if weekly volume for a muscle is too low (below MEV)
 * Used to inform whether more volume is needed
 */
export function isVolumeInsufficient(muscle: string, weeklyVolume: number): boolean {
  const landmark = VOLUME_LANDMARKS[muscle];
  if (!landmark) return false;
  return weeklyVolume < landmark.MEV;
}

/**
 * Returns optimal weekly volume target (midpoint of MEV-MAV range)
 */
export function getOptimalVolume(muscle: string): number {
  const landmark = VOLUME_LANDMARKS[muscle];
  if (!landmark) return 12; // default fallback
  return Math.round((landmark.MEV + landmark.MAV) / 2);
}

/**
 * Adjusts volume landmarks based on experience level
 * (used during plan generation to prescribe starting volumes)
 */
export function adjustVolumeLandmarks(
  experienceLevel: string,
): Record<string, { MEV: number; MAV: number; MRV: number }> {
  const multipliers: Record<string, number> = {
    beginner: 0.7,
    intermediate: 1.0,
    advanced: 1.15,
  };

  const mult = multipliers[experienceLevel] || 1.0;

  const adjusted: typeof VOLUME_LANDMARKS = {};
  for (const [muscle, landmark] of Object.entries(VOLUME_LANDMARKS)) {
    adjusted[muscle] = {
      MEV: Math.round(landmark.MEV * mult),
      MAV: Math.round(landmark.MAV * mult),
      MRV: Math.round(landmark.MRV * mult),
    };
  }

  return adjusted;
}
