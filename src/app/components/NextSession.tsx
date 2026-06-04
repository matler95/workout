/**
 * NextSession — "What to do next session" section
 *
 * Sits at the top of the Strength tab in Progress.
 * Shows per-exercise action cards: compact by default, tap to expand reasoning.
 * Hides insufficient_data entries entirely.
 * This is where algorithm output lives — not mid-workout.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { TrendingUp, TrendingDown, Minus, ArrowUp, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import {
  computeAllSuggestions,
  classifyExercise,
  getRepTarget,
  type ProgressionSuggestion,
  type WorkoutLog,
} from '../../../utils/progressiveOverload';
import { workoutApi } from '../../utils/api';

interface NextSessionProps {
  history?: WorkoutLog[];
}

function ActionChip({ action }: { action: ProgressionSuggestion['action'] }) {
  const config = {
    increase_weight: {
      icon: <ArrowUp className="w-3 h-3" />,
      label: 'Increase weight',
      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    },
    increase_reps: {
      icon: <TrendingUp className="w-3 h-3" />,
      label: 'Increase reps',
      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    },
    deload: {
      icon: <AlertTriangle className="w-3 h-3" />,
      label: 'Deload',
      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    },
    maintain: {
      icon: <Minus className="w-3 h-3" />,
      label: 'Keep weight',
      cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    },
    insufficient_data: {
      icon: null,
      label: '',
      cls: '',
    },
  }[action];

  if (!config.label) return null;

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${config.cls}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

function ExerciseNextCard({
  exerciseKey,
  suggestion,
}: {
  exerciseKey: string;
  suggestion: ProgressionSuggestion;
}) {
  const [expanded, setExpanded] = useState(false);
  const tier = classifyExercise(exerciseKey);
  const [repLo, repHi] = getRepTarget(tier);

  const e1rmTrendIcon =
    suggestion.e1RMTrend === 'up'   ? <TrendingUp className="w-3.5 h-3.5 text-green-500" /> :
    suggestion.e1RMTrend === 'down' ? <TrendingDown className="w-3.5 h-3.5 text-red-500" /> :
    null;

  return (
    <Card
      className={`cursor-pointer transition-all ${
        expanded ? 'border-primary/50' : 'hover:border-border'
      }`}
      onClick={() => setExpanded(e => !e)}
    >
      <CardContent className="pt-3 pb-3">
        {/* Collapsed: name + chip + weight change */}
        <div className="flex items-center gap-2 justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{exerciseKey}</span>
              <ActionChip action={suggestion.action} />
            </div>
            {/* Weight target — the one number that matters */}
            {suggestion.action === 'increase_weight' && (
              <p className="text-sm text-green-700 dark:text-green-300 font-semibold mt-0.5">
                {suggestion.currentWeight} → {suggestion.suggestedWeight} kg
              </p>
            )}
            {suggestion.action === 'deload' && (
              <p className="text-sm text-amber-700 dark:text-amber-300 font-semibold mt-0.5">
                {suggestion.currentWeight} → {suggestion.suggestedWeight} kg
              </p>
            )}
            {suggestion.action === 'maintain' && suggestion.currentWeight > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">
                Stay at {suggestion.currentWeight} kg
              </p>
            )}
            {suggestion.action === 'increase_reps' && (
              <p className="text-sm text-green-700 dark:text-green-300 font-semibold mt-0.5">
                Target {suggestion.suggestedReps?.[0]}–{suggestion.suggestedReps?.[1]} reps
              </p>
            )}
          </div>

          {/* e1RM + trend + expand toggle */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {suggestion.currentE1RM > 0 && (
              <div className="text-right">
                <div className="flex items-center gap-1 justify-end">
                  {e1rmTrendIcon}
                  <span className="text-xs text-muted-foreground">e1RM</span>
                </div>
                <span className="font-bold text-sm">
                  {Math.round(suggestion.currentE1RM)}
                  <span className="text-xs text-muted-foreground ml-0.5">kg</span>
                </span>
              </div>
            )}
            {expanded
              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground" />
            }
          </div>
        </div>

        {/* Expanded: reasoning + tip */}
        {expanded && (
          <div
            className="mt-3 pt-3 border-t space-y-2"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm text-muted-foreground leading-relaxed">
              {suggestion.reasoning}
            </p>
            {suggestion.tip && (
              <p className="text-xs text-muted-foreground italic">{suggestion.tip}</p>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Rep target:</span>
              <span className="font-medium text-foreground">{repLo}–{repHi}</span>
              <span className={`font-medium ${
                suggestion.confidence === 'high'   ? 'text-green-600 dark:text-green-400' :
                suggestion.confidence === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                'text-muted-foreground'
              }`}>· {suggestion.confidence} confidence</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function NextSession({ history: externalHistory }: NextSessionProps = {}) {
  const [suggestions, setSuggestions] = useState<Record<string, ProgressionSuggestion>>({});
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    if (externalHistory) {
      setSuggestions(computeAllSuggestions(externalHistory));
      setLoading(false);
    } else {
      workoutApi.getHistory(100)
        .then(h => setSuggestions(computeAllSuggestions(h as WorkoutLog[])))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [externalHistory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  // Filter out insufficient_data; sort by action priority
  const sortOrder: Record<ProgressionSuggestion['action'], number> = {
    increase_weight: 0, increase_reps: 0,
    deload: 1, maintain: 2, insufficient_data: 99,
  };

  const entries = Object.entries(suggestions)
    .filter(([, s]) => s.action !== 'insufficient_data')
    .sort(([, a], [, b]) => sortOrder[a.action] - sortOrder[b.action]);

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Complete more workouts to see personalized recommendations here.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Summary counts
  const upCount   = entries.filter(([, s]) => s.action === 'increase_weight' || s.action === 'increase_reps').length;
  const downCount = entries.filter(([, s]) => s.action === 'deload').length;

  return (
    <div className="space-y-2">
      {/* One-line summary */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground px-1">
        {upCount > 0 && (
          <span className="text-green-600 dark:text-green-400 font-medium">
            ↑ {upCount} ready to progress
          </span>
        )}
        {downCount > 0 && (
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            ↓ {downCount} need deload
          </span>
        )}
        {upCount === 0 && downCount === 0 && (
          <span>All exercises on track</span>
        )}
        <span className="text-muted-foreground/50">· tap any card for details</span>
      </div>

      {entries.map(([key, suggestion]) => (
        <ExerciseNextCard key={key} exerciseKey={key} suggestion={suggestion} />
      ))}
    </div>
  );
}
