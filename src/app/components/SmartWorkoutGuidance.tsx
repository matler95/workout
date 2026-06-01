/**
 * Active Workout Smart Guidance Component
 *
 * Shows:
 * - Adaptive rep range recommendations
 * - Smart rest timer
 * - Exercise history for progression context
 */

import React from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { TrendingUp, Clock, Info, AlertCircle } from 'lucide-react';
import type { RepRangeRecommendation } from '../../utils/smartAlgorithms';

interface SmartWorkoutGuidanceProps {
  exerciseName: string;
  repRangeRecommendation?: RepRangeRecommendation;
  recommendedRest?: number; // in seconds
  currentSet?: number;
  totalSets?: number;
  lastSessionSets?: Array<{ weight: number; reps: number }>;
}

export function SmartWorkoutGuidance({
  exerciseName,
  repRangeRecommendation,
  recommendedRest,
  currentSet,
  totalSets,
  lastSessionSets = [],
}: SmartWorkoutGuidanceProps) {
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes === 0) return `${secs}s`;
    return `${minutes}m ${secs}s`;
  };

  const lastSessionAvg = lastSessionSets.length > 0
    ? (lastSessionSets.reduce((sum, s) => sum + s.weight, 0) / lastSessionSets.length).toFixed(1)
    : null;

  return (
    <div className="space-y-2">
      {/* Rep Range Recommendation */}
      {repRangeRecommendation && (
        <Card className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  Rep Range: {repRangeRecommendation.min}-{repRangeRecommendation.max}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  {repRangeRecommendation.reason.replace(/_/g, ' ')}
                </p>
              </div>
              <Badge variant="outline" className="flex-shrink-0 text-xs h-6">
                {Math.round(repRangeRecommendation.confidence * 100)}%
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Smart Rest Timer */}
      {recommendedRest && (
        <Card className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-100 mb-1">
                  Rest {formatTime(recommendedRest)}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Based on your exercise and rep range
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Exercise History Context */}
      {lastSessionAvg && (
        <Card className="border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 mb-1">
                  Last session avg: {lastSessionAvg}kg
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  {lastSessionSets.length} sets logged
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Set progress */}
      {currentSet !== undefined && totalSets && (
        <div className="text-xs text-muted-foreground text-center py-1">
          Set {currentSet} of {totalSets}
        </div>
      )}
    </div>
  );
}
