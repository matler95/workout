// Additional API methods — to be merged into api.ts
// progressApi.getWorkoutsPerWeek() queries the workouts_per_week view
// used by Dashboard and Progress for streak calculation

import { supabase } from './supabase-client';

export interface WorkoutsPerWeekEntry {
  week_start: string;   // YYYY-MM-DD
  workout_count: number;
}

export async function getWorkoutsPerWeek(weeksBack = 52): Promise<WorkoutsPerWeekEntry[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeksBack * 7);
  const cutoffDate = cutoff.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('workouts_per_week')
    .select('week_start, workout_count')
    .gte('week_start', cutoffDate)
    .order('week_start', { ascending: true });

  if (error) throw error;
  return data || [];
}
