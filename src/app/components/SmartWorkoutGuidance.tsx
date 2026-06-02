/**
 * Active Workout Smart Guidance Component
 *
 * Props are aligned with what ActiveWorkout.tsx actually passes:
 *   currentExercise  — full exercise object
 *   suggestedReps    — [lo, hi] tuple from plan
 *   exerciseHistory  — sets logged this session for this exercise
 */

import React from 'react';
import { Card, CardContent } from './ui/card';
import { TrendingUp, Info } from 'lucide-react';
import type { Exercise } from '../../data/exercises';

interface SetLog {
  exerciseId: string;
  exerciseName: string;
  set: number;
  weight: number;
  reps: number;
  timestamp: string;
}

interface SmartWorkoutGuidanceProps {
  currentExercise: Exercise;
  suggestedReps: [number, number];
  exerciseHistory: SetLog[];
}

export function SmartWorkoutGuidance({
  currentExercise,
  suggestedReps,
  exerciseHistory,
}: SmartWorkoutGuidanceProps) {
  const [repLo, repHi] = suggestedReps;

  // Last session best set for context
  const lastWeight = exerciseHistory.length > 0
    ? Math.max(...exerciseHistory.map(s => s.weight))
    : null;
  const lastReps = exerciseHistory.length > 0
    ? exerciseHistory[exerciseHistory.length - 1].reps
    : null;

  // Inline rep-range feedback when user has logged at least one set
  const latestSet = exerciseHistory[exerciseHistory.length - 1];
  const repFeedback = latestSet ? (() => {
    const r = latestSet.reps;
    if (r > repHi) return { msg: `${r} reps — above target. Consider adding weight next set.`, color: 'text-blue-600 dark:text-blue-400' };
    if (r < repLo) return { msg: `${r} reps — below target. Reduce weight if needed.`, color: 'text-amber-600 dark:text-amber-400' };
    return { msg: `${r} reps — in target range ✓`, color: 'text-emerald-600 dark:text-emerald-400' };
  })() : null;

  if (!lastWeight && !repFeedback) return null;

  return (
    <div className="space-y-2">
      {/* Rep range target reminder */}
      <Card className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-start gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                Target: {repLo}–{repHi} reps
              </p>
              {repFeedback && (
                <p className={`text-xs mt-0.5 ${repFeedback.color}`}>{repFeedback.msg}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last set context */}
      {lastWeight !== null && lastWeight > 0 && exerciseHistory.length > 0 && (
        <Card className="border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                  This exercise so far: {exerciseHistory.length} set{exerciseHistory.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                  Top weight: {lastWeight} kg
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
