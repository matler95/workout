import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { apiCall } from '../../utils/supabase-client';
import {
  computeAllSuggestions,
  computeSuggestion,
  classifyExercise,
  getRepTarget,
  epley,
  type ProgressionSuggestion,
  type WorkoutLog,
} from '../../utils/progressiveOverload';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, ArrowUp, AlertTriangle, Info } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface ExerciseCardProps {
  exerciseName: string;
  suggestion: ProgressionSuggestion;
  e1RMHistory: { date: string; e1rm: number; weight: number; reps: number }[];
  onClick: () => void;
  expanded: boolean;
}

function ActionIcon({ action }: { action: ProgressionSuggestion['action'] }) {
  switch (action) {
    case 'increase_weight': return <ArrowUp className="w-4 h-4 text-green-600" />;
    case 'increase_reps':   return <TrendingUp className="w-4 h-4 text-green-600" />;
    case 'deload':          return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    case 'maintain':        return <Minus className="w-4 h-4 text-blue-500" />;
    default:                return <Info className="w-4 h-4 text-gray-400" />;
  }
}

function ActionBadge({ action }: { action: ProgressionSuggestion['action'] }) {
  const map = {
    increase_weight: { label: 'Increase weight', cls: 'bg-green-100 text-green-800' },
    increase_reps:   { label: 'Increase reps',   cls: 'bg-green-100 text-green-800' },
    deload:          { label: 'Deload',           cls: 'bg-amber-100 text-amber-800' },
    maintain:        { label: 'Keep weight',      cls: 'bg-blue-100 text-blue-800' },
    insufficient_data: { label: 'Need more data', cls: 'bg-gray-100 text-gray-600' },
  }[action];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map.cls}`}>
      {map.label}
    </span>
  );
}

function ExerciseCard({ exerciseName, suggestion, e1RMHistory, onClick, expanded }: ExerciseCardProps) {
  const tier = classifyExercise(exerciseName);
  const [repLo, repHi] = getRepTarget(tier);
  const tierLabel = {
    heavy_barbell: 'Barbell',
    compound_db_machine: 'Compound',
    isolation: 'Isolation',
    bodyweight: 'Bodyweight',
  }[tier];

  const trendColor =
    suggestion.e1RMTrend === 'up' ? 'text-green-600' :
    suggestion.e1RMTrend === 'down' ? 'text-red-500' : 'text-gray-400';

  const TrendIcon =
    suggestion.e1RMTrend === 'up' ? TrendingUp :
    suggestion.e1RMTrend === 'down' ? TrendingDown : Minus;

  return (
    <Card
      className={`cursor-pointer transition-colors ${expanded ? 'border-indigo-300' : 'hover:border-gray-300'}`}
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ActionIcon action={suggestion.action} />
              <span className="font-medium text-sm truncate">{exerciseName}</span>
              <span className="text-xs text-gray-400">{tierLabel}</span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <ActionBadge action={suggestion.action} />
              {suggestion.action === 'increase_weight' && (
                <span className="text-sm font-semibold text-green-700">
                  {suggestion.currentWeight} → {suggestion.suggestedWeight} kg
                </span>
              )}
              {suggestion.action === 'deload' && (
                <span className="text-sm font-semibold text-amber-700">
                  {suggestion.currentWeight} → {suggestion.suggestedWeight} kg
                </span>
              )}
              {suggestion.action === 'maintain' && suggestion.currentWeight > 0 && (
                <span className="text-sm text-gray-600">{suggestion.currentWeight} kg</span>
              )}
            </div>
          </div>

          {/* e1RM + trend */}
          {suggestion.currentE1RM > 0 && (
            <div className="text-right flex-shrink-0">
              <div className="flex items-center gap-1 justify-end">
                <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
                <span className="text-xs text-gray-500">e1RM</span>
              </div>
              <span className="font-bold text-base">{Math.round(suggestion.currentE1RM)}<span className="text-xs text-gray-400 ml-0.5">kg</span></span>
              {suggestion.previousE1RM && (
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
          <div className="mt-4 space-y-3 border-t pt-3">
            {/* Reasoning */}
            <p className="text-sm text-gray-600 leading-relaxed">{suggestion.reasoning}</p>
            {suggestion.tip && (
              <p className="text-xs text-gray-400 italic">{suggestion.tip}</p>
            )}

            {/* Target rep range */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Target rep range:</span>
              <span className="font-medium text-gray-700">{repLo}–{repHi} reps</span>
              <span className="text-gray-400">({tierLabel})</span>
            </div>

            {/* e1RM chart */}
            {e1RMHistory.length >= 2 && (
              <div>
                <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Estimated 1RM history</p>
                <ResponsiveContainer width="100%" height={130}>
                  <LineChart data={e1RMHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      unit="kg"
                      domain={['auto', 'auto']}
                      width={40}
                    />
                    <Tooltip
                      formatter={(v: any, name: string) => [
                        name === 'e1rm' ? `${Math.round(v)} kg` : `${v} kg`,
                        name === 'e1rm' ? 'Est. 1RM' : 'Top set',
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="e1rm"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="e1rm"
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      dot={{ r: 2 }}
                      strokeDasharray="4 2"
                      name="weight"
                    />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-gray-400 text-center mt-1">
                  — e1RM &nbsp;&nbsp; - - top set weight
                </p>
              </div>
            )}

            {/* Confidence */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400">Algorithm confidence:</span>
              <span className={`font-medium ${
                suggestion.confidence === 'high' ? 'text-green-600' :
                suggestion.confidence === 'medium' ? 'text-yellow-600' : 'text-gray-500'
              }`}>
                {suggestion.confidence}
              </span>
              {suggestion.confidence === 'low' && (
                <span className="text-gray-400">— log more sessions for better suggestions</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ProgressionInsights() {
  const [suggestions, setSuggestions] = useState<Record<string, ProgressionSuggestion>>({});
  const [e1RMHistories, setE1RMHistories] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'increase' | 'maintain' | 'deload'>('all');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const { history } = await apiCall('/workouts/history');
      const logs: WorkoutLog[] = history || [];

      const allSuggestions = computeAllSuggestions(logs);
      setSuggestions(allSuggestions);

      // Build e1RM history per exercise
      const histories: Record<string, any[]> = {};
      const sorted = [...logs].sort(
        (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
      );

      for (const log of sorted) {
        const byEx: Record<string, { weight: number; reps: number }[]> = {};
        for (const s of (log.sets || [])) {
          const k = s.exerciseId || s.exerciseName;
          if (!byEx[k]) byEx[k] = [];
          byEx[k].push({ weight: s.weight, reps: s.reps });
        }
        for (const [k, sets] of Object.entries(byEx)) {
          if (!histories[k]) histories[k] = [];
          const topWeight = Math.max(...sets.map(s => s.weight));
          const bestE1RM = Math.max(...sets.map(s => epley(s.weight, s.reps)));
          const bestReps = sets.find(s => s.weight === topWeight)?.reps ?? 0;
          histories[k].push({
            date: format(parseISO(log.completedAt), 'MMM d'),
            e1rm: Math.round(bestE1RM),
            weight: topWeight,
            reps: bestReps,
          });
        }
      }
      setE1RMHistories(histories);
    } catch (e) {
      console.error('Failed to load progression data', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = Object.entries(suggestions).filter(([, s]) => {
    if (s.action === 'insufficient_data') return false;
    if (filter === 'increase') return s.action === 'increase_weight' || s.action === 'increase_reps';
    if (filter === 'maintain') return s.action === 'maintain';
    if (filter === 'deload') return s.action === 'deload';
    return true;
  });

  // Sort: increase_weight first, then maintain, then deload
  const sortOrder = { increase_weight: 0, increase_reps: 0, maintain: 1, deload: 2, insufficient_data: 3 };
  filteredEntries.sort(([, a], [, b]) => sortOrder[a.action] - sortOrder[b.action]);

  const counts = {
    increase: Object.values(suggestions).filter(s => s.action === 'increase_weight' || s.action === 'increase_reps').length,
    maintain: Object.values(suggestions).filter(s => s.action === 'maintain').length,
    deload: Object.values(suggestions).filter(s => s.action === 'deload').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (Object.keys(suggestions).length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="font-medium text-gray-600">No progression data yet</p>
          <p className="text-sm text-gray-400 mt-1">Complete workouts to see weight suggestions here</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setFilter(filter === 'increase' ? 'all' : 'increase')}
          className={`rounded-lg p-3 text-center transition-colors border ${
            filter === 'increase'
              ? 'bg-green-100 border-green-300'
              : 'bg-green-50 border-green-100 hover:border-green-200'
          }`}
        >
          <div className="text-2xl font-bold text-green-700">{counts.increase}</div>
          <div className="text-xs text-green-600">Ready to progress</div>
        </button>
        <button
          onClick={() => setFilter(filter === 'maintain' ? 'all' : 'maintain')}
          className={`rounded-lg p-3 text-center transition-colors border ${
            filter === 'maintain'
              ? 'bg-blue-100 border-blue-300'
              : 'bg-blue-50 border-blue-100 hover:border-blue-200'
          }`}
        >
          <div className="text-2xl font-bold text-blue-700">{counts.maintain}</div>
          <div className="text-xs text-blue-600">Keep weight</div>
        </button>
        <button
          onClick={() => setFilter(filter === 'deload' ? 'all' : 'deload')}
          className={`rounded-lg p-3 text-center transition-colors border ${
            filter === 'deload'
              ? 'bg-amber-100 border-amber-300'
              : 'bg-amber-50 border-amber-100 hover:border-amber-200'
          }`}
        >
          <div className="text-2xl font-bold text-amber-700">{counts.deload}</div>
          <div className="text-xs text-amber-600">Deload</div>
        </button>
      </div>

      {/* Algorithm explainer */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong className="text-gray-700">How this works:</strong> Uses your rep history and the Epley formula to estimate your 1-rep max (e1RM) over time. Increment size adapts to exercise type — barbell compounds get +2.5 kg flat; isolation movements and machines use 5% of current weight. Suggestions are suppressed when RPE was ≥9 or strength is declining.
        </p>
      </div>

      {/* Exercise cards */}
      {filteredEntries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-gray-500">
            No exercises match this filter
          </CardContent>
        </Card>
      ) : (
        filteredEntries.map(([key, suggestion]) => {
          const name = suggestion.action !== 'insufficient_data'
            ? key
            : key;
          return (
            <ExerciseCard
              key={key}
              exerciseName={key}
              suggestion={suggestion}
              e1RMHistory={e1RMHistories[key] || []}
              expanded={expandedExercise === key}
              onClick={() => setExpandedExercise(expandedExercise === key ? null : key)}
            />
          );
        })
      )}
    </div>
  );
}
