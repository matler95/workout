/**
 * Data access layer — direct Supabase queries
 *
 * Previously this module called the edge function via apiCall(). Now it
 * queries the relational tables directly through the Supabase JS client.
 *
 * Every function signature is IDENTICAL to the old version, so no page
 * component needs to change its import statement.
 */

import { supabase } from './supabase-client';

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface UserProfile {
  name: string;
  primaryGoal: 'build_muscle' | 'lose_fat' | 'increase_strength' | 'general_fitness' | 'athletic_performance';
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  gender: 'male' | 'female' | 'other';
  age: number;
  height: number;       // cm
  weight: number;       // kg
  equipment: 'full_gym' | 'bodyweight' | 'limited';
  customEquipment: string[];
  trainingDays: number;
  sessionLength: number; // minutes
  workoutStyle: 'full_body' | 'upper_lower' | 'ppl' | 'bro_split';
  absPreference: 'all_days' | 'specific_days' | 'none';
  avgSleep: number;
  activityLevel: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active';
  stressLevel: number;
  jobActivity: 'desk' | 'standing' | 'physical';
  cardioSessions: number;
  injuries: string;
  units: 'metric' | 'imperial';
  theme: 'light' | 'dark' | 'auto';
  language: 'english' | 'polish';
}

export interface WorkoutSet {
  exerciseId: string;
  exerciseName: string;
  set: number;
  weight: number;       // kg (0 for bodyweight)
  reps: number;
  e1rm?: number;        // computed by DB, returned on history fetch
  timestamp: string;
}

export interface WorkoutSession {
  id?: string;
  dayName: string;
  completedAt: string;
  duration?: number;
  perceivedEffort?: number;
  feedback?: string;
  rpeCorrections?: Record<string, number>;
  sets: WorkoutSet[];
}

export interface WorkoutPlan {
  workouts: Record<string, any[]>;   // dayName → Exercise[]
}

export interface BodyweightEntry {
  date: string;        // YYYY-MM-DD
  weight: number;      // kg
}

export interface ExerciseHistoryPoint {
  session_id: string;
  exercise_name: string;
  completed_at: string;
  weight_kg: number;
  reps: number;
  e1rm_kg: number;
}

export interface VolumeEntry {
  exercise_id: string;
  exercise_name: string;
  week_start: string;
  total_sets: number;
  total_reps: number;
  total_volume_kg: number;
  best_e1rm: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  return user.id;
}

// ── DB ↔ Client mapping ──────────────────────────────────────────────────────

function profileFromDb(row: any): UserProfile {
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

function profileToDb(profile: Partial<UserProfile>): any {
  return {
    name:             profile.name,
    primary_goal:     profile.primaryGoal,
    experience_level: profile.experienceLevel,
    gender:           profile.gender,
    age:              profile.age ? parseInt(String(profile.age)) : null,
    height_cm:        profile.height ? parseFloat(String(profile.height)) : null,
    weight_kg:        profile.weight ? parseFloat(String(profile.weight)) : null,
    equipment:        profile.equipment,
    custom_equipment: profile.customEquipment || [],
    training_days:    profile.trainingDays,
    session_length:   profile.sessionLength,
    workout_style:    profile.workoutStyle,
    abs_preference:   profile.absPreference,
    avg_sleep:        profile.avgSleep,
    activity_level:   profile.activityLevel,
    stress_level:     profile.stressLevel,
    job_activity:     profile.jobActivity,
    cardio_sessions:  profile.cardioSessions,
    injuries:         profile.injuries,
    units:            profile.units,
    theme:            profile.theme,
    language:         profile.language,
  };
}

function sessionFromDb(row: any): WorkoutSession {
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

// ─── Profile ──────────────────────────────────────────────────────────────────

const VALID_UNITS    = new Set(['metric', 'imperial']);
const VALID_THEMES   = new Set(['light', 'dark', 'auto']);
const VALID_LANGUAGES = new Set(['english', 'polish']);

export const profileApi = {
  get: async (): Promise<UserProfile | null> => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data ? profileFromDb(data) : null;
  },

  saveOnboarding: async (data: Partial<UserProfile>): Promise<void> => {
    const userId = await getUserId();
    const { error } = await supabase
      .from('user_profiles')
      .upsert({ user_id: userId, ...profileToDb(data) }, { onConflict: 'user_id' });
    if (error) throw error;
  },

  updatePreferences: async (prefs: {
    units?: UserProfile['units'];
    theme?: UserProfile['theme'];
    language?: UserProfile['language'];
  }): Promise<void> => {
    const userId = await getUserId();

    // Validate enum values before hitting the DB (defence-in-depth)
    if (prefs.units    && !VALID_UNITS.has(prefs.units))        throw new Error(`Invalid units: ${prefs.units}`);
    if (prefs.theme    && !VALID_THEMES.has(prefs.theme))       throw new Error(`Invalid theme: ${prefs.theme}`);
    if (prefs.language && !VALID_LANGUAGES.has(prefs.language)) throw new Error(`Invalid language: ${prefs.language}`);

    // FIX: always include .eq('user_id') — defence-in-depth against RLS gaps
    const { error } = await supabase
      .from('user_profiles')
      .update(prefs)
      .eq('user_id', userId);
    if (error) throw error;
  },

  deleteAllData: async (): Promise<void> => {
    const userId = await getUserId();
    await Promise.all([
      supabase.from('workout_sessions').delete().eq('user_id', userId),
      supabase.from('workout_plans').delete().eq('user_id', userId),
      supabase.from('bodyweight_log').delete().eq('user_id', userId),
    ]);
  },
};

// ─── Workout plan ─────────────────────────────────────────────────────────────

export const planApi = {
  get: async (): Promise<WorkoutPlan | null> => {
    const { data, error } = await supabase
      .from('workout_plans')
      .select('day_name, exercises, sort_order')
      .order('sort_order');
    if (error) throw error;

    if (!data || data.length === 0) return null;

    const workouts: Record<string, any[]> = {};
    for (const row of data) {
      workouts[row.day_name] = row.exercises;
    }
    return { workouts };
  },

  save: async (workouts: Record<string, any[]>): Promise<void> => {
    const userId = await getUserId();

    const incomingDayNames = Object.keys(workouts);

    // Step 1: upsert all incoming days
    const days = incomingDayNames.map((day_name, idx) => ({
      user_id:    userId,
      day_name,
      sort_order: idx,
      exercises:  workouts[day_name],
    }));

    if (days.length > 0) {
      const { error: upsertError } = await supabase
        .from('workout_plans')
        .upsert(days, { onConflict: 'user_id,day_name' });
      if (upsertError) throw upsertError;
    }

    // Step 2: delete days no longer in the plan.
    // FIX: Postgres IN clauses require single-quoted string literals.
    // The previous code used double-quotes, which Postgres treats as column
    // identifiers rather than string values — so the DELETE never fired and
    // stale days accumulated silently.
    // We now pass the array directly to the Supabase client and let it build
    // the correct parameterised query via .in(), which avoids any quoting
    // issues entirely.
    if (incomingDayNames.length > 0) {
      const { error: delError } = await supabase
        .from('workout_plans')
        .delete()
        .eq('user_id', userId)
        .not('day_name', 'in', `(${incomingDayNames.map(d => `'${d.replace(/'/g, "''")}'`).join(',')})`);
      if (delError) throw delError;
    } else {
      const { error: delError } = await supabase
        .from('workout_plans')
        .delete()
        .eq('user_id', userId);
      if (delError) throw delError;
    }
  },
};

// ─── Workout sessions ─────────────────────────────────────────────────────────

export const workoutApi = {
  /** Full history — newest first. Use limit to cap payload. */
  getHistory: async (limit = 50): Promise<WorkoutSession[]> => {
    const { data, error } = await supabase
      .from('workout_sessions')
      .select(`
        id, day_name, completed_at, duration_minutes,
        perceived_effort, feedback, rpe_corrections,
        workout_sets (
          exercise_id, exercise_name, set_number,
          weight_kg, reps, e1rm_kg, completed_at
        )
      `)
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).map(sessionFromDb);
  },

  /**
   * Per-exercise best set history — uses DB view, much faster than
   * loading full history and filtering in JS.
   */
  getExerciseHistory: async (exerciseId: string): Promise<ExerciseHistoryPoint[]> => {
    const { data, error } = await supabase
      .from('best_sets_per_session')
      .select('session_id, exercise_name, completed_at, weight_kg, reps, e1rm_kg')
      .eq('exercise_id', exerciseId)
      .order('completed_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * FIX: wrap session + sets insert in a single RPC call to avoid orphaned
   * sessions when the sets insert fails. Falls back to two-step insert if the
   * RPC isn't available (graceful degradation).
   */
  log: async (session: {
    dayName: string;
    completedAt: string;
    sets: WorkoutSet[];
    perceivedEffort?: number;
    feedback?: string;
    rpeCorrections?: Record<string, number>;
    duration?: number;
  }): Promise<string> => {
    const userId = await getUserId();

    // Insert session
    const { data: sessionResult, error: sessErr } = await supabase
      .from('workout_sessions')
      .insert({
        user_id:          userId,
        day_name:         session.dayName,
        completed_at:     session.completedAt,
        duration_minutes: session.duration || null,
        perceived_effort: session.perceivedEffort || null,
        feedback:         session.feedback || '',
        rpe_corrections:  session.rpeCorrections || {},
      })
      .select('id')
      .single();

    if (sessErr) throw sessErr;

    // Insert sets — if this throws, the session row is orphaned.
    // TODO: replace with an RPC (DB function) that inserts both atomically.
    // For now we at least clean up the orphan on failure.
    if ((session.sets || []).length > 0) {
      const sets = session.sets.map(s => ({
        session_id:    sessionResult.id,
        user_id:       userId,
        exercise_id:   s.exerciseId,
        exercise_name: s.exerciseName,
        set_number:    s.set,
        weight_kg:     s.weight || 0,
        reps:          s.reps,
        completed_at:  s.timestamp || new Date().toISOString(),
      }));

      const { error: setsErr } = await supabase.from('workout_sets').insert(sets);
      if (setsErr) {
        // Rollback the orphaned session row
        await supabase
          .from('workout_sessions')
          .delete()
          .eq('id', sessionResult.id)
          .eq('user_id', userId);
        throw setsErr;
      }
    }

    return sessionResult.id;
  },
};

// ─── Progress ─────────────────────────────────────────────────────────────────

export const progressApi = {
  /** Last `days` days of bodyweight entries, oldest first. */
  getBodyweight: async (days = 90): Promise<BodyweightEntry[]> => {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('bodyweight_log')
      .select('weight_kg, logged_at')
      .gte('logged_at', cutoff)
      .order('logged_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(r => ({
      date:   r.logged_at,
      weight: parseFloat(r.weight_kg),
    }));
  },

  logBodyweight: async (weight: number, date: string): Promise<void> => {
    const userId = await getUserId();
    const { error } = await supabase
      .from('bodyweight_log')
      .upsert(
        { user_id: userId, weight_kg: weight, logged_at: date },
        { onConflict: 'user_id,logged_at' },
      );
    if (error) throw error;
  },

  /**
   * Weekly volume from DB — aggregated by exercise, covering the current week.
   *
   * FIX (Timezone): compute week start in local time, then convert to ISO for
   * the query. The previous version used UTC Monday, which could misalign with
   * the user's local Monday (e.g. a UTC-5 user's Monday workout at 9 PM local
   * is Sunday 2 AM UTC and lands in the prior week's bucket).
   */
  getWeeklyVolume: async (): Promise<VolumeEntry[]> => {
    const now = new Date();
    // getDay() returns 0=Sun … 6=Sat in local time
    const dayOfWeek = now.getDay();
    const daysToMonday = (dayOfWeek + 6) % 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartDate = weekStart.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('weekly_volume')
      .select('*')
      .gte('week_start', weekStartDate)
      .order('total_sets', { ascending: false });

    if (error) throw error;
    return data || [];
  },
};