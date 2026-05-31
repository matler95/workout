/**
 * Typed API client
 *
 * Single place that knows every endpoint. Components import functions,
 * not URL strings — so a renamed endpoint is a one-line fix here, not
 * a grep across the whole codebase.
 */

import { apiCall } from './supabase-client';

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

// ─── Profile ──────────────────────────────────────────────────────────────────

export const profileApi = {
  get: async (): Promise<UserProfile | null> => {
    const { profile } = await apiCall('/profile');
    return profile;
  },

  saveOnboarding: async (data: Partial<UserProfile>): Promise<void> => {
    await apiCall('/profile/onboarding', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePreferences: async (prefs: {
    units?: UserProfile['units'];
    theme?: UserProfile['theme'];
    language?: UserProfile['language'];
  }): Promise<void> => {
    await apiCall('/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    });
  },

  deleteAllData: async (): Promise<void> => {
    await apiCall('/profile/data', { method: 'DELETE' });
  },
};

// ─── Workout plan ─────────────────────────────────────────────────────────────

export const planApi = {
  get: async (): Promise<WorkoutPlan | null> => {
    const { plan } = await apiCall('/workouts/plan');
    return plan;
  },

  save: async (workouts: Record<string, any[]>): Promise<void> => {
    await apiCall('/workouts/plan', {
      method: 'POST',
      body: JSON.stringify({ workouts }),
    });
  },
};

// ─── Workout sessions ─────────────────────────────────────────────────────────

export const workoutApi = {
  /** Full history — newest first. Use limit to cap payload. */
  getHistory: async (limit = 50): Promise<WorkoutSession[]> => {
    const { history } = await apiCall(`/workouts/history?limit=${limit}`);
    return history || [];
  },

  /**
   * Per-exercise best set history — uses DB view, much faster than
   * loading full history and filtering in JS.
   */
  getExerciseHistory: async (exerciseId: string): Promise<ExerciseHistoryPoint[]> => {
    const encoded = encodeURIComponent(exerciseId);
    const { history } = await apiCall(`/workouts/exercise-history?exercise_id=${encoded}`);
    return history || [];
  },

  log: async (session: {
    dayName: string;
    completedAt: string;
    sets: WorkoutSet[];
    perceivedEffort?: number;
    feedback?: string;
    rpeCorrections?: Record<string, number>;
    duration?: number;
  }): Promise<void> => {
    await apiCall('/workouts/log', {
      method: 'POST',
      body: JSON.stringify(session),
    });
  },
};

// ─── Progress ─────────────────────────────────────────────────────────────────

export const progressApi = {
  /** Last `days` days of bodyweight entries, oldest first. */
  getBodyweight: async (days = 90): Promise<BodyweightEntry[]> => {
    const { entries } = await apiCall(`/progress/bodyweight?days=${days}`);
    return entries || [];
  },

  logBodyweight: async (weight: number, date: string): Promise<void> => {
    await apiCall('/progress/bodyweight', {
      method: 'POST',
      body: JSON.stringify({ weight, date }),
    });
  },

  /**
   * Weekly volume from DB — aggregated by exercise, covering the current week.
   * Much faster than loading all history and inferring muscles in JS.
   */
  getWeeklyVolume: async (): Promise<VolumeEntry[]> => {
    const { volume } = await apiCall('/progress/volume');
    return volume || [];
  },
};
