/**
 * Data access layer — direct Supabase queries
 *
 * Phase 2 changes:
 *   - WorkoutSet now carries optional `equipmentType` field
 *   - workoutApi.log() writes equipment_type to workout_sets table
 *   - workoutApi.getHistory() reads equipment_type back from DB
 *   - Backward compatible: old rows without equipment_type return undefined
 *
 * Phase 1 / FIX #8: profileApi.updatePreferences whitelists exactly the three
 *   allowed fields (units, theme, language).
 */

import { supabase } from './supabase-client';

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface UserProfile {
  name: string;
  primaryGoal: 'build_muscle' | 'lose_fat' | 'increase_strength' | 'general_fitness' | 'athletic_performance';
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  gender: 'male' | 'female' | 'other';
  age: number;
  height: number;
  weight: number;
  equipment: 'full_gym' | 'bodyweight';
  customEquipment: string[];
  trainingDays: number;
  sessionLength: number;
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
  weight: number;
  reps: number;
  e1rm?: number;
  timestamp: string;
  /** Phase 2: equipment type for this set — enables equipment-aware history keys */
  equipmentType?: string;
}

export interface MuscleVolumeEntry {
  sets: number;
  reps: number;
  volumeKg: number;
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
  muscleVolume?: Record<string, MuscleVolumeEntry>;
}

export interface WorkoutPlan {
  workouts: Record<string, any[]>;
}

export interface BodyweightEntry {
  date: string;
  weight: number;
}

export interface ExerciseHistoryPoint {
  session_id: string;
  exercise_name: string;
  completed_at: string;
  weight_kg: number;
  reps: number;
  e1rm_kg: number;
  equipment_type?: string;
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

// ─── Profile ──────────────────────────────────────────────────────────────────

const VALID_UNITS     = new Set(['metric', 'imperial']);
const VALID_THEMES    = new Set(['light', 'dark', 'auto']);
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

    if (prefs.units    && !VALID_UNITS.has(prefs.units))        throw new Error(`Invalid units: ${prefs.units}`);
    if (prefs.theme    && !VALID_THEMES.has(prefs.theme))       throw new Error(`Invalid theme: ${prefs.theme}`);
    if (prefs.language && !VALID_LANGUAGES.has(prefs.language)) throw new Error(`Invalid language: ${prefs.language}`);

    const safeUpdate: Record<string, string> = {};
    if (prefs.units)    safeUpdate.units    = prefs.units;
    if (prefs.theme)    safeUpdate.theme    = prefs.theme;
    if (prefs.language) safeUpdate.language = prefs.language;

    if (Object.keys(safeUpdate).length === 0) return;

    const { error } = await supabase
      .from('user_profiles')
      .update(safeUpdate)
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

    const { data: existingRows, error: fetchErr } = await supabase
      .from('workout_plans')
      .select('day_name')
      .eq('user_id', userId);
    if (fetchErr) throw fetchErr;

    const existingDayNames = (existingRows || []).map((r: any) => r.day_name);
    const daysToDelete = existingDayNames.filter(d => !incomingDayNames.includes(d));

    if (daysToDelete.length > 0) {
      const { error: delError } = await supabase
        .from('workout_plans')
        .delete()
        .eq('user_id', userId)
        .in('day_name', daysToDelete);
      if (delError) throw delError;
    }
  },
};

// ─── Workout sessions ─────────────────────────────────────────────────────────

export type WorkoutLogPayload = {
  dayName: string;
  completedAt: string;
  sets: WorkoutSet[];
  perceivedEffort?: number;
  feedback?: string;
  rpeCorrections?: Record<string, number>;
  duration?: number;
  muscleVolume?: Record<string, MuscleVolumeEntry>;
};

export const workoutApi = {
  getHistory: async (limit = 50): Promise<WorkoutSession[]> => {
    const userId = await getUserId();

    const { data: sessions, error: sessionsError } = await supabase
      .from('workout_sessions')
      .select(`
        id, day_name, completed_at, duration_minutes,
        perceived_effort, feedback, rpe_corrections, muscle_volume
      `)
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (sessionsError) throw sessionsError;
    if (!sessions || sessions.length === 0) return [];

    const sessionIds = sessions.map(s => s.id);
    const { data: sets, error: setsError } = await supabase
      .from('workout_sets')
      // Phase 2: include equipment_type in select
      .select('*, equipment_type')
      .in('session_id', sessionIds)
      .order('completed_at', { ascending: true });

    if (setsError) throw setsError;

    const setsBySessionId = (sets || []).reduce((acc: any, set: any) => {
      if (!acc[set.session_id]) acc[set.session_id] = [];
      acc[set.session_id].push(set);
      return acc;
    }, {});

    return (sessions || []).map(row => ({
      id:              row.id,
      dayName:         row.day_name,
      completedAt:     row.completed_at,
      duration:        row.duration_minutes,
      perceivedEffort: row.perceived_effort,
      feedback:        row.feedback,
      rpeCorrections:  row.rpe_corrections,
      muscleVolume:    row.muscle_volume,
      sets: (setsBySessionId[row.id] || []).map((s: any) => ({
        exerciseId:   s.exercise_id,
        exerciseName: s.exercise_name,
        set:          s.set_number,
        weight:       parseFloat(s.weight_kg || 0),
        reps:         s.reps,
        e1rm:         s.e1rm_kg ? parseFloat(s.e1rm_kg) : null,
        timestamp:    s.completed_at,
        // Phase 2: pass through equipment_type (may be null for old rows)
        equipmentType: s.equipment_type ?? undefined,
      })),
    }));
  },

  getExerciseHistory: async (exerciseId: string): Promise<ExerciseHistoryPoint[]> => {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('best_sets_per_session')
      .select('session_id, exercise_name, completed_at, weight_kg, reps, e1rm_kg, equipment_type')
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId)
      .order('completed_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  log: async (session: {
    dayName: string;
    completedAt: string;
    sets: WorkoutSet[];
    perceivedEffort?: number;
    feedback?: string;
    rpeCorrections?: Record<string, number>;
    duration?: number;
    muscleVolume?: Record<string, MuscleVolumeEntry>;
  }): Promise<string> => {
    const userId = await getUserId();

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
        muscle_volume:    session.muscleVolume || null,
      })
      .select('id')
      .single();

    if (sessErr) throw sessErr;

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
        // Phase 2: write equipment_type if present
        equipment_type: s.equipmentType ?? null,
      }));

      const { error: setsErr } = await supabase.from('workout_sets').insert(sets);
      if (setsErr) {
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
  getBodyweight: async (days = 90): Promise<BodyweightEntry[]> => {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('bodyweight_log')
      .select('weight_kg, logged_at')
      .gte('logged_at', cutoff)
      .order('logged_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(r => ({ date: r.logged_at, weight: parseFloat(r.weight_kg) }));
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

  getWeeklyVolume: async (): Promise<VolumeEntry[]> => {
    const now = new Date();
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
