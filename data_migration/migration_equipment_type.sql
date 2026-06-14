-- ============================================================
-- Phase 2 Migration: Add equipment_type to workout_sets
-- Run in Supabase SQL Editor → New query
-- This is a zero-downtime additive migration — existing rows
-- remain valid (equipment_type = NULL = legacy, uses plain exerciseId key)
-- ============================================================

-- Add equipment_type column (NULL for backward-compat with old rows)
ALTER TABLE workout_sets
  ADD COLUMN IF NOT EXISTS equipment_type TEXT DEFAULT NULL;

-- Composite index: enables efficient per-exercise-per-equipment history queries
-- Used by the progressive overload engine's composite key lookup
CREATE INDEX IF NOT EXISTS idx_sets_user_exercise_equipment
  ON workout_sets(user_id, exercise_id, equipment_type, completed_at DESC);

-- Update the best_sets_per_session view to include equipment_type
-- so the progressive overload engine can group by composite key
CREATE OR REPLACE VIEW best_sets_per_session AS
SELECT DISTINCT ON (session_id, exercise_id, equipment_type)
  session_id,
  user_id,
  exercise_id,
  exercise_name,
  equipment_type,
  completed_at,
  weight_kg,
  reps,
  e1rm_kg
FROM workout_sets
ORDER BY session_id, exercise_id, equipment_type, e1rm_kg DESC;

-- Update weekly_volume view to include equipment_type
CREATE OR REPLACE VIEW weekly_volume AS
SELECT
  user_id,
  exercise_id,
  exercise_name,
  equipment_type,
  DATE_TRUNC('week', completed_at) AS week_start,
  COUNT(*) AS total_sets,
  SUM(reps) AS total_reps,
  SUM(weight_kg * reps) AS total_volume_kg,
  MAX(e1rm_kg) AS best_e1rm
FROM workout_sets
GROUP BY user_id, exercise_id, exercise_name, equipment_type, DATE_TRUNC('week', completed_at);
