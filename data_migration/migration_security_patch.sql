-- ============================================================
-- Security patch — apply after migration.sql
-- Fixes:
--   1. best_sets_per_session: add SECURITY INVOKER + user_id filter
--      so RLS on workout_sets is enforced when the view is queried
--   2. weekly_volume: same treatment
--   3. workouts_per_week: same treatment
-- ============================================================

-- ── 1. best_sets_per_session ──────────────────────────────────────────────────
-- The original view had no WHERE clause, relied on SECURITY DEFINER semantics
-- (Postgres default), and bypassed RLS on the underlying table. Any authenticated
-- user could read another user's best sets via a direct view query.
--
-- Fix: recreate with SECURITY INVOKER so RLS on workout_sets fires, AND add an
-- explicit user_id = auth.uid() predicate as defence-in-depth.

CREATE OR REPLACE VIEW best_sets_per_session
  WITH (security_invoker = true)           -- enforce RLS on underlying tables
AS
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
WHERE user_id = auth.uid()                 -- explicit predicate (defence-in-depth)
ORDER BY session_id, exercise_id, equipment_type, e1rm_kg DESC;

-- ── 2. weekly_volume ──────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW weekly_volume
  WITH (security_invoker = true)
AS
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
WHERE user_id = auth.uid()
GROUP BY user_id, exercise_id, exercise_name, equipment_type, DATE_TRUNC('week', completed_at);

-- ── 3. workouts_per_week ─────────────────────────────────────────────────────

CREATE OR REPLACE VIEW workouts_per_week
  WITH (security_invoker = true)
AS
SELECT
  user_id,
  DATE_TRUNC('week', completed_at)::DATE AS week_start,
  COUNT(*) AS workout_count
FROM workout_sessions
WHERE user_id = auth.uid()
GROUP BY user_id, DATE_TRUNC('week', completed_at);

-- ── 4. Re-grant SELECT on the updated views ───────────────────────────────────
-- SECURITY INVOKER views inherit the caller's grants; the authenticated role
-- already has SELECT on the base tables via RLS, but we keep the view grants
-- so PostgREST / Supabase client can discover them.

GRANT SELECT ON best_sets_per_session TO authenticated;
GRANT SELECT ON weekly_volume         TO authenticated;
GRANT SELECT ON workouts_per_week     TO authenticated;