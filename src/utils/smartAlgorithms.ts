/**
 * Smart Algorithms Module
 *
 * Provides intelligent features without external AI APIs:
 * - Deload detection
 * - Adaptive rep ranges
 * - Fatigue warnings
 * - Progression intelligence
 * - Exercise substitution
 * - Auto-plan generation
 * - And more...
 */

import type { UserProfile, WorkoutSession, VolumeEntry, WorkoutSet } from './api';
import type { Exercise } from '../data/exercises';
import { VOLUME_LANDMARKS } from './volumeTracking';
import { inferMuscleGroup } from './inferMuscleGroup';

// ─── Types ────────────────────────────────────────────────────────────────

export interface DeloadSuggestion {
  suggest: boolean;
  reason?: 'excessive_volume' | 'declining_strength' | 'overuse' | 'high_fatigue';
  severity?: 'low' | 'medium' | 'high';
  affectedMuscles?: string[];
}

export interface RepRangeRecommendation {
  min: number;
  max: number;
  reason: string;
  confidence: number; // 0-1
}

export interface FatigueWarning {
  exerciseName: string;
  type: 'short_recovery' | 'excessive_volume' | 'high_frequency' | 'overuse_risk';
  severity: 'low' | 'medium' | 'high';
  message: string;
  daysSinceLastSession?: number;
}

export interface ProgressionSuggestion {
  strategy: 'add_weight' | 'add_sets' | 'lower_reps' | 'maintain' | 'deload';
  percent?: number;
  sets?: number;
  reason: string;
  confidence: number;
}

export interface RecoveryScore {
  score: number; // 0-100
  level: 'poor' | 'fair' | 'good' | 'excellent';
  factors: { sleep: number; stress: number; recovery: number };
  recommendation: string;
}

export interface ExerciseSubstitute {
  exercise: Exercise;
  matchScore: number; // 0-100
  reason: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getPlateauLength(history: WorkoutSet[]): number {
  if (history.length === 0) return 0;
  
  const sorted = [...history].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  let plateauDays = 0;
  const maxWeight = sorted[sorted.length - 1].weight;
  
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].weight < maxWeight * 1.01) { // Within 1% of max
      plateauDays++;
    } else {
      break;
    }
  }
  
  // Convert set count to approximate weeks (4.3 sets per week on average)
  return Math.round(plateauDays / 4.3);
}

function calculateStrengthTrend(recentSets: WorkoutSet[]): { increasing: number; stuck: number; declining: number } {
  if (recentSets.length < 2) return { increasing: 0, stuck: 1, declining: 0 };
  
  const sorted = [...recentSets].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  let up = 0, flat = 0, down = 0;
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i].weight - sorted[i - 1].weight;
    if (diff > sorted[i - 1].weight * 0.01) up++;
    else if (diff < -sorted[i - 1].weight * 0.01) down++;
    else flat++;
  }
  
  const total = up + flat + down || 1;
  return { increasing: up / total, stuck: flat / total, declining: down / total };
}

function daysSince(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function average(numbers: number[]): number {
  return numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
}

// ─── TIER 1: Smart Deload Detection ───────────────────────────────────────

export function suggestDeload(
  volumeHistory: VolumeEntry[],
  workoutHistory: WorkoutSession[],
  profile: UserProfile,
): DeloadSuggestion {
  const recentSessions = workoutHistory.slice(0, 14); // Last 2 weeks
  if (recentSessions.length === 0) {
    return { suggest: false };
  }

  // Check for excessive volume
  const excessiveMuscles: string[] = [];
  const volumeByMuscle: Record<string, number> = {};
  
  for (const entry of volumeHistory) {
    volumeByMuscle[entry.exercise_name] = entry.total_sets;
    if (entry.total_sets > (VOLUME_LANDMARKS[entry.exercise_name]?.MRV || 20)) {
      excessiveMuscles.push(entry.exercise_name);
    }
  }

  if (excessiveMuscles.length >= 3) {
    return {
      suggest: true,
      reason: 'excessive_volume',
      severity: 'high',
      affectedMuscles: excessiveMuscles,
    };
  }

  // Check for declining strength (last 5 sessions trending down)
  const last5Sessions = recentSessions.slice(0, 5);
  if (last5Sessions.length >= 5) {
    const avgWeights = last5Sessions.map(s => 
      average(s.sets.map(set => set.weight))
    );
    
    const trend = (avgWeights[avgWeights.length - 1] - avgWeights[0]) / avgWeights[0];
    if (trend < -0.05) { // 5% decline
      return {
        suggest: true,
        reason: 'declining_strength',
        severity: 'medium',
      };
    }
  }

  // Check for overuse (same muscles 5+ consecutive days)
  let maxConsecutiveDays = 0;
  let currentStreak = 0;
  const musclesLastDay = new Set<string>();

  for (const session of recentSessions) {
    const musclesThisDay = new Set<string>();
    for (const set of session.sets) {
      const muscles = inferMuscleGroup(set.exerciseId, set.exerciseName);
      muscles.forEach(m => musclesThisDay.add(m));
    }

    // Check if same muscles as yesterday
    if (musclesLastDay.size > 0 && musclesThisDay.size > 0) {
      const overlap = [...musclesLastDay].filter(m => musclesThisDay.has(m)).length;
      if (overlap >= 2) {
        currentStreak++;
        maxConsecutiveDays = Math.max(maxConsecutiveDays, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    musclesLastDay.clear();
    musclesThisDay.forEach(m => musclesLastDay.add(m));
  }

  if (maxConsecutiveDays >= 5) {
    return {
      suggest: true,
      reason: 'overuse',
      severity: 'high',
    };
  }

  // Check for high fatigue (low sleep + high stress + frequent workouts)
  const avgSleep = profile.avgSleep || 7;
  const stress = profile.stressLevel || 3;
  const fatigueScore = ((8 - avgSleep) / 8) * 0.4 + ((profile.stressLevel || 3) / 10) * 0.6;

  if (fatigueScore > 0.6 && recentSessions.length >= 4) {
    return {
      suggest: true,
      reason: 'high_fatigue',
      severity: 'medium',
    };
  }

  return { suggest: false };
}

// ─── TIER 1: Adaptive Rep Ranges ──────────────────────────────────────────

export function getAdaptiveRepRange(
  exerciseId: string,
  recentSets: WorkoutSet[],
  experienceLevel: string,
): RepRangeRecommendation {
  if (recentSets.length === 0) {
    // Default based on experience
    const defaults: Record<string, [number, number]> = {
      beginner: [8, 12],
      intermediate: [6, 10],
      advanced: [3, 6],
    };
    const [min, max] = defaults[experienceLevel] || [6, 10];
    return { min, max, reason: 'default_for_experience', confidence: 0.6 };
  }

  const trend = calculateStrengthTrend(recentSets.slice(-5));

  // Strong uptrend → focus on strength
  if (trend.increasing > 0.6) {
    return {
      min: 3,
      max: 6,
      reason: 'strength_phase_trending_up',
      confidence: 0.85,
    };
  }

  // Plateaued → try hypertrophy with higher reps
  if (trend.stuck > 0.6) {
    return {
      min: 10,
      max: 15,
      reason: 'plateau_breaking_with_volume',
      confidence: 0.80,
    };
  }

  // Declining → maintain and recover
  if (trend.declining > 0.4) {
    return {
      min: 8,
      max: 12,
      reason: 'declining_phase_maintain',
      confidence: 0.75,
    };
  }

  // Default balanced approach
  return {
    min: 6,
    max: 10,
    reason: 'balanced_approach',
    confidence: 0.70,
  };
}

// ─── TIER 1: Fatigue Warnings ─────────────────────────────────────────────

export function checkFatigueWarnings(
  dayPlan: Exercise[],
  profile: UserProfile,
  workoutHistory: WorkoutSession[],
): FatigueWarning[] {
  const warnings: FatigueWarning[] = [];
  const recentSessions = workoutHistory.slice(0, 7); // Last week

  // Count sets per muscle today
  const musclesInPlan = new Map<string, number>();
  for (const ex of dayPlan) {
    const muscles = inferMuscleGroup(ex.id, ex.name);
    for (const muscle of muscles) {
      musclesInPlan.set(muscle, (musclesInPlan.get(muscle) || 0) + 1);
    }
  }

  // Check each exercise
  for (const ex of dayPlan) {
    const muscles = inferMuscleGroup(ex.id, ex.name);
    
    for (const muscle of muscles) {
      // Find last session this muscle was trained
      const lastSession = recentSessions.find(s =>
        s.sets.some(set => 
          inferMuscleGroup(set.exerciseId, set.exerciseName).includes(muscle)
        )
      );

      if (lastSession) {
        const daysSinceLastSession = daysSince(lastSession.completedAt);

        // Recovery window warning: <48 hours
        if (daysSinceLastSession < 2) {
          warnings.push({
            exerciseName: ex.name,
            type: 'short_recovery',
            severity: daysSinceLastSession < 1 ? 'high' : 'medium',
            message: `Only ${daysSinceLastSession} day(s) since last ${muscle} training. Consider 48-72h recovery.`,
            daysSinceLastSession,
          });
        }

        // High frequency warning: same muscle 4+ days/week for 2+ weeks
        const last14Days = recentSessions.slice(0, 14);
        const muscleFrequency = last14Days.filter(s =>
          s.sets.some(set =>
            inferMuscleGroup(set.exerciseId, set.exerciseName).includes(muscle)
          )
        ).length;

        if (muscleFrequency >= 4) {
          warnings.push({
            exerciseName: ex.name,
            type: 'high_frequency',
            severity: 'medium',
            message: `${muscle} trained ${muscleFrequency} days this week. Consider reducing frequency.`,
          });
        }
      }

      // Check weekly volume
      const weeklyVolume = recentSessions.reduce((sum, s) => 
        sum + s.sets.filter(set =>
          inferMuscleGroup(set.exerciseId, set.exerciseName).includes(muscle)
        ).length,
        0
      );

      const mrvThreshold = VOLUME_LANDMARKS[muscle]?.MRV || 20;
      if (weeklyVolume > mrvThreshold) {
        warnings.push({
          exerciseName: ex.name,
          type: 'excessive_volume',
          severity: 'high',
          message: `${muscle} weekly volume (${weeklyVolume} sets) exceeds MRV threshold (${mrvThreshold}).`,
        });
      }
    }
  }

  return [...new Map(warnings.map(w => [w.message, w])).values()]; // Deduplicate
}

// ─── TIER 1: Progression Intelligence ──────────────────────────────────────

export function suggestProgression(
  exerciseId: string,
  recentSets: WorkoutSet[],
  weeklyVolume: number,
  landmarkMAV: number = 14,
): ProgressionSuggestion {
  if (recentSets.length === 0) {
    return {
      strategy: 'maintain',
      reason: 'no_history',
      confidence: 0.5,
    };
  }

  const plateauLength = getPlateauLength(recentSets);
  const trend = calculateStrengthTrend(recentSets.slice(-5));

  // 3+ weeks plateau → increase weight
  if (plateauLength >= 3) {
    return {
      strategy: 'add_weight',
      percent: plateauLength >= 5 ? 5 : 2.5,
      reason: `${plateauLength} weeks plateau, time to add weight`,
      confidence: 0.85,
    };
  }

  // Plateau + high volume → add sets instead
  if (plateauLength >= 2 && weeklyVolume > landmarkMAV) {
    return {
      strategy: 'add_sets',
      sets: 1,
      reason: 'plateau + high volume, add volume instead',
      confidence: 0.80,
    };
  }

  // Rapid progression (strength trending up) → test lower reps
  if (trend.increasing > 0.7 && recentSets.length >= 4) {
    return {
      strategy: 'lower_reps',
      reason: 'rapid strength progression, ready for lower rep ranges',
      confidence: 0.75,
    };
  }

  // Strength declining → deload or maintain
  if (trend.declining > 0.5) {
    if (weeklyVolume > landmarkMAV) {
      return {
        strategy: 'deload',
        reason: 'declining strength + high volume, recommend deload',
        confidence: 0.80,
      };
    }
    return {
      strategy: 'maintain',
      reason: 'declining strength, maintain current load',
      confidence: 0.75,
    };
  }

  return {
    strategy: 'maintain',
    reason: 'on_track',
    confidence: 0.70,
  };
}

// ─── TIER 2: Recovery Readiness Score ─────────────────────────────────────

export function calculateRecoveryScore(
  profile: UserProfile,
  workoutHistory: WorkoutSession[],
): RecoveryScore {
  // Sleep score: 0-40
  const avgSleep = profile.avgSleep || 7;
  const sleepScore = Math.min(40, (avgSleep / 8) * 40);

  // Stress score: 0-30
  const stressLevel = profile.stressLevel || 3;
  const stressScore = ((10 - stressLevel) / 10) * 30;

  // Recovery score: 0-30
  const last48Hours = workoutHistory.filter(
    s => daysSince(s.completedAt) <= 2
  ).length;
  const recoveryScore = last48Hours === 0 ? 30 : last48Hours === 1 ? 20 : 10;

  const totalScore = Math.round(sleepScore + stressScore + recoveryScore);

  let level: 'poor' | 'fair' | 'good' | 'excellent';
  if (totalScore >= 80) level = 'excellent';
  else if (totalScore >= 60) level = 'good';
  else if (totalScore >= 40) level = 'fair';
  else level = 'poor';

  let recommendation = '';
  if (level === 'excellent') {
    recommendation = '💪 Full intensity today - you\'re well recovered';
  } else if (level === 'good') {
    recommendation = '✅ Regular workout OK - you\'re recovering well';
  } else if (level === 'fair') {
    recommendation = '⚠️ Consider lighter session or focus on form';
  } else {
    recommendation = '🛑 Prioritize recovery: light activity + rest';
  }

  return {
    score: totalScore,
    level,
    factors: { sleep: sleepScore, stress: stressScore, recovery: recoveryScore },
    recommendation,
  };
}

// ─── TIER 2: Smart Rest Timer ─────────────────────────────────────────────

export function getRecommendedRest(
  isCompound: boolean,
  repRange: [number, number],
  previousRestTimes: number[] = [],
): number {
  // User habit: if they've rested before, suggest similar duration
  if (previousRestTimes.length > 0) {
    const avgRest = average(previousRestTimes);
    return Math.round(avgRest);
  }

  // Science-based defaults
  const [minReps, maxReps] = repRange;
  const baseRest = isCompound ? { min: 2.5, max: 4 } : { min: 1, max: 2 };

  // Heavy (low reps) → more rest
  if (minReps <= 6) {
    return Math.round(baseRest.max * 60); // in seconds
  }

  // Moderate → mid-range
  if (minReps <= 10) {
    return Math.round(((baseRest.min + baseRest.max) / 2) * 60);
  }

  // Light (high reps) → less rest
  return Math.round(baseRest.min * 60);
}

// ─── TIER 2: Exercise Substitution ────────────────────────────────────────────

export function suggestSubstitutes(
  exercise: Exercise,
  profile: UserProfile,
  database: Exercise[],
): ExerciseSubstitute[] {
  const candidates = database.filter(
    e => e.id !== exercise.id && 
         e.primaryMuscles.some(m => exercise.primaryMuscles.includes(m))
  );

  const scored = candidates.map(candidate => {
    let score = 50; // base

    // Primary muscle overlap (0-30 pts)
    const muscleOverlap = candidate.primaryMuscles.filter(m => 
      exercise.primaryMuscles.includes(m)
    ).length / exercise.primaryMuscles.length;
    score += muscleOverlap * 30;

    // Equipment compatibility (0-20 pts)
    if (candidate.equipment === exercise.equipment) {
      score += 20;
    } else if (candidate.equipment === 'bodyweight' || exercise.equipment === 'bodyweight') {
      score += 5; // Can potentially substitute
    }

    // Experience level match (0-20 pts)
    if (candidate.difficulty === exercise.difficulty) {
      score += 20;
    } else if (candidate.difficulty === 'beginner' && exercise.difficulty === 'intermediate') {
      score += 10;
    } else if (candidate.difficulty === 'intermediate' && exercise.difficulty === 'advanced') {
      score += 10;
    }

    let reason = '';
    if (muscleOverlap > 0.8) reason = 'Very similar primary muscles';
    else if (muscleOverlap > 0.5) reason = 'Similar muscle group focus';
    else reason = 'Targets same muscles';

    return {
      exercise: candidate,
      matchScore: Math.min(100, Math.round(score)),
      reason,
    };
  }).sort((a, b) => b.matchScore - a.matchScore).slice(0, 3);

  return scored;
}

// ─── TIER 2: Auto-Generated Workout Plans ─────────────────────────────────────

export interface AutoPlanResult {
  workouts: Record<string, Exercise[]>;
  rationale: string;
  weekNumber: number;
}

export function generateNextWeekPlan(
  currentPlan: Record<string, Exercise[]>,
  workoutHistory: any[],
  profile: UserProfile,
  database: Exercise[],
): AutoPlanResult {
  // Detect volume deficits from last 7 days
  const lastWeekData = workoutHistory.filter(w => {
    const daysSince = (Date.now() - new Date(w.completedAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 7;
  });

  // Calculate muscle group coverage
  const muscleVolume: Record<string, number> = {};
  lastWeekData.forEach(session => {
    session.sets.forEach((set: any) => {
      const exercise = database.find(e => e.id === set.exerciseId || e.name === set.exerciseName);
      if (exercise) {
        exercise.primaryMuscles.forEach(m => {
          muscleVolume[m] = (muscleVolume[m] || 0) + 1;
        });
      }
    });
  });

  // Identify under-trained muscles
  const targetMuscles = new Set<string>();
  Object.values(currentPlan).flat().forEach(ex => {
    ex.primaryMuscles.forEach(m => targetMuscles.add(m));
  });

  const underTrained = Array.from(targetMuscles).filter(m => 
    (muscleVolume[m] || 0) < 8 // Target ~8 sets per muscle per week
  );

  // Build new plan with substitutions for under-trained muscles
  const newPlan: Record<string, Exercise[]> = {};
  const workoutDays = Object.keys(currentPlan);

  workoutDays.forEach((day, index) => {
    newPlan[day] = currentPlan[day].map(exercise => {
      // If this exercise targets an under-trained muscle, find a better alternative
      const targetsUnderTrained = exercise.primaryMuscles.some(m => underTrained.includes(m));
      
      if (targetsUnderTrained && underTrained.length > 0) {
        const substitutes = suggestSubstitutes(exercise, profile, database);
        if (substitutes.length > 0 && substitutes[0].matchScore > 70) {
          return substitutes[0].exercise;
        }
      }

      return exercise;
    });
  });

  return {
    workouts: newPlan,
    rationale: underTrained.length > 0 
      ? `Detected under-trained muscles: ${underTrained.join(', ')}. Adjusted exercises to increase volume.`
      : `Maintained current plan - balanced muscle training.`,
    weekNumber: Math.ceil(lastWeekData.length / workoutDays.length) + 1,
  };
}

// ─── TIER 3: Bodyweight Trend Prediction ──────────────────────────────────

export function predictBodyweightTrend(
  bodyweightData: Array<{ date: string; weight: number }>,
  daysAhead: number = 60,
): {
  projected: number;
  daysAhead: number;
  slopePerWeek: number;
  confidence: number;
} {
  if (bodyweightData.length < 4) {
    return {
      projected: bodyweightData[bodyweightData.length - 1]?.weight || 0,
      daysAhead,
      slopePerWeek: 0,
      confidence: 0,
    };
  }

  // Simple linear regression on last 28 days
  const recent = bodyweightData.slice(-28);
  const n = recent.length;
  
  const xs = Array.from({ length: n }, (_, i) => i);
  const ys = recent.map(d => d.weight);

  const meanX = average(xs);
  const meanY = average(ys);

  const numerator = xs.reduce((sum, x, i) => sum + (x - meanX) * (ys[i] - meanY), 0);
  const denominator = xs.reduce((sum, x) => sum + Math.pow(x - meanX, 2), 0);

  const slope = denominator > 0 ? numerator / denominator : 0;
  const slopePerWeek = slope * 7;

  // R² for confidence
  const predictedYs = xs.map(x => meanY + slope * (x - meanX));
  const ssRes = ys.reduce((sum, y, i) => sum + Math.pow(y - predictedYs[i], 2), 0);
  const ssTot = ys.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  const current = ys[ys.length - 1];
  const projected = current + slope * daysAhead;

  return {
    projected: Math.round(projected * 10) / 10,
    daysAhead,
    slopePerWeek: Math.round(slopePerWeek * 100) / 100,
    confidence: Math.max(0, Math.min(1, r2)),
  };
}

// ─── TIER 3: Work Capacity Index ──────────────────────────────────────────

export function calculateWorkCapacity(
  volumeHistory: VolumeEntry[],
  last8Weeks: VolumeEntry[] = [],
): {
  totalWeeklyVolume: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  confidence: number;
  recommendation: string;
} {
  const totalWeeklyVolume = volumeHistory.reduce((sum, v) => sum + v.total_sets, 0);

  if (last8Weeks.length < 2) {
    return {
      totalWeeklyVolume,
      trend: 'stable',
      confidence: 0.4,
      recommendation: 'Need more data to assess capacity trend',
    };
  }

  const oldVolume = last8Weeks.slice(-4).reduce((sum, v) => sum + v.total_sets, 0) / 4;
  const newVolume = last8Weeks.slice(0, 4).reduce((sum, v) => sum + v.total_sets, 0) / 4;
  const changePercent = (newVolume - oldVolume) / oldVolume;

  let trend: 'increasing' | 'stable' | 'decreasing';
  let recommendation: string;

  if (changePercent > 0.05) {
    trend = 'increasing';
    recommendation = 'Work capacity improving - you can increase training frequency or add more volume';
  } else if (changePercent < -0.05) {
    trend = 'decreasing';
    recommendation = 'Work capacity declining - consider maintaining current volume or deload';
  } else {
    trend = 'stable';
    recommendation = 'Work capacity stable - consistent training paying off';
  }

  return {
    totalWeeklyVolume: Math.round(totalWeeklyVolume),
    trend,
    confidence: 0.7,
    recommendation,
  };
}

// ─── TIER 3: Muscle Balance Indicator ─────────────────────────────────────

export function calculateMuscleBalance(
  volumeHistory: VolumeEntry[],
): {
  balance: Record<string, number>; // percentage
  mostTrained: string;
  leastTrained: string;
  isBalanced: boolean;
} {
  const totalSets = volumeHistory.reduce((sum, v) => sum + v.total_sets, 0);
  const balance: Record<string, number> = {};

  for (const entry of volumeHistory) {
    const muscleNames = extractMuscleNames(entry.exercise_name);
    muscleNames.forEach(muscle => {
      balance[muscle] = (balance[muscle] || 0) + (entry.total_sets / volumeHistory.length);
    });
  }

  // Convert to percentages
  Object.keys(balance).forEach(muscle => {
    balance[muscle] = Math.round(balance[muscle] * 100);
  });

  const sorted = Object.entries(balance).sort((a, b) => b[1] - a[1]);
  const mostTrained = sorted[0]?.[0] || '';
  const leastTrained = sorted[sorted.length - 1]?.[0] || '';

  // Balanced if max - min < 15%
  const isBalanced = sorted.length > 1 && (sorted[0][1] - sorted[sorted.length - 1][1]) < 15;

  return { balance, mostTrained, leastTrained, isBalanced };
}

function extractMuscleNames(exerciseName: string): string[] {
  // Simple heuristic - extract muscle groups from exercise name
  const nameMap: Record<string, string[]> = {
    'bench': ['Chest', 'Triceps'],
    'squat': ['Quads', 'Glutes'],
    'deadlift': ['Back', 'Hamstrings'],
    'row': ['Back', 'Biceps'],
    'press': ['Shoulders', 'Triceps'],
    'curl': ['Biceps'],
    'leg': ['Quads', 'Hamstrings', 'Glutes'],
  };

  for (const [key, muscles] of Object.entries(nameMap)) {
    if (exerciseName.toLowerCase().includes(key)) {
      return muscles;
    }
  }

  return ['Core'];
}

// ─── TIER 3: Session Time Estimation ──────────────────────────────────────

export function estimateSessionDuration(
  exercises: Exercise[],
  profile: UserProfile,
): {
  estimatedMinutes: number;
  breakdown: { warmup: number; exercises: number; cooldown: number };
  exceeded: boolean;
  minutesOver: number;
} {
  const warmup = 7;
  const cooldown = 4;

  let exerciseTime = 0;
  for (const ex of exercises) {
    // Time per set = execution time + rest time
    const setsInExercise = ex.sets || 4;
    const repsPerSet = ((ex.minReps || 6) + (ex.maxReps || 10)) / 2;
    const secondsPerRep = 3; // Conservative estimate
    const executionTime = (setsInExercise * repsPerSet * secondsPerRep) / 60;

    const restBetweenSets = ex.rest || 2; // minutes
    const restTime = setsInExercise * restBetweenSets;

    const compoundMultiplier = ex.isCompound ? 1.2 : 1.0;
    exerciseTime += (executionTime + restTime) * compoundMultiplier;
  }

  const totalTime = warmup + exerciseTime + cooldown;
  const availableTime = profile.sessionLength || 60;

  return {
    estimatedMinutes: Math.round(totalTime),
    breakdown: {
      warmup,
      exercises: Math.round(exerciseTime),
      cooldown,
    },
    exceeded: totalTime > availableTime,
    minutesOver: Math.max(0, Math.round(totalTime - availableTime)),
  };
}

// ─── TIER 3: Injury Risk Pattern Detection ────────────────────────────────────

export interface InjuryRiskWarning {
  exercise: string;
  riskLevel: 'low' | 'medium' | 'high';
  patterns: string[];
  recommendation: string;
}

export function detectInjuryRisk(
  workoutHistory: any[],
  exercises: Exercise[],
): InjuryRiskWarning[] {
  const warnings: InjuryRiskWarning[] = [];

  // Pattern 1: Excessive volume on single muscle in short period
  const last7Days = workoutHistory.filter(w => {
    const daysSince = (Date.now() - new Date(w.completedAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 7;
  });

  const muscleFrequency: Record<string, { sets: number; days: Set<number> }> = {};
  last7Days.forEach(session => {
    const sessionDate = new Date(session.completedAt);
    const dayOfWeek = sessionDate.getDay();
    
    session.sets.forEach((set: any) => {
      const exercise = exercises.find(e => e.id === set.exerciseId || e.name === set.exerciseName);
      if (exercise) {
        exercise.primaryMuscles.forEach(muscle => {
          if (!muscleFrequency[muscle]) muscleFrequency[muscle] = { sets: 0, days: new Set() };
          muscleFrequency[muscle].sets += 1;
          muscleFrequency[muscle].days.add(dayOfWeek);
        });
      }
    });
  });

  // Check for high volume or high frequency patterns
  Object.entries(muscleFrequency).forEach(([muscle, data]) => {
    const patterns: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    // High frequency (same muscle >4 days per week)
    if (data.days.size > 4) {
      patterns.push(`Trained ${data.days.size}+ days per week`);
      riskLevel = 'high';
    }

    // Excessive volume (>15 sets for isolation, >20 for compound)
    const relatedExercises = exercises.filter(e => e.primaryMuscles.includes(muscle));
    const isMainlyIsolation = relatedExercises.every(e => e.primaryMuscles.length === 1);
    const volumeThreshold = isMainlyIsolation ? 15 : 20;
    
    if (data.sets > volumeThreshold) {
      patterns.push(`High volume: ${data.sets} sets (threshold: ${volumeThreshold})`);
      if (riskLevel === 'low') riskLevel = 'medium';
    }

    if (patterns.length > 0) {
      const exercises_affected = relatedExercises.map(e => e.name).slice(0, 3).join(', ');
      warnings.push({
        exercise: exercises_affected,
        riskLevel,
        patterns,
        recommendation: riskLevel === 'high' 
          ? `Reduce frequency to 3-4x/week per muscle group and consider a deload week`
          : `Monitor volume - consider decreasing sets or increasing recovery time between sessions`,
      });
    }
  });

  return warnings;
}

// ─── TIER 3: Exercise Difficulty Progression Stages ────────────────────────────

export interface ProgressionStage {
  stage: 'form_mastery' | 'volume_building' | 'intensity_focus' | 'power_development';
  description: string;
  repRange: [number, number];
  sets: number;
  minWeeksBefore?: number;
}

export function getExerciseProgressionStage(
  exercise: Exercise,
  history: WorkoutSet[] = [],
): ProgressionStage {
  if (history.length === 0) {
    return {
      stage: 'form_mastery',
      description: 'Focus on perfect form with moderate weight',
      repRange: [8, 12],
      sets: 3,
      minWeeksBefore: 0,
    };
  }

  // Analyze history to determine progression stage
  const sortedByDate = [...history].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const recentHistory = sortedByDate.slice(-20); // Last 20 sessions of this exercise
  const avgWeight = recentHistory.reduce((sum, s) => sum + s.weight, 0) / recentHistory.length;
  const maxWeight = Math.max(...recentHistory.map(s => s.weight));
  const avgReps = recentHistory.reduce((sum, s) => sum + s.reps, 0) / recentHistory.length;
  
  // Sessions completed
  const sessionsCompleted = history.length;

  // Stage progression logic
  if (sessionsCompleted < 4) {
    // New exercise - focus on form
    return {
      stage: 'form_mastery',
      description: 'Perfect your technique and find baseline strength',
      repRange: [8, 12],
      sets: 3,
      minWeeksBefore: 0,
    };
  }

  if (sessionsCompleted < 12 && avgReps >= 10) {
    // Building volume in rep range
    return {
      stage: 'volume_building',
      description: 'Add sets or reps to accumulate training volume',
      repRange: [6, 12],
      sets: 4,
      minWeeksBefore: 4,
    };
  }

  if (sessionsCompleted >= 12 && maxWeight > avgWeight * 1.05) {
    // Starting to push weight
    return {
      stage: 'intensity_focus',
      description: 'Focus on progressive loading with moderate volume',
      repRange: [4, 8],
      sets: 4,
      minWeeksBefore: 8,
    };
  }

  // Advanced stage - power and strength
  return {
    stage: 'power_development',
    description: 'Focus on speed and maximum strength development',
    repRange: [2, 6],
    sets: 5,
    minWeeksBefore: 16,
  };
}

// Get progression recommendations for an exercise
export function getExerciseProgressionPath(
  exercise: Exercise,
  history: WorkoutSet[] = [],
): { current: ProgressionStage; next?: ProgressionStage } {
  const current = getExerciseProgressionStage(exercise, history);
  const stageSequence: ProgressionStage['stage'][] = [
    'form_mastery',
    'volume_building',
    'intensity_focus',
    'power_development',
  ];

  const currentIndex = stageSequence.indexOf(current.stage);
  let next: ProgressionStage | undefined;

  if (currentIndex < stageSequence.length - 1) {
    const nextStage = stageSequence[currentIndex + 1];
    next = getExerciseProgressionStage(exercise, history);
    
    // Override stage for next
    if (nextStage === 'volume_building') {
      next = {
        stage: 'volume_building',
        description: 'Add sets or reps to accumulate training volume',
        repRange: [6, 12],
        sets: 5,
        minWeeksBefore: 4,
      };
    } else if (nextStage === 'intensity_focus') {
      next = {
        stage: 'intensity_focus',
        description: 'Focus on progressive loading with moderate volume',
        repRange: [4, 8],
        sets: 4,
        minWeeksBefore: 8,
      };
    } else if (nextStage === 'power_development') {
      next = {
        stage: 'power_development',
        description: 'Focus on speed and maximum strength development',
        repRange: [2, 6],
        sets: 5,
        minWeeksBefore: 16,
      };
    }
  }

  return { current, next };
}
