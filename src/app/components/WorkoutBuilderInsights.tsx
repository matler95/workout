/**
 * Workout Builder Smart Features
 *
 * Shows:
 * - Session time estimation
 * - Weekly volume forecast
 * - Fatigue warnings
 */

import React from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { AlertTriangle, Clock, BarChart3 } from 'lucide-react';

interface SessionTimeEstimate {
  estimatedMinutes: number;
  breakdown: { warmup: number; exercises: number; cooldown: number };
  exceeded: boolean;
  minutesOver: number;
}

interface VolumeBalance {
  balance: Record<string, number>;
  totalSets: number;
  isOptimal: boolean;
}

interface WorkoutBuilderInsightsProps {
  sessionTimeEstimate?: SessionTimeEstimate;
  volumeBalance?: VolumeBalance;
  availableSessionTime?: number;
  exerciseCount?: number;
  fatigueWarnings?: Array<{ exerciseName: string; message: string; severity: 'low' | 'medium' | 'high' }>;
}

export function WorkoutBuilderInsights({
  sessionTimeEstimate,
  volumeBalance,
  availableSessionTime = 60,
  exerciseCount = 0,
  fatigueWarnings = [],
}: WorkoutBuilderInsightsProps) {
  return (
    <div className="space-y-2">
      {/* Session Time Estimate */}
      {sessionTimeEstimate && (
        <Card
          className={`border-0 shadow-md ${
            sessionTimeEstimate.exceeded
              ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800'
              : 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800'
          }`}
        >
          <CardContent className="pt-3 pb-3">
            <div className="flex items-start gap-2">
              <Clock className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                sessionTimeEstimate.exceeded ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold mb-1 ${
                  sessionTimeEstimate.exceeded
                    ? 'text-red-900 dark:text-red-100'
                    : 'text-blue-900 dark:text-blue-100'
                }`}>
                  ⏱️ {sessionTimeEstimate.estimatedMinutes} min
                </p>
                <p className={`text-xs ${
                  sessionTimeEstimate.exceeded
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-blue-700 dark:text-blue-300'
                }`}>
                  Warmup {sessionTimeEstimate.breakdown.warmup}m
                  {sessionTimeEstimate.breakdown.exercises > 0 && ` + Exercises ${sessionTimeEstimate.breakdown.exercises}m`}
                  + Cooldown {sessionTimeEstimate.breakdown.cooldown}m
                </p>
                {sessionTimeEstimate.exceeded && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">
                    ⚠️ {sessionTimeEstimate.minutesOver} min over your {availableSessionTime}m limit
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Volume Balance */}
      {volumeBalance && Object.keys(volumeBalance.balance).length > 0 && (
        <Card className="border-0 shadow-md bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-start gap-2">
              <BarChart3 className="w-4 h-4 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-purple-900 dark:text-purple-100 mb-2">
                  📊 Weekly Volume Forecast
                </p>
                <div className="space-y-1">
                  {Object.entries(volumeBalance.balance)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([muscle, sets]) => (
                      <div key={muscle} className="flex justify-between text-xs">
                        <span className="text-purple-700 dark:text-purple-300">{muscle}</span>
                        <span className="font-semibold text-purple-900 dark:text-purple-100">{sets} sets</span>
                      </div>
                    ))}
                </div>
                {Object.keys(volumeBalance.balance).length > 3 && (
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                    + {Object.keys(volumeBalance.balance).length - 3} more muscle groups
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Exercise Count Hint */}
      {exerciseCount > 0 && exerciseCount < 3 && (
        <Card className="border-0 shadow-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              💡 Consider adding 1-2 more exercises for complete muscle coverage
            </p>
          </CardContent>
        </Card>
      )}

      {exerciseCount > 8 && (
        <Card className="border-0 shadow-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              💡 {exerciseCount} exercises might make this session long. Consider reducing.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Fatigue Warnings */}
      {fatigueWarnings.length > 0 && (
        <div className="space-y-2">
          {fatigueWarnings.slice(0, 2).map((warning, i) => (
            <Card
              key={i}
              className={`border-0 shadow-md ${
                warning.severity === 'high'
                  ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800'
                  : 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800'
              }`}
            >
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      warning.severity === 'high'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold mb-1 ${
                      warning.severity === 'high'
                        ? 'text-red-900 dark:text-red-100'
                        : 'text-amber-900 dark:text-amber-100'
                    }`}>
                      {warning.exerciseName}
                    </p>
                    <p className={`text-xs ${
                      warning.severity === 'high'
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}>
                      {warning.message}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {fatigueWarnings.length > 2 && (
            <p className="text-xs text-muted-foreground text-center">
              + {fatigueWarnings.length - 2} more warning{fatigueWarnings.length > 3 ? 's' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
