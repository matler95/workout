/**
 * Smart Insights Card Component
 * 
 * Displays AI-like intelligent suggestions:
 * - Deload recommendations
 * - Recovery readiness
 * - Progression hints
 * - Injury risk warnings
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  AlertTriangle, Zap, TrendingUp, RotateCcw, Activity,
  Brain, CheckCircle2, AlertCircle,
} from 'lucide-react';
import type {
  DeloadSuggestion,
  RecoveryScore,
  ProgressionSuggestion,
  FatigueWarning,
} from '../../utils/smartAlgorithms';

interface SmartInsightsProps {
  deloadSuggestion?: DeloadSuggestion;
  recoveryScore?: RecoveryScore;
  progressionSuggestion?: ProgressionSuggestion;
  fatigueWarnings?: FatigueWarning[];
  onViewProgress?: () => void;
  onGeneratePlan?: () => void;
}

export function SmartInsights({
  deloadSuggestion,
  recoveryScore,
  progressionSuggestion,
  fatigueWarnings = [],
  onViewProgress,
  onGeneratePlan,
}: SmartInsightsProps) {
  // Prioritize which insight to show
  const primaryInsight = deloadSuggestion?.suggest
    ? 'deload'
    : progressionSuggestion?.strategy === 'add_weight'
    ? 'progression'
    : recoveryScore?.score !== undefined && recoveryScore.score < 50
    ? 'recovery'
    : fatigueWarnings.length > 0
    ? 'fatigue'
    : null;

  if (!primaryInsight) {
    return null;
  }

  // ─── Deload Card ──────────────────────────────────────────────────────────
  if (primaryInsight === 'deload' && deloadSuggestion?.suggest) {
    const severityColor = deloadSuggestion.severity === 'high'
      ? 'from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30'
      : 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30';

    const severityBg = deloadSuggestion.severity === 'high'
      ? 'bg-red-500'
      : 'bg-amber-500';

    const reasonText = {
      excessive_volume: 'You\'ve accumulated significant volume over the past weeks',
      declining_strength: 'Your strength has been declining — time to recover',
      overuse: 'Same muscles trained 5+ consecutive days — overuse risk',
      high_fatigue: 'Sleep + stress combined suggest recovery is needed',
    }[deloadSuggestion.reason || 'excessive_volume'];

    return (
      <Card className={`border-0 bg-gradient-to-r ${severityColor} shadow-md`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <div className={`w-10 h-10 ${severityBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <RotateCcw className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm mb-1">💪 Time for a Deload Week</p>
              <p className="text-xs text-muted-foreground mb-3">{reasonText}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 rounded-lg"
                  onClick={onGeneratePlan}
                >
                  Generate Deload Plan
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-8 rounded-lg"
                  onClick={onViewProgress}
                >
                  View Details
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Progression Card ─────────────────────────────────────────────────────
  if (primaryInsight === 'progression' && progressionSuggestion) {
    const strategyText = {
      add_weight: `Time to increase weight by ${progressionSuggestion.percent}%`,
      add_sets: `Add ${progressionSuggestion.sets} set to break through plateau`,
      lower_reps: 'You\'re ready for lower rep ranges — test your strength',
      maintain: 'Keep your current weight and volume',
      deload: 'Deload suggested before continuing progression',
    }[progressionSuggestion.strategy];

    const strategyIcon = {
      add_weight: <TrendingUp className="w-5 h-5" />,
      add_sets: <Plus className="w-5 h-5" />,
      lower_reps: <Zap className="w-5 h-5" />,
      maintain: <CheckCircle2 className="w-5 h-5" />,
      deload: <RotateCcw className="w-5 h-5" />,
    }[progressionSuggestion.strategy];

    return (
      <Card className="border-0 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 shadow-md">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0 text-white">
              {strategyIcon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm mb-1">📈 Ready to Progress</p>
              <p className="text-xs text-muted-foreground mb-3">{strategyText}</p>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 rounded-lg"
                onClick={onViewProgress}
              >
                View Exercise History
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Recovery Card ────────────────────────────────────────────────────────
  if (primaryInsight === 'recovery' && recoveryScore && recoveryScore.score < 50) {
    return (
      <Card className="border-0 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 shadow-md">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0 text-white">
              <Activity className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm mb-1">💤 Recovery Recommended</p>
              <p className="text-xs text-muted-foreground mb-2">
                {recoveryScore.recommendation}
              </p>
              <div className="flex gap-1">
                <Badge variant="secondary" className="text-xs">
                  Sleep: {Math.round(recoveryScore.factors.sleep)}/40
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Stress: {Math.round(recoveryScore.factors.stress)}/30
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Fatigue Warnings Card ───────────────────────────────────────────────
  if (primaryInsight === 'fatigue' && fatigueWarnings.length > 0) {
    const warning = fatigueWarnings[0];
    const warningColor = warning.severity === 'high'
      ? 'from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30'
      : 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30';

    return (
      <Card className={`border-0 bg-gradient-to-r ${warningColor} shadow-md`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0 text-white">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm mb-1">⚠️ Fatigue Alert</p>
              <p className="text-xs text-muted-foreground">{warning.message}</p>
              {fatigueWarnings.length > 1 && (
                <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-current/10">
                  +{fatigueWarnings.length - 1} more warning{fatigueWarnings.length > 2 ? 's' : ''}
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
