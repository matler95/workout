-- ============================================================
-- Fitness App — Relational Schema Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- ── 1. USER PROFILES ────────────────────────────────────────
-- One row per user. Stores onboarding answers.
-- user_id references auth.users so Supabase Auth owns identity.

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Step 1: name
  name             TEXT NOT NULL DEFAULT '',

  -- Step 2: goal
  primary_goal     TEXT NOT NULL DEFAULT 'general_fitness'
                   CHECK (primary_goal IN ('build_muscle','lose_fat','increase_strength','general_fitness','athletic_performance')),

  -- Step 3: experience
  experience_level TEXT NOT NULL DEFAULT 'beginner'
                   CHECK (experience_level IN ('beginner','intermediate','advanced')),

  -- Step 4: demographics
  gender           TEXT NOT NULL DEFAULT 'other'
                   CHECK (gender IN ('male','female','other')),
  age              SMALLINT CHECK (age BETWEEN 10 AND 120),
  height_cm        NUMERIC(5,1) CHECK (height_cm BETWEEN 50 AND 300),
  weight_kg        NUMERIC(5,1) CHECK (weight_kg BETWEEN 20 AND 500),

  -- Step 5: equipment
  equipment        TEXT NOT NULL DEFAULT 'full_gym'
                   CHECK (equipment IN ('full_gym','bodyweight','limited')),
  custom_equipment TEXT[] DEFAULT '{}',   -- e.g. ['Dumbbells','Pull-up bar']

  -- Step 6: availability
  training_days    SMALLINT NOT NULL DEFAULT 3 CHECK (training_days BETWEEN 1 AND 7),
  session_length   SMALLINT NOT NULL DEFAULT 60 CHECK (session_length BETWEEN 15 AND 180),

  -- Step 7: workout style
  workout_style    TEXT NOT NULL DEFAULT 'full_body'
                   CHECK (workout_style IN ('full_body','upper_lower','ppl','bro_split')),

  -- Step 8: abs preference
  abs_preference   TEXT NOT NULL DEFAULT 'none'
                   CHECK (abs_preference IN ('all_days','specific_days','none')),

  -- Step 9: recovery & lifestyle
  avg_sleep        NUMERIC(3,1) DEFAULT 7 CHECK (avg_sleep BETWEEN 3 AND 12),
  activity_level   TEXT DEFAULT 'moderately_active'
                   CHECK (activity_level IN ('sedentary','lightly_active','moderately_active','very_active')),
  stress_level     SMALLINT DEFAULT 5 CHECK (stress_level BETWEEN 1 AND 10),
  job_activity     TEXT DEFAULT 'desk'
                   CHECK (job_activity IN ('desk','standing','physical')),
  cardio_sessions  SMALLINT DEFAULT 0 CHECK (cardio_sessions BETWEEN 0 AND 14),

  -- Step 10: injuries / notes
  injuries         TEXT DEFAULT '',

  -- App preferences (Profile screen)
  units            TEXT NOT NULL DEFAULT 'metric' CHECK (units IN ('metric','imperial')),
  theme            TEXT NOT NULL DEFAULT 'light'  CHECK (theme IN ('light','dark','auto')),
  language         TEXT NOT NULL DEFAULT 'english' CHECK (language IN ('english','polish')),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 2. WORKOUT PLANS ────────────────────────────────────────
-- A user has one active plan. Each row is one named workout day.
-- Exercises stored as JSONB array: [{id, name, primaryMuscles, ...}]
-- This keeps the exercise data self-contained (no FK to a separate
-- exercises table yet — add that when you build the exercise DB properly).

CREATE TABLE IF NOT EXISTS workout_plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_name     TEXT NOT NULL,           -- e.g. 'Push', 'Day 1', 'Upper A'
  sort_order   SMALLINT NOT NULL DEFAULT 0,
  exercises    JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, day_name)            -- one row per day per user
);

CREATE TRIGGER trg_plans_updated
  BEFORE UPDATE ON workout_plans
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX idx_workout_plans_user ON workout_plans(user_id);

-- ── 3. WORKOUT SESSIONS ─────────────────────────────────────
-- One row per completed workout session.

CREATE TABLE IF NOT EXISTS workout_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_name          TEXT NOT NULL,
  completed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_minutes  SMALLINT,
  perceived_effort  SMALLINT CHECK (perceived_effort BETWEEN 1 AND 10),
  feedback          TEXT DEFAULT '',
  rpe_corrections   JSONB DEFAULT '{}',  -- first-session calibrations per exercise
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_date ON workout_sessions(user_id, completed_at DESC);
CREATE INDEX idx_sessions_user_day  ON workout_sessions(user_id, day_name);

-- ── 4. WORKOUT SETS ─────────────────────────────────────────
-- One row per set completed. This is the most important table —
-- it's what powers strength charts, e1RM, progressive overload.

CREATE TABLE IF NOT EXISTS workout_sets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id  TEXT NOT NULL,    -- matches exercise.id from exercises.ts
  exercise_name TEXT NOT NULL,   -- denormalised for easier querying without join
  set_number   SMALLINT NOT NULL,
  weight_kg    NUMERIC(6,2) NOT NULL DEFAULT 0,
  reps         SMALLINT NOT NULL,
  -- Computed e1RM stored for fast charting (Epley: weight * (1 + reps/30))
  e1rm_kg      NUMERIC(6,2) GENERATED ALWAYS AS
               (CASE WHEN reps = 1 THEN weight_kg
                     ELSE weight_kg * (1 + reps::NUMERIC / 30) END) STORED,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Critical indexes for the progressive overload engine:
-- 1. Per-user, per-exercise history (most common query)
-- 2. Per-session (to load all sets for a session)
CREATE INDEX idx_sets_user_exercise ON workout_sets(user_id, exercise_id, completed_at DESC);
CREATE INDEX idx_sets_session       ON workout_sets(session_id);
CREATE INDEX idx_sets_user_date     ON workout_sets(user_id, completed_at DESC);

-- ── 5. BODYWEIGHT LOG ────────────────────────────────────────
-- One row per day. UNIQUE(user_id, logged_at) prevents duplicates.

CREATE TABLE IF NOT EXISTS bodyweight_log (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_kg NUMERIC(5,2) NOT NULL CHECK (weight_kg BETWEEN 20 AND 500),
  logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, logged_at)
);

CREATE INDEX idx_bodyweight_user_date ON bodyweight_log(user_id, logged_at DESC);

-- ── 6. ROW LEVEL SECURITY ───────────────────────────────────
-- Every table locked to its owner. No app-level enforcement needed.

ALTER TABLE user_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_plans   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bodyweight_log  ENABLE ROW LEVEL SECURITY;

-- user_profiles: own row only
CREATE POLICY "profiles: own row"
  ON user_profiles FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- workout_plans: own rows only
CREATE POLICY "plans: own rows"
  ON workout_plans FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- workout_sessions: own rows only
CREATE POLICY "sessions: own rows"
  ON workout_sessions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- workout_sets: own rows only
CREATE POLICY "sets: own rows"
  ON workout_sets FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- bodyweight_log: own rows only
CREATE POLICY "bodyweight: own rows"
  ON bodyweight_log FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 7. USEFUL VIEWS ─────────────────────────────────────────
-- Pre-built queries the edge function can call directly.

-- Best set per exercise per session (for progressive overload engine)
CREATE OR REPLACE VIEW best_sets_per_session AS
SELECT DISTINCT ON (session_id, exercise_id)
  session_id,
  user_id,
  exercise_id,
  exercise_name,
  completed_at,
  weight_kg,
  reps,
  e1rm_kg
FROM workout_sets
ORDER BY session_id, exercise_id, e1rm_kg DESC;

-- Weekly volume per muscle group (approximated via exercise_name patterns)
-- The edge function handles the muscle inference; this view just aggregates sets.
CREATE OR REPLACE VIEW weekly_volume AS
SELECT
  user_id,
  exercise_id,
  exercise_name,
  DATE_TRUNC('week', completed_at) AS week_start,
  COUNT(*) AS total_sets,
  SUM(reps) AS total_reps,
  SUM(weight_kg * reps) AS total_volume_kg,
  MAX(e1rm_kg) AS best_e1rm
FROM workout_sets
GROUP BY user_id, exercise_id, exercise_name, DATE_TRUNC('week', completed_at);

-- Streak calculation helper: workouts per week per user
CREATE OR REPLACE VIEW workouts_per_week AS
SELECT
  user_id,
  DATE_TRUNC('week', completed_at)::DATE AS week_start,
  COUNT(*) AS workout_count
FROM workout_sessions
GROUP BY user_id, DATE_TRUNC('week', completed_at);

-- ── 8. GRANT PERMISSIONS ────────────────────────────────────
-- anon and authenticated roles can read/write their own rows (RLS enforces the "own" part)
GRANT SELECT, INSERT, UPDATE, DELETE ON user_profiles   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_plans   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_sets    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bodyweight_log  TO authenticated;
GRANT SELECT ON best_sets_per_session TO authenticated;
GRANT SELECT ON weekly_volume         TO authenticated;
GRANT SELECT ON workouts_per_week     TO authenticated;
