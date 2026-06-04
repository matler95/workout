/**
 * Smart Insights Card
 *
 * Rules:
 * - Requires ≥ 4 workout sessions before showing anything (no false positives for new users)
 * - Shows maximum 1 insight at a time, in priority order:
 *     1. Deload (highest — recovery risk)
 *     2. Recovery score < 40 (poor)
 *     3. Fatigue warning (muscle overuse)
 * - Progression suggestions moved to Progress tab (Strength tab "Next Session" section)
 * - No InjuryRiskAlerts — folded into deload signal if severe enough
 */

import React from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { RotateCcw, Activity, AlertCircle } from 'lucide-react';
import type { DeloadSuggestion, RecoveryScore, FatigueWarning } from '../../utils/smartAlgorithms';

interface SmartInsightsProps {
  sessionCount: number;           // total sessions — used for minimum threshold
  deloadSuggestion?: DeloadSuggestion;
  recoveryScore?: RecoveryScore;
  fatigueWarnings?: FatigueWarning[];
  onViewProgress?: () => void;
  onGeneratePlan?: () => void;
}

const MIN_SESSIONS_FOR_INSIGHTS = 4;

export function SmartInsights({
  sessionCount,
  deloadSuggestion,
  recoveryScore,
  fatigueWarnings = [],
  onViewProgress,
  onGeneratePlan,
}: SmartInsightsProps) {
  // Hard gate — no insights until enough data exists
  if (sessionCount < MIN_SESSIONS_FOR_INSIGHTS) return null;

  // ── Priority 1: Deload ────────────────────────────────────────────────────
  if (deloadSuggestion?.suggest) {
    const isHigh = deloadSuggestion.severity === 'high';

    const reasonText: Record<string, string> = {
      excessive_volume:    'You\'ve accumulated a lot of volume recently. A lighter week will help you recover and come back stronger.',
      declining_strength:  'Your strength has been declining across recent sessions — a sign your body needs recovery time.',
      overuse:             'The same muscles have been trained frequently without enough rest between sessions.',
      high_fatigue:        'Your sleep and stress levels suggest your recovery is currently compromised.',
    };

    const text = reasonText[deloadSuggestion.reason ?? 'excessive_volume'];

    return (
      <Card className={`border-0 shadow-md ${
        isHigh
          ? 'bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30'
          : 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30'
      }`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isHigh ? 'bg-red-500' : 'bg-amber-500'
            }`}>
              <RotateCcw className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm mb-1">Time for a deload week</p>
              <p className="text-xs text-muted-foreground mb-3">{text}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 rounded-lg"
                  onClick={onGeneratePlan}
                >
                  Rebuild plan
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-8 rounded-lg"
                  onClick={onViewProgress}
                >
                  View progress
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Priority 2: Poor recovery ─────────────────────────────────────────────
  if (recoveryScore && recoveryScore.score < 40) {
    return (
      <Card className="border-0 shadow-md bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm mb-1">Recovery looks low today</p>
              <p className="text-xs text-muted-foreground">
                {recoveryScore.recommendation}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Priority 3: Fatigue warning (high severity only) ──────────────────────
  const highFatigue = fatigueWarnings.filter(w => w.severity === 'high');
  if (highFatigue.length > 0) {
    const warning = highFatigue[0];
    return (
      <Card className="border-0 shadow-md bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm mb-1">Muscle fatigue detected</p>
              <p className="text-xs text-muted-foreground">{warning.message}</p>
              {highFatigue.length > 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  +{highFatigue.length - 1} other area{highFatigue.length > 2 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
