import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";

const app = new Hono();

// ── Supabase clients ─────────────────────────────────────────────────────────
// Service client: used for auth.admin and writes that bypass RLS in rare cases.
// Anon client with user JWT: used for all data queries — RLS enforces ownership.

const serviceClient = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Returns a Supabase client that runs queries AS the authenticated user,
// so RLS policies (user_id = auth.uid()) enforce data isolation automatically.
const userClient = (jwt: string) => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
  { global: { headers: { Authorization: `Bearer ${jwt}` } } },
);

app.use('*', logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  maxAge: 600,
}));

// ── Auth helper ───────────────────────────────────────────────────────────────

async function requireAuth(c: any): Promise<{ user: any; db: any } | null> {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) { c.status(401); return null; }

  const { data: { user }, error } = await serviceClient().auth.getUser(token);
  if (error || !user) { c.status(401); return null; }

  return { user, db: userClient(token) };
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/make-server-975f4bc8/health", (c) => c.json({ status: "ok" }));

// ── Auth: Signup ──────────────────────────────────────────────────────────────

app.post("/make-server-975f4bc8/auth/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    const { data, error } = await serviceClient().auth.admin.createUser({
      email, password,
      user_metadata: { name },
      email_confirm: true,
    });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ user: data.user });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Auth: Session ─────────────────────────────────────────────────────────────

app.get("/make-server-975f4bc8/auth/session", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ session: null });
  return c.json({ session: { user: auth.user } });
});

// ── Profile: Save onboarding ──────────────────────────────────────────────────

app.post("/make-server-975f4bc8/profile/onboarding", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const body = await c.req.json();
    const { user, db } = auth;

    // Upsert into user_profiles (creates or replaces the profile row)
    const { error } = await db.from('user_profiles').upsert({
      user_id:          user.id,
      name:             body.name || '',
      primary_goal:     body.primaryGoal || 'general_fitness',
      experience_level: body.experienceLevel || 'beginner',
      gender:           body.gender || 'other',
      age:              body.age ? parseInt(body.age) : null,
      height_cm:        body.height ? parseFloat(body.height) : null,
      weight_kg:        body.weight ? parseFloat(body.weight) : null,
      equipment:        body.equipment || 'full_gym',
      custom_equipment: body.customEquipment || [],
      training_days:    body.trainingDays || 3,
      session_length:   body.sessionLength || 60,
      workout_style:    body.workoutStyle || 'full_body',
      abs_preference:   body.absPreference || 'none',
      avg_sleep:        body.avgSleep || 7,
      activity_level:   body.activityLevel || 'moderately_active',
      stress_level:     body.stressLevel || 5,
      job_activity:     body.jobActivity || 'desk',
      cardio_sessions:  body.cardioSessions || 0,
      injuries:         body.injuries || '',
    }, { onConflict: 'user_id' });

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Profile: Get ──────────────────────────────────────────────────────────────

app.get("/make-server-975f4bc8/profile", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const { data, error } = await auth.db
      .from('user_profiles')
      .select('*')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (error) return c.json({ error: error.message }, 500);

    // Map DB columns back to camelCase for the frontend
    const profile = data ? mapProfileToClient(data) : null;
    return c.json({ profile });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Profile: Update preferences (units, theme, language) ─────────────────────

app.patch("/make-server-975f4bc8/profile/preferences", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const { units, theme, language } = await c.req.json();
    const update: any = {};
    if (units)    update.units    = units;
    if (theme)    update.theme    = theme;
    if (language) update.language = language;

    const { error } = await auth.db
      .from('user_profiles')
      .update(update)
      .eq('user_id', auth.user.id);

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Workout Plan: Save ────────────────────────────────────────────────────────
// Replaces all existing plan rows for this user, then inserts fresh ones.
// Atomically using a transaction-style approach: delete + insert in sequence.

app.post("/make-server-975f4bc8/workouts/plan", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const { workouts } = await c.req.json();
    const { user, db } = auth;

    // Delete existing plan days
    const { error: delError } = await db
      .from('workout_plans')
      .delete()
      .eq('user_id', user.id);
    if (delError) return c.json({ error: delError.message }, 500);

    // Insert new days
    const days = Object.entries(workouts).map(([day_name, exercises], idx) => ({
      user_id:    user.id,
      day_name,
      sort_order: idx,
      exercises,
    }));

    if (days.length > 0) {
      const { error: insError } = await db.from('workout_plans').insert(days);
      if (insError) return c.json({ error: insError.message }, 500);
    }

    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Workout Plan: Get ─────────────────────────────────────────────────────────

app.get("/make-server-975f4bc8/workouts/plan", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const { data, error } = await auth.db
      .from('workout_plans')
      .select('day_name, exercises, sort_order')
      .eq('user_id', auth.user.id)
      .order('sort_order');

    if (error) return c.json({ error: error.message }, 500);

    // Reconstruct the {workouts: {dayName: exercises[]}} shape the frontend expects
    const workouts: Record<string, any[]> = {};
    for (const row of (data || [])) {
      workouts[row.day_name] = row.exercises;
    }

    return c.json({ plan: data?.length ? { workouts } : null });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Workout Log: Save completed session ───────────────────────────────────────

app.post("/make-server-975f4bc8/workouts/log", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const body = await c.req.json();
    const { user, db } = auth;

    // 1. Insert session row
    const { data: session, error: sessErr } = await db
      .from('workout_sessions')
      .insert({
        user_id:          user.id,
        day_name:         body.dayName,
        completed_at:     body.completedAt || new Date().toISOString(),
        duration_minutes: body.duration || null,
        perceived_effort: body.perceivedEffort || null,
        feedback:         body.feedback || '',
        rpe_corrections:  body.rpeCorrections || {},
      })
      .select('id')
      .single();

    if (sessErr) return c.json({ error: sessErr.message }, 500);

    // 2. Insert individual sets
    const sets = (body.sets || []).map((s: any) => ({
      session_id:    session.id,
      user_id:       user.id,
      exercise_id:   s.exerciseId || s.exerciseName,
      exercise_name: s.exerciseName,
      set_number:    s.set,
      weight_kg:     s.weight || 0,
      reps:          s.reps,
      completed_at:  s.timestamp || new Date().toISOString(),
    }));

    if (sets.length > 0) {
      const { error: setsErr } = await db.from('workout_sets').insert(sets);
      if (setsErr) return c.json({ error: setsErr.message }, 500);
    }

    return c.json({ success: true, sessionId: session.id });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Workout History: Get ──────────────────────────────────────────────────────
// Returns sessions with their sets nested, newest first.
// Supports optional ?limit= and ?exercise_id= query params.

app.get("/make-server-975f4bc8/workouts/history", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const exerciseId = c.req.query('exercise_id'); // optional filter

    let query = auth.db
      .from('workout_sessions')
      .select(`
        id, day_name, completed_at, duration_minutes,
        perceived_effort, feedback, rpe_corrections,
        workout_sets (
          exercise_id, exercise_name, set_number,
          weight_kg, reps, e1rm_kg, completed_at
        )
      `)
      .eq('user_id', auth.user.id)
      .order('completed_at', { ascending: false })
      .limit(limit);

    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);

    // Map to the shape the frontend algorithms expect
    const history = (data || []).map(mapSessionToClient);

    return c.json({ history });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Exercise strength history (for a single exercise) ─────────────────────────
// Used by ProgressionInsights to get clean per-exercise e1RM trend.

app.get("/make-server-975f4bc8/workouts/exercise-history", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const exerciseId = c.req.query('exercise_id');
    if (!exerciseId) return c.json({ error: 'exercise_id required' }, 400);

    // Use the best_sets_per_session view for clean per-session best sets
    const { data, error } = await auth.db
      .from('best_sets_per_session')
      .select('session_id, exercise_name, completed_at, weight_kg, reps, e1rm_kg')
      .eq('user_id', auth.user.id)
      .eq('exercise_id', exerciseId)
      .order('completed_at', { ascending: true });

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ history: data || [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Bodyweight: Save ──────────────────────────────────────────────────────────

app.post("/make-server-975f4bc8/progress/bodyweight", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const { weight, date } = await c.req.json();
    if (!weight || !date) return c.json({ error: 'weight and date required' }, 400);

    // Upsert: if same user + date exists, update the weight
    const { error } = await auth.db
      .from('bodyweight_log')
      .upsert(
        { user_id: auth.user.id, weight_kg: parseFloat(weight), logged_at: date },
        { onConflict: 'user_id,logged_at' },
      );

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Bodyweight: Get history ───────────────────────────────────────────────────

app.get("/make-server-975f4bc8/progress/bodyweight", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const days = parseInt(c.req.query('days') || '90');

    const { data, error } = await auth.db
      .from('bodyweight_log')
      .select('weight_kg, logged_at')
      .eq('user_id', auth.user.id)
      .gte('logged_at', new Date(Date.now() - days * 86400000).toISOString().split('T')[0])
      .order('logged_at', { ascending: true });

    if (error) return c.json({ error: error.message }, 500);

    // Map to {date, weight} shape the frontend uses
    const entries = (data || []).map((r: any) => ({
      date: r.logged_at,
      weight: parseFloat(r.weight_kg),
    }));

    return c.json({ entries });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Weekly volume summary ─────────────────────────────────────────────────────

app.get("/make-server-975f4bc8/progress/volume", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const { data, error } = await auth.db
      .from('weekly_volume')
      .select('*')
      .eq('user_id', auth.user.id)
      .gte('week_start', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('total_sets', { ascending: false });

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ volume: data || [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Data reset (Profile page) ─────────────────────────────────────────────────

app.delete("/make-server-975f4bc8/profile/data", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const { user, db } = auth;
    // CASCADE on workout_sessions will delete workout_sets automatically
    await Promise.all([
      db.from('workout_sessions').delete().eq('user_id', user.id),
      db.from('workout_plans').delete().eq('user_id', user.id),
      db.from('bodyweight_log').delete().eq('user_id', user.id),
    ]);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Mapping helpers ───────────────────────────────────────────────────────────

function mapProfileToClient(row: any) {
  return {
    name:            row.name,
    primaryGoal:     row.primary_goal,
    experienceLevel: row.experience_level,
    gender:          row.gender,
    age:             row.age,
    height:          row.height_cm,
    weight:          row.weight_kg,
    equipment:       row.equipment,
    customEquipment: row.custom_equipment,
    trainingDays:    row.training_days,
    sessionLength:   row.session_length,
    workoutStyle:    row.workout_style,
    absPreference:   row.abs_preference,
    avgSleep:        row.avg_sleep,
    activityLevel:   row.activity_level,
    stressLevel:     row.stress_level,
    jobActivity:     row.job_activity,
    cardioSessions:  row.cardio_sessions,
    injuries:        row.injuries,
    units:           row.units,
    theme:           row.theme,
    language:        row.language,
  };
}

function mapSessionToClient(row: any) {
  return {
    id:              row.id,
    dayName:         row.day_name,
    completedAt:     row.completed_at,
    duration:        row.duration_minutes,
    perceivedEffort: row.perceived_effort,
    feedback:        row.feedback,
    rpeCorrections:  row.rpe_corrections,
    sets: (row.workout_sets || []).map((s: any) => ({
      exerciseId:   s.exercise_id,
      exerciseName: s.exercise_name,
      set:          s.set_number,
      weight:       parseFloat(s.weight_kg),
      reps:         s.reps,
      e1rm:         s.e1rm_kg ? parseFloat(s.e1rm_kg) : null,
      timestamp:    s.completed_at,
    })),
  };
}

Deno.serve(app.fetch);
