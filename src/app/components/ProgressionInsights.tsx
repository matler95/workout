import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../components/ui/card';
import {
  computeAllSuggestions,
  classifyExercise,
  getRepTarget,
  type ProgressionSuggestion,
  type WorkoutLog,
} from '../../../utils/progressiveOverload';
import { workoutApi, type ExerciseHistoryPoint } from '../../utils/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, ArrowUp, AlertTriangle, Info } from 'lucide-react';
import { format, parseISO } from 'date-fns';

type FilterKey = 'all' | 'increase' | 'maintain' | 'deload';

// ─── Sub-components ────────────────────────────────────────────────────────────

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
  const map: Record<ProgressionSuggestion['action'], { label: string; cls: string }> = {
    increase_weight:   { label: 'Increase weight', cls: 'bg-green-100 text-green-800' },
    increase_reps:     { label: 'Increase reps',   cls: 'bg-green-100 text-green-800' },
    deload:            { label: 'Deload',           cls: 'bg-amber-100 text-amber-800' },
    maintain:          { label: 'Keep weight',      cls: 'bg-blue-100 text-blue-800' },
    insufficient_data: { label: 'Need more data',   cls: 'bg-gray-100 text-gray-600' },
  };
  const { label, cls } = map[action];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

interface ExerciseCardProps {
  exerciseKey: string;
  suggestion: ProgressionSuggestion;
  expanded: boolean;
  onClick: () => void;
}

function ExerciseCard({ exerciseKey, suggestion, expanded, onClick }: ExerciseCardProps) {
  const [chartData, setChartData]     = useState<any[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);

  const tier = classifyExercise(exerciseKey);
  const [repLo, repHi] = getRepTarget(tier);
  const tierLabel: Record<string, string> = {
    heavy_barbell: 'Barbell', compound_db_machine: 'Compound',
    isolation: 'Isolation', bodyweight: 'Bodyweight',
  };

  const trendColor = suggestion.e1RMTrend === 'up' ? 'text-green-600'
    : suggestion.e1RMTrend === 'down' ? 'text-red-500' : 'text-gray-400';
  const TrendIcon = suggestion.e1RMTrend === 'up' ? TrendingUp
    : suggestion.e1RMTrend === 'down' ? TrendingDown : Minus;

  useEffect(() => {
    if (!expanded || chartData.length > 0) return;
    setLoadingChart(true);
    workoutApi.getExerciseHistory(exerciseKey)
      .then((pts: ExerciseHistoryPoint[]) => {
        setChartData(pts.map(p => ({
          date:   format(parseISO(p.completed_at), 'MMM d'),
          e1rm:   Math.round(p.e1rm_kg),
          weight: p.weight_kg,
        })));
      })
      .catch(() => {/* chart stays empty */})
      .finally(() => setLoadingChart(false));
  }, [expanded, exerciseKey]);

  return (
    <Card
      className={`cursor-pointer transition-colors ${expanded ? 'border-indigo-300' : 'hover:border-gray-300'}`}
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ActionIcon action={suggestion.action} />
              <span className="font-medium text-sm truncate">{exerciseKey}</span>
              <span className="text-xs text-gray-400">{tierLabel[tier]}</span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <ActionBadge action={suggestion.action} />
              {(suggestion.action === 'increase_weight' || suggestion.action === 'deload') && (
                <span className={`text-sm font-semibold ${suggestion.action === 'deload' ? 'text-amber-700' : 'text-green-700'}`}>
                  {suggestion.currentWeight} → {suggestion.suggestedWeight} kg
                </span>
              )}
              {suggestion.action === 'maintain' && suggestion.currentWeight > 0 && (
                <span className="text-sm text-gray-600">{suggestion.currentWeight} kg</span>
              )}
            </div>
          </div>

          {suggestion.currentE1RM > 0 && (
            <div className="text-right flex-shrink-0">
              <div className="flex items-center gap-1 justify-end">
                <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
                <span className="text-xs text-gray-500">e1RM</span>
              </div>
              <span className="font-bold text-base">
                {Math.round(suggestion.currentE1RM)}
                <span className="text-xs text-gray-400 ml-0.5">kg</span>
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
            <p className="text-sm text-gray-600 leading-relaxed">{suggestion.reasoning}</p>
            {suggestion.tip && <p className="text-xs text-gray-400 italic">{suggestion.tip}</p>}

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Target:</span>
              <span className="font-medium text-gray-700">{repLo}–{repHi} reps</span>
              <span className="text-gray-400">({tierLabel[tier]})</span>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Estimated 1RM history</p>
              {loadingChart ? (
                <div className="h-32 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-400" />
                </div>
              ) : chartData.length >= 2 ? (
                <>
                  <ResponsiveContainer width="100%" height={130}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
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
                  <p className="text-xs text-gray-400 text-center mt-1">— e1RM &nbsp;&nbsp; - - top set weight</p>
                </>
              ) : (
                <p className="text-xs text-gray-400 py-4 text-center">Need at least 2 sessions for a chart</p>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400">Confidence:</span>
              <span className={`font-medium ${
                suggestion.confidence === 'high'   ? 'text-green-600' :
                suggestion.confidence === 'medium' ? 'text-yellow-600' : 'text-gray-500'
              }`}>{suggestion.confidence}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Props: accept pre-loaded history to avoid double fetch ───────────────────

interface ProgressionInsightsProps {
  /** Pass workout history from the parent if already loaded (avoids a second fetch). */
  history?: WorkoutLog[];
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ProgressionInsights({ history: externalHistory }: ProgressionInsightsProps = {}) {
  const [suggestions, setSuggestions] = useState<Record<string, ProgressionSuggestion>>({});
  const [loading, setLoading]         = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [filter, setFilter]           = useState<FilterKey>('all');

  useEffect(() => {
    if (externalHistory) {
      // Parent already loaded history — compute directly, no extra fetch
      const allSuggestions = computeAllSuggestions(externalHistory);
      setSuggestions(allSuggestions);
      setLoading(false);
    } else {
      loadData();
    }
  }, [externalHistory]);

  const loadData = async () => {
    try {
      const history = await workoutApi.getHistory(100);
      setSuggestions(computeAllSuggestions(history as WorkoutLog[]));
    } catch (e) {
      console.error('Failed to load progression data', e);
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (allEntries.length === 0) {
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
      {/* Summary filter buttons */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { key: 'increase' as FilterKey, count: counts.increase, label: 'Ready to progress', bg: 'bg-green-50 border-green-100', activeBg: 'bg-green-100 border-green-300', text: 'text-green-700' },
          { key: 'maintain' as FilterKey, count: counts.maintain, label: 'Keep weight',        bg: 'bg-blue-50 border-blue-100',  activeBg: 'bg-blue-100 border-blue-300',  text: 'text-blue-700' },
          { key: 'deload'   as FilterKey, count: counts.deload,   label: 'Deload',             bg: 'bg-amber-50 border-amber-100',activeBg: 'bg-amber-100 border-amber-300',text: 'text-amber-700' },
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
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong className="text-gray-700">How this works:</strong> Uses your rep history and
          the Epley formula (weight × (1 + reps/30)) to estimate your 1-rep max over time.
          Barbell movements get flat +2.5 kg; isolation and machines use 5% of current weight.
          Suggestions are suppressed when RPE was ≥9 or strength is declining.
        </p>
      </div>

      {/* Exercise cards */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-gray-500">
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
          />
        ))
      )}
    </div>
  );
}