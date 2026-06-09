/**
 * ProgressionInsights — strength progression cards for the Progress tab.
 *
 * FIX #16: The original code fired a separate workoutApi.getExerciseHistory()
 * Supabase query every time the user expanded a card. With 20+ exercises this
 * meant up to 20 sequential DB round-trips. Now all exercise histories needed
 * for charts are pre-fetched from the already-loaded workoutHistory prop in
 * a single pass (no extra DB queries), and the per-card expand just reads from
 * the in-memory map.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '../components/ui/card';
import {
  computeAllSuggestions,
  classifyExercise,
  getRepTarget,
  type ProgressionSuggestion,
  type WorkoutLog,
} from '../../../utils/progressiveOverload';
import { workoutApi } from '../../utils/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, ArrowUp, AlertTriangle, Info } from 'lucide-react';
import { format, parseISO } from 'date-fns';

type FilterKey = 'all' | 'increase' | 'maintain' | 'deload';

// ─── Chart data ───────────────────────────────────────────────────────────────

interface ChartPoint { date: string; e1rm: number; weight: number }

/**
 * FIX #16: Build the chart-data map from already-loaded workout history.
 * No extra DB queries — we iterate the history once and collect per-exercise
 * best-set e1RM data. This replaces the per-card workoutApi.getExerciseHistory()
 * call that previously fired on every card expand.
 */
function buildChartMap(history: WorkoutLog[]): Record<string, ChartPoint[]> {
  const map: Record<string, ChartPoint[]> = {};

  // History is newest-first; reverse to plot chronologically
  for (const log of [...history].reverse()) {
    const date = format(parseISO(log.completedAt), 'MMM d');

    // Group by stable key within this session
    const byKey: Record<string, { weight: number; reps: number; e1rm: number }> = {};
    for (const s of (log.sets || [])) {
      const key = s.exerciseId || s.exerciseName;
      const e1rm = s.weight > 0 && s.reps > 0
        ? s.weight * (1 + s.reps / 30)
        : 0;
      const existing = byKey[key];
      if (!existing || e1rm > existing.e1rm) {
        byKey[key] = { weight: s.weight, reps: s.reps, e1rm };
      }
    }

    for (const [key, { weight, e1rm }] of Object.entries(byKey)) {
      if (!map[key]) map[key] = [];
      map[key].push({ date, e1rm: Math.round(e1rm), weight });
    }
  }

  return map;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ActionIcon({ action }: { action: ProgressionSuggestion['action'] }) {
  switch (action) {
    case 'increase_weight': return <ArrowUp      className="w-4 h-4 text-green-600 dark:text-green-400" />;
    case 'increase_reps':   return <TrendingUp   className="w-4 h-4 text-green-600 dark:text-green-400" />;
    case 'deload':          return <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />;
    case 'maintain':        return <Minus        className="w-4 h-4 text-blue-500 dark:text-blue-400" />;
    default:                return <Info         className="w-4 h-4 text-muted-foreground" />;
  }
}

function ActionBadge({ action }: { action: ProgressionSuggestion['action'] }) {
  const map: Record<ProgressionSuggestion['action'], { label: string; cls: string }> = {
    increase_weight:   { label: 'Increase weight', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
    increase_reps:     { label: 'Increase reps',   cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
    deload:            { label: 'Deload',           cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
    maintain:          { label: 'Keep weight',      cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
    insufficient_data: { label: 'Need more data',   cls: 'bg-muted text-muted-foreground' },
  };
  const { label, cls } = map[action];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

interface ExerciseCardProps {
  exerciseKey: string;
  suggestion: ProgressionSuggestion;
  expanded: boolean;
  onClick: () => void;
  chartData: ChartPoint[];   // FIX #16: passed in, no per-card fetch
}

function ExerciseCard({ exerciseKey, suggestion, expanded, onClick, chartData }: ExerciseCardProps) {
  const tier = classifyExercise(exerciseKey);
  const [repLo, repHi] = getRepTarget(tier);
  const tierLabel: Record<string, string> = {
    heavy_barbell: 'Barbell', compound_db_machine: 'Compound',
    isolation: 'Isolation', bodyweight: 'Bodyweight',
  };

  const trendColor =
    suggestion.e1RMTrend === 'up'   ? 'text-green-600 dark:text-green-400' :
    suggestion.e1RMTrend === 'down' ? 'text-red-500 dark:text-red-400'     : 'text-muted-foreground';
  const TrendIcon =
    suggestion.e1RMTrend === 'up'   ? TrendingUp   :
    suggestion.e1RMTrend === 'down' ? TrendingDown : Minus;

  return (
    <Card
      className={`cursor-pointer transition-colors ${expanded ? 'border-primary' : 'hover:border-border'}`}
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ActionIcon action={suggestion.action} />
              <span className="font-medium text-sm truncate">{exerciseKey}</span>
              <span className="text-xs text-muted-foreground">{tierLabel[tier]}</span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <ActionBadge action={suggestion.action} />
              {(suggestion.action === 'increase_weight' || suggestion.action === 'deload') && (
                <span className={`text-sm font-semibold ${suggestion.action === 'deload' ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300'}`}>
                  {suggestion.currentWeight} → {suggestion.suggestedWeight} kg
                </span>
              )}
              {suggestion.action === 'maintain' && suggestion.currentWeight > 0 && (
                <span className="text-sm text-muted-foreground">{suggestion.currentWeight} kg</span>
              )}
            </div>
          </div>

          {suggestion.currentE1RM > 0 && (
            <div className="text-right flex-shrink-0">
              <div className="flex items-center gap-1 justify-end">
                <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
                <span className="text-xs text-muted-foreground">e1RM</span>
              </div>
              <span className="font-bold text-base">
                {Math.round(suggestion.currentE1RM)}
                <span className="text-xs text-muted-foreground ml-0.5">kg</span>
              </span>
              {suggestion.previousE1RM !== null && (
                <div className={`text-xs ${trendColor}`}>
                  {suggestion.currentE1RM >= suggestion.previousE1RM ? '+' : ''}
                  {Math.round((suggestion.currentE1RM - suggestion.previousE1RM) * 10) / 10} kg
                </div>
              )}
            </div>
          )}
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-4 space-y-3 border-t pt-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-muted-foreground leading-relaxed">{suggestion.reasoning}</p>
            {suggestion.tip && <p className="text-xs text-muted-foreground italic">{suggestion.tip}</p>}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Target:</span>
              <span className="font-medium text-foreground">{repLo}–{repHi} reps</span>
              <span className="text-muted-foreground">({tierLabel[tier]})</span>
            </div>

            {/* FIX #16: chartData is already in-memory, no DB query needed */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Estimated 1RM history</p>
              {chartData.length >= 2 ? (
                <>
                  <ResponsiveContainer width="100%" height={130}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" style={{ stroke: 'var(--border)' }} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="kg" domain={['auto', 'auto']} width={40} />
                      <Tooltip formatter={(v: any, name: string) => [
                        `${Math.round(v)} kg`,
                        name === 'e1rm' ? 'Est. 1RM' : 'Top set',
                      ]} />
                      <Line type="monotone" dataKey="e1rm"   stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="e1rm" />
                      <Line type="monotone" dataKey="weight" stroke="#94a3b8" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" name="weight" />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-muted-foreground text-center mt-1">— e1RM &nbsp;&nbsp; - - top set weight</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground py-4 text-center">Need at least 2 sessions for a chart</p>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Confidence:</span>
              <span className={`font-medium ${
                suggestion.confidence === 'high'   ? 'text-green-600 dark:text-green-400' :
                suggestion.confidence === 'medium' ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'
              }`}>{suggestion.confidence}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProgressionInsightsProps {
  history?: WorkoutLog[];
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ProgressionInsights({ history: externalHistory }: ProgressionInsightsProps = {}) {
  const [suggestions, setSuggestions] = useState<Record<string, ProgressionSuggestion>>({});
  const [loading, setLoading]         = useState(true);
  const [history, setHistory]         = useState<WorkoutLog[]>(externalHistory || []);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [filter, setFilter]           = useState<FilterKey>('all');

  useEffect(() => {
    if (externalHistory) {
      setHistory(externalHistory);
      setSuggestions(computeAllSuggestions(externalHistory));
      setLoading(false);
    } else {
      loadData();
    }
  }, [externalHistory]);

  const loadData = async () => {
    try {
      const h = await workoutApi.getHistory(100);
      setHistory(h as WorkoutLog[]);
      setSuggestions(computeAllSuggestions(h as WorkoutLog[]));
    } catch (e) {
      console.error('Failed to load progression data', e);
    } finally {
      setLoading(false);
    }
  };

  // FIX #16: Build chart data once from the already-loaded history.
  // No per-card DB queries — all data is derived from what we already have.
  const chartMap = useMemo(() => buildChartMap(history), [history]);

  const allEntries = Object.entries(suggestions).filter(([, s]) => s.action !== 'insufficient_data');

  const filtered = allEntries.filter(([, s]) => {
    if (filter === 'increase') return s.action === 'increase_weight' || s.action === 'increase_reps';
    if (filter === 'maintain') return s.action === 'maintain';
    if (filter === 'deload')   return s.action === 'deload';
    return true;
  });

  const sortOrder: Record<ProgressionSuggestion['action'], number> = {
    increase_weight: 0, increase_reps: 0, maintain: 1, deload: 2, insufficient_data: 3,
  };
  filtered.sort(([, a], [, b]) => sortOrder[a.action] - sortOrder[b.action]);

  const counts = {
    increase: allEntries.filter(([, s]) => s.action === 'increase_weight' || s.action === 'increase_reps').length,
    maintain: allEntries.filter(([, s]) => s.action === 'maintain').length,
    deload:   allEntries.filter(([, s]) => s.action === 'deload').length,
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  if (allEntries.length === 0) return (
    <Card>
      <CardContent className="py-12 text-center">
        <TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
        <p className="font-medium text-muted-foreground">No progression data yet</p>
        <p className="text-sm text-muted-foreground mt-1">Complete workouts to see weight suggestions here</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Summary filter buttons */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { key: 'increase' as FilterKey, count: counts.increase, label: 'Ready to progress', bg: 'bg-green-50 border-green-100 dark:bg-green-950/30 dark:border-green-800/30', activeBg: 'bg-green-100 border-green-300 dark:bg-green-900/50 dark:border-green-700/50', text: 'text-green-700 dark:text-green-300' },
          { key: 'maintain' as FilterKey, count: counts.maintain, label: 'Keep weight',        bg: 'bg-blue-50 border-blue-100 dark:bg-blue-950/30 dark:border-blue-800/30',   activeBg: 'bg-blue-100 border-blue-300 dark:bg-blue-900/50 dark:border-blue-700/50',   text: 'text-blue-700 dark:text-blue-300' },
          { key: 'deload'   as FilterKey, count: counts.deload,   label: 'Deload',             bg: 'bg-amber-50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-800/30', activeBg: 'bg-amber-100 border-amber-300 dark:bg-amber-900/50 dark:border-amber-700/50', text: 'text-amber-700 dark:text-amber-300' },
        ] as const).map(({ key, count, label, bg, activeBg, text }) => (
          <button
            key={key}
            onClick={() => setFilter(filter === key ? 'all' : key)}
            className={`rounded-lg p-3 text-center transition-colors border ${filter === key ? activeBg : bg}`}
          >
            <div className={`text-2xl font-bold ${text}`}>{count}</div>
            <div className={`text-xs ${text}`}>{label}</div>
          </button>
        ))}
      </div>

      {/* How it works */}
      <div className="bg-muted/50 border border-border rounded-lg p-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">How this works:</strong> Uses your rep history and
          the Epley formula (weight × (1 + reps/30)) to estimate your 1-rep max over time.
          Barbell movements get flat +2.5 kg; isolation and machines use 5% of current weight.
          Suggestions are suppressed when RPE was ≥9 or strength is declining.
        </p>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No exercises match this filter
          </CardContent>
        </Card>
      ) : (
        filtered.map(([key, suggestion]) => (
          <ExerciseCard
            key={key}
            exerciseKey={key}
            suggestion={suggestion}
            expanded={expandedKey === key}
            onClick={() => setExpandedKey(expandedKey === key ? null : key)}
            chartData={chartMap[key] || []}
          />
        ))
      )}
    </div>
  );
}
