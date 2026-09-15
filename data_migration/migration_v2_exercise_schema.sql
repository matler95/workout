-- ============================================================
-- V2 Migration: Exercise database schema
-- Run in the NEW v2 Supabase project's SQL Editor → New query
-- (per atlas-v2-build-plan.md §1 — this is deliberately a separate
-- project, not additive to the production DB)
--
-- This is reference/catalog data: every authenticated (and anon,
-- since the exercise library isn't user-specific) user reads the
-- same rows. No per-user RLS needed here — only write access is
-- restricted, since this is a fixed curated library (see the
-- "Decision" section of the build plan) with no client-side writes.
-- ============================================================

-- ── Exercises ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exercises (
  id                  TEXT PRIMARY KEY,
  movement_id         TEXT NOT NULL,
  name                TEXT NOT NULL,
  mechanic            TEXT NOT NULL CHECK (mechanic IN ('compound', 'isolation')),
  force               TEXT NOT NULL CHECK (force IN ('push', 'pull', 'static')),
  equipment_type      TEXT NOT NULL,
  space_requirement   TEXT NOT NULL CHECK (space_requirement IN ('stall', 'bench', 'floor', 'rack')),
  tier                TEXT NOT NULL CHECK (tier IN ('primary', 'secondary', 'accessory')),
  default_rep_min     INTEGER NOT NULL,
  default_rep_max     INTEGER NOT NULL,
  fatigue_cost        SMALLINT NOT NULL CHECK (fatigue_cost IN (1, 2, 3)),
  unilateral          BOOLEAN NOT NULL DEFAULT FALSE,
  substitution_group_id TEXT NOT NULL,
  difficulty          TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  instructions        TEXT NOT NULL,
  cues                TEXT[],
  tempo               TEXT,
  video_url           TEXT
);

CREATE INDEX IF NOT EXISTS idx_exercises_movement_id ON exercises(movement_id);
CREATE INDEX IF NOT EXISTS idx_exercises_substitution_group ON exercises(substitution_group_id);
CREATE INDEX IF NOT EXISTS idx_exercises_equipment_type ON exercises(equipment_type);

-- ── Muscles (controlled vocabulary) ─────────────────────────────
CREATE TABLE IF NOT EXISTS muscles (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  region  TEXT NOT NULL CHECK (region IN ('upper', 'lower', 'core'))
);

-- ── Exercise ↔ Muscle involvement (junction) ─────────────────────
CREATE TABLE IF NOT EXISTS exercise_muscles (
  exercise_id   TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  muscle_id     TEXT NOT NULL REFERENCES muscles(id) ON DELETE RESTRICT,
  role          TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
  involvement   NUMERIC(3,2) NOT NULL CHECK (involvement >= 0 AND involvement <= 1),
  PRIMARY KEY (exercise_id, muscle_id)
);

CREATE INDEX IF NOT EXISTS idx_exercise_muscles_muscle ON exercise_muscles(muscle_id);

-- ── Exercise ↔ equipment items needed ───────────────────────────
CREATE TABLE IF NOT EXISTS exercise_equipment (
  exercise_id     TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  equipment_item  TEXT NOT NULL,
  PRIMARY KEY (exercise_id, equipment_item)
);

CREATE INDEX IF NOT EXISTS idx_exercise_equipment_item ON exercise_equipment(equipment_item);

-- ── Exercise ↔ split tags (push/pull/legs/upper/lower/full_body/abs) ──
CREATE TABLE IF NOT EXISTS exercise_split_tags (
  exercise_id  TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  split_tag    TEXT NOT NULL CHECK (split_tag IN ('push', 'pull', 'legs', 'upper', 'lower', 'full_body', 'abs')),
  PRIMARY KEY (exercise_id, split_tag)
);

CREATE INDEX IF NOT EXISTS idx_exercise_split_tags_tag ON exercise_split_tags(split_tag);

-- ── Row Level Security: public read, no client writes ───────────
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE muscles ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_muscles ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_split_tags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'exercises' AND policyname = 'Public read access') THEN
    CREATE POLICY "Public read access" ON exercises FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'muscles' AND policyname = 'Public read access') THEN
    CREATE POLICY "Public read access" ON muscles FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'exercise_muscles' AND policyname = 'Public read access') THEN
    CREATE POLICY "Public read access" ON exercise_muscles FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'exercise_equipment' AND policyname = 'Public read access') THEN
    CREATE POLICY "Public read access" ON exercise_equipment FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'exercise_split_tags' AND policyname = 'Public read access') THEN
    CREATE POLICY "Public read access" ON exercise_split_tags FOR SELECT USING (true);
  END IF;
END $$;

-- No INSERT/UPDATE/DELETE policies are defined for any role — writes only
-- happen via the service-role key from the seed script (seedExercises.ts),
-- never from client code. This matches the "fixed curated library" decision.

-- ── Seed the muscle vocabulary (static — matches src/data/v2/muscles.ts) ──
INSERT INTO muscles (id, name, region) VALUES
  ('chest', 'Chest', 'upper'),
  ('front-delts', 'Front Delts', 'upper'),
  ('side-delts', 'Side Delts', 'upper'),
  ('rear-delts', 'Rear Delts', 'upper'),
  ('lats', 'Lats', 'upper'),
  ('traps', 'Traps', 'upper'),
  ('rhomboids', 'Rhomboids', 'upper'),
  ('lower-back', 'Lower Back', 'core'),
  ('biceps', 'Biceps', 'upper'),
  ('triceps', 'Triceps', 'upper'),
  ('forearms', 'Forearms', 'upper'),
  ('abdominals', 'Abdominals', 'core'),
  ('obliques', 'Obliques', 'core'),
  ('quads', 'Quads', 'lower'),
  ('hamstrings', 'Hamstrings', 'lower'),
  ('glutes', 'Glutes', 'lower'),
  ('calves', 'Calves', 'lower'),
  ('hip-flexors', 'Hip Flexors', 'lower'),
  ('adductors', 'Adductors', 'lower'),
  ('abductors', 'Abductors', 'lower')
ON CONFLICT (id) DO NOTHING;

-- Exercises themselves are NOT seeded here — run
-- `npx tsx data_migration/seedExercisesV2.ts` after this migration
-- (see that script for why: 77 rows × 3 child tables reads much more
-- reliably from TypeScript than as one giant hand-written INSERT block,
-- and it stays in sync with src/data/v2/exercises.ts automatically).
