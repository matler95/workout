-- ============================================================
-- Migration: add warmup_minutes to workout_sessions
-- Feature: feedback round 4, #8 (warm-up tracking)
-- Run in Supabase SQL Editor after migration_muscle_volume.sql
-- ============================================================

-- Minutes spent warming up before the tracked working sets began.
-- NULL for any session logged before this feature existed, or where
-- the person skipped "Start Warm-up" and went straight into the workout.
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS warmup_minutes INTEGER DEFAULT NULL;
