-- ============================================================
-- Migration: add muscle_volume to workout_sessions
-- Run in Supabase SQL Editor after migration.sql
-- ============================================================

-- Add muscle_volume JSONB column to store per-muscle aggregate metrics
-- Shape: { "Chest": { sets: 3, reps: 27, volumeKg: 2160 }, ... }
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS muscle_volume JSONB DEFAULT NULL;

-- Optional index for analytics queries filtering by muscle
-- (only worth adding if you plan to query by muscle group at scale)
-- CREATE INDEX IF NOT EXISTS idx_sessions_muscle_volume
--   ON workout_sessions USING GIN (muscle_volume);
