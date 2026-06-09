import { supabase } from './supabase-client';

export interface WorkoutsPerWeekEntry {
  week_start: string;
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

/**
 * FIX #7: Returns volume rows for the last `weeks` calendar weeks so
 * suggestDeload() can detect cumulative fatigue across multiple weeks,
 * not just the current week. Uses local-timezone Monday as week boundary
 * (matching progressApi.getWeeklyVolume()).
 */
export async function getRecentVolume(weeks = 4) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = (dayOfWeek + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysToMonday - (weeks - 1) * 7);
  weekStart.setHours(0, 0, 0, 0);
  const cutoffDate = weekStart.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('weekly_volume')
    .select('*')
    .gte('week_start', cutoffDate)
    .order('total_sets', { ascending: false });
  if (error) throw error;
  return data || [];
}
