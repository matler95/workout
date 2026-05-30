import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { apiCall } from '../../utils/supabase-client';
import { toast } from 'sonner';
import {
  Clock, Check, Trophy, TrendingUp, TrendingDown,
  SkipForward, Minus, Plus, ArrowUp, Minus as MinusIcon,
  AlertTriangle, Info,
} from 'lucide-react';
import {
  computeSuggestion,
  computeAllSuggestions,
  classifyExercise,
  getRepTarget,
  type ProgressionSuggestion,
  type WorkoutLog,
  type SessionData,
} from '../../utils/progressiveOverload';

interface SetLog {
  exerciseId: string;
  exerciseName: string;
  set: number;
  weight: number;
  reps: number;
  timestamp: string;
}

// ── Suggestion banner component ────────────────────────────────────────────────
function SuggestionBanner({ suggestion, exerciseName }: {
  suggestion: ProgressionSuggestion;
  exerciseName: string;
}) {
  if (suggestion.action === 'insufficient_data') return null;

  const config = {
    increase_weight: {
      icon: <ArrowUp className="w-4 h-4 flex-shrink-0" />,
      bg: 'bg-green-50 border-green-200',
      text: 'text-green-800',
      label: `Increase to ${suggestion.suggestedWeight} kg`,
    },
    increase_reps: {
      icon: <TrendingUp className="w-4 h-4 flex-shrink-0" />,
      bg: 'bg-green-50 border-green-200',
      text: 'text-green-800',
      label: `Target ${suggestion.suggestedReps?.[0]}–${suggestion.suggestedReps?.[1]} reps`,
    },
    maintain: {
      icon: <Info className="w-4 h-4 flex-shrink-0" />,
      bg: 'bg-blue-50 border-blue-200',
      text: 'text-blue-800',
      label: `Stay at ${suggestion.currentWeight} kg`,
    },
    deload: {
      icon: <AlertTriangle className="w-4 h-4 flex-shrink-0" />,
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-800',
      label: `Reduce to ${suggestion.suggestedWeight} kg`,
    },
    insufficient_data: {
      icon: <Info className="w-4 h-4 flex-shrink-0" />,
      bg: 'bg-gray-50 border-gray-200',
      text: 'text-gray-700',
      label: 'No suggestion yet',
    },
  }[suggestion.action];

  const confidenceDot = {
    high: 'bg-green-400',
    medium: 'bg-yellow-400',
    low: 'bg-gray-400',
  }[suggestion.confidence];

  return (
    <div className={`border rounded-lg p-3 ${config.bg}`}>
      <div className={`flex items-start gap-2 ${config.text}`}>
        {config.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{config.label}</span>
            <span className="flex items-center gap-1 text-xs opacity-70">
              <span className={`w-2 h-2 rounded-full ${confidenceDot}`} />
              {suggestion.confidence} confidence
            </span>
          </div>
          <p className="text-xs mt-1 opacity-80 leading-relaxed">{suggestion.reasoning}</p>
          {suggestion.tip && (
            <p className="text-xs mt-1 opacity-60 italic">{suggestion.tip}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── e1RM mini display ──────────────────────────────────────────────────────────
function E1RMDisplay({ suggestion }: { suggestion: ProgressionSuggestion }) {
  if (suggestion.action === 'insufficient_data' || suggestion.currentE1RM === 0) return null;
  const diff = suggestion.previousE1RM !== null
    ? Math.round((suggestion.currentE1RM - suggestion.previousE1RM) * 10) / 10
    : null;
  return (
    <div className="flex items-center gap-3 text-xs text-gray-500 px-1">
      <span>Est. 1RM: <strong className="text-gray-700">{Math.round(suggestion.currentE1RM)} kg</strong></span>
      {diff !== null && (
        <span className={`flex items-center gap-0.5 ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
          {diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : <MinusIcon className="w-3 h-3" />}
          {diff > 0 ? '+' : ''}{diff} kg vs last
        </span>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ActiveWorkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const dayName = location.state?.dayName;

  const [exercises, setExercises] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, ProgressionSuggestion>>({});
  const [currentPhase, setCurrentPhase] = useState<'warmup' | 'exercise' | 'feedback'>('warmup');
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [totalSetsPerExercise] = useState(3);
  const [restTimer, setRestTimer] = useState(0);
  const [completedSets, setCompletedSets] = useState<SetLog[]>([]);
  const [feedback, setFeedback] = useState('');
  const [perceivedEffort, setPerceivedEffort] = useState(6);
  const [customWeight, setCustomWeight] = useState('');
  const [customReps, setCustomReps] = useState('');
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!dayName) { navigate('/plan'); return; }
    loadWorkout();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [dayName]);

  useEffect(() => {
    if (restTimer <= 0) return;
    timerRef.current = setInterval(() => {
      setRestTimer(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          toast.success('Rest done — go!');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [restTimer]);

  const loadWorkout = async () => {
    try {
      const [planRes, historyRes] = await Promise.all([
        apiCall('/workouts/plan'),
        apiCall('/workouts/history'),
      ]);

      const exs: any[] = planRes.plan?.workouts?.[dayName] || [];
      setExercises(exs);

      // Compute progressive overload suggestions for all exercises
      const history: WorkoutLog[] = historyRes.history || [];
      const allSuggestions = computeAllSuggestions(history);
      setSuggestions(allSuggestions);

      // Pre-fill first exercise
      if (exs.length > 0) {
        prefillExercise(exs[0], allSuggestions);
      }
    } catch {
      toast.error('Failed to load workout');
      navigate('/plan');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Pre-fills weight/reps inputs based on the progression suggestion.
   * Priority: suggestion > last session's actual data
   */
  const prefillExercise = (
    ex: any,
    allSuggestions: Record<string, ProgressionSuggestion>,
  ) => {
    const key = ex.id || ex.name;
    const s = allSuggestions[key];

    if (!s || s.action === 'insufficient_data') {
      setCustomWeight('');
      setCustomReps('');
      return;
    }

    const [, repHi] = getRepTarget(classifyExercise(ex.name));

    switch (s.action) {
      case 'increase_weight':
        setCustomWeight(String(s.suggestedWeight ?? s.currentWeight));
        setCustomReps(String(s.suggestedReps?.[0] ?? repHi - 2));
        break;
      case 'deload':
        setCustomWeight(String(s.suggestedWeight ?? s.currentWeight));
        setCustomReps(String(s.suggestedReps?.[0] ?? repHi - 2));
        break;
      case 'maintain':
        setCustomWeight(String(s.currentWeight || ''));
        setCustomReps(String(s.suggestedReps?.[0] ?? ''));
        break;
      case 'increase_reps':
        setCustomWeight(String(s.currentWeight || ''));
        setCustomReps(String(s.suggestedReps?.[0] ?? ''));
        break;
    }
  };

  const handleSetComplete = () => {
    const weight = parseFloat(customWeight) || 0;
    const reps = parseInt(customReps) || 0;
    if (weight <= 0 || reps <= 0) { toast.error('Enter weight and reps'); return; }

    const ex = exercises[currentExerciseIndex];
    const setData: SetLog = {
      exerciseId: ex.id,
      exerciseName: ex.name,
      set: currentSet,
      weight,
      reps,
      timestamp: new Date().toISOString(),
    };

    const newCompleted = [...completedSets, setData];
    setCompletedSets(newCompleted);
    toast.success(`Set ${currentSet} ✓ — ${weight}kg × ${reps}`);

    if (currentSet < totalSetsPerExercise) {
      setCurrentSet(currentSet + 1);
      setRestTimer(120);
      // Keep same weight pre-filled for next set
    } else {
      advanceExercise(newCompleted);
    }
  };

  const advanceExercise = (current: SetLog[]) => {
    if (currentExerciseIndex < exercises.length - 1) {
      const nextIdx = currentExerciseIndex + 1;
      setCurrentExerciseIndex(nextIdx);
      setCurrentSet(1);
      setRestTimer(0);
      prefillExercise(exercises[nextIdx], suggestions);
      toast.success(`Next: ${exercises[nextIdx].name}`);
    } else {
      setCurrentPhase('feedback');
    }
  };

  const handleWorkoutComplete = async () => {
    try {
      await apiCall('/workouts/log', {
        method: 'POST',
        body: JSON.stringify({
          dayName,
          completedAt: new Date().toISOString(),
          sets: completedSets,
          feedback,
          perceivedEffort,
          duration: Math.round((Date.now() - startTimeRef.current) / 60000),
        }),
      });
      toast.success('Workout saved! 💪');
      navigate('/dashboard');
    } catch {
      toast.error('Failed to save workout');
    }
  };

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Loading workout...</p>
        </div>
      </div>
    );
  }

  if (exercises.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <p className="text-gray-500 mb-4">No exercises in {dayName}</p>
            <Button onClick={() => navigate('/workout-builder')}>Edit Workout</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Warmup screen ─────────────────────────────────────────────────────────
  if (currentPhase === 'warmup') {
    const readySuggestions = exercises.filter(ex => {
      const s = suggestions[ex.id || ex.name];
      return s && s.action === 'increase_weight';
    });

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center">
              <Clock className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-xl">{dayName}</CardTitle>
            <p className="text-gray-500 text-sm">{exercises.length} exercises</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progression alerts */}
            {readySuggestions.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm font-medium text-green-800 mb-2">
                  🎯 {readySuggestions.length} exercise{readySuggestions.length > 1 ? 's' : ''} ready to progress:
                </p>
                {readySuggestions.map(ex => {
                  const s = suggestions[ex.id || ex.name];
                  return (
                    <div key={ex.id} className="text-xs text-green-700 flex justify-between">
                      <span>{ex.name}</span>
                      <span className="font-medium">{s.currentWeight} → {s.suggestedWeight} kg</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Warm-up tips */}
            <div className="bg-indigo-50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium text-indigo-800">Warm-up (5–10 min)</p>
              <p className="text-indigo-700">• Light cardio to raise heart rate</p>
              <p className="text-indigo-700">• Dynamic stretches for target muscles</p>
              <p className="text-indigo-700">• 1–2 light warm-up sets before working sets</p>
            </div>

            {/* Exercise list preview */}
            <div className="space-y-1">
              {exercises.map((ex, i) => {
                const s = suggestions[ex.id || ex.name];
                const action = s?.action;
                return (
                  <div key={i} className="flex items-center gap-2 text-sm py-1.5 border-b border-gray-100 last:border-0">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1">{ex.name}</span>
                    {action === 'increase_weight' && (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">↑ weight</span>
                    )}
                    {action === 'deload' && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">↓ deload</span>
                    )}
                    {action === 'maintain' && s?.currentWeight > 0 && (
                      <span className="text-xs text-gray-400">{s.currentWeight} kg</span>
                    )}
                  </div>
                );
              })}
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => { startTimeRef.current = Date.now(); setCurrentPhase('exercise'); }}
            >
              Start Workout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Feedback screen ───────────────────────────────────────────────────────
  if (currentPhase === 'feedback') {
    const totalVolume = completedSets.reduce((s, x) => s + x.weight * x.reps, 0);
    const uniqueExercises = new Set(completedSets.map(s => s.exerciseId)).size;
    const durationMin = Math.round((Date.now() - startTimeRef.current) / 60000);

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 w-16 h-16 bg-green-600 rounded-full flex items-center justify-center">
              <Trophy className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-xl">Workout Complete!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { value: completedSets.length, label: 'sets' },
                { value: uniqueExercises, label: 'exercises' },
                { value: `${durationMin}m`, label: 'duration' },
              ].map(({ value, label }) => (
                <div key={label} className="bg-green-50 rounded-lg py-3">
                  <div className="text-xl font-bold text-green-700">{value}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                </div>
              ))}
            </div>

            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">Total volume</p>
              <p className="text-2xl font-bold">{Math.round(totalVolume / 1000 * 10) / 10}<span className="text-sm text-gray-500 ml-1">t</span></p>
            </div>

            {/* RPE */}
            <div>
              <label className="text-sm font-medium mb-2 block">How hard was it? (RPE)</label>
              <div className="flex gap-1">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button
                    key={n}
                    onClick={() => setPerceivedEffort(n)}
                    className={`flex-1 h-9 rounded text-sm font-medium transition-colors ${
                      perceivedEffort === n
                        ? n <= 4 ? 'bg-green-500 text-white'
                          : n <= 7 ? 'bg-indigo-600 text-white'
                          : 'bg-red-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {perceivedEffort <= 4 ? 'Too easy — consider more weight next time'
                  : perceivedEffort <= 6 ? 'Perfect — great training stimulus'
                  : perceivedEffort <= 8 ? 'Hard — solid effort'
                  : 'Very hard — prioritise recovery'}
              </p>
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Notes (optional)</label>
              <Textarea
                placeholder="How did it feel? Anything to note for next time?"
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                rows={3}
              />
            </div>

            <Button onClick={handleWorkoutComplete} className="w-full" size="lg">
              Save & Finish
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Exercise screen ───────────────────────────────────────────────────────
  const currentExercise = exercises[currentExerciseIndex];
  const exerciseKey = currentExercise.id || currentExercise.name;
  const suggestion = suggestions[exerciseKey];
  const exerciseSets = completedSets.filter(s => s.exerciseId === currentExercise.id);
  const totalSetsAll = exercises.length * totalSetsPerExercise;
  const progressPct = Math.round((completedSets.length / totalSetsAll) * 100);
  const [repLo, repHi] = suggestion
    ? (suggestion.suggestedReps ?? getRepTarget(classifyExercise(currentExercise.name)))
    : getRepTarget(classifyExercise(currentExercise.name));

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Sticky header */}
      <div className="bg-white border-b sticky top-0 z-10 px-4 py-2.5">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{dayName}</p>
            <p className="font-semibold text-sm">
              {currentExerciseIndex + 1}/{exercises.length} · Set {currentSet}/{totalSetsPerExercise}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-400">{progressPct}%</p>
              <Progress value={progressPct} className="w-20 h-1.5 mt-0.5" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Rest timer */}
        {restTimer > 0 && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="py-5 text-center">
              <p className="text-xs font-medium text-blue-500 uppercase tracking-wider mb-1">Rest</p>
              <div className="text-6xl font-bold text-blue-700 tabular-nums">
                {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, '0')}
              </div>
              <Progress value={((120 - restTimer) / 120) * 100} className="mt-3 h-1.5" />
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setRestTimer(0)}>
                Skip rest
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Exercise card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
              <div className="flex-1 pr-2">
                <CardTitle className="text-xl leading-tight">{currentExercise.name}</CardTitle>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {currentExercise.primaryMuscles?.map((m: string) => (
                    <Badge key={m} className="text-xs">{m.replace(/_/g, ' ')}</Badge>
                  ))}
                  {currentExercise.secondaryMuscles?.map((m: string) => (
                    <Badge key={m} variant="secondary" className="text-xs">{m.replace(/_/g, ' ')}</Badge>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Target: {repLo}–{repHi} reps</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => advanceExercise(completedSets)}
                className="text-gray-400 flex-shrink-0"
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Progression suggestion */}
            {suggestion && (
              <SuggestionBanner suggestion={suggestion} exerciseName={currentExercise.name} />
            )}

            {/* e1RM indicator */}
            {suggestion && <E1RMDisplay suggestion={suggestion} />}

            {/* Weight + Reps inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Weight (kg)</label>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 flex-shrink-0"
                    onClick={() => setCustomWeight(w => {
                      const tier = classifyExercise(currentExercise.name);
                      const step = tier === 'isolation' ? 1 : 2.5;
                      return String(Math.max(0, Math.round((parseFloat(w || '0') - step) * 10) / 10));
                    })}
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <Input
                    type="number"
                    placeholder="kg"
                    value={customWeight}
                    onChange={e => setCustomWeight(e.target.value)}
                    className="text-center font-medium"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 flex-shrink-0"
                    onClick={() => setCustomWeight(w => {
                      const tier = classifyExercise(currentExercise.name);
                      const step = tier === 'isolation' ? 1 : 2.5;
                      return String(Math.round((parseFloat(w || '0') + step) * 10) / 10);
                    })}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Reps</label>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 flex-shrink-0"
                    onClick={() => setCustomReps(r => String(Math.max(1, parseInt(r || '1') - 1)))}
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <Input
                    type="number"
                    placeholder="reps"
                    value={customReps}
                    onChange={e => setCustomReps(e.target.value)}
                    className="text-center font-medium"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 flex-shrink-0"
                    onClick={() => setCustomReps(r => String(parseInt(r || '0') + 1))}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Rep range visual guide */}
            {customReps && (() => {
              const reps = parseInt(customReps);
              const inRange = reps >= repLo && reps <= repHi;
              const above = reps > repHi;
              const below = reps < repLo;
              return (
                <div className={`text-xs px-3 py-1.5 rounded flex items-center gap-1.5 ${
                  inRange ? 'bg-green-50 text-green-700'
                  : above ? 'bg-blue-50 text-blue-700'
                  : 'bg-gray-50 text-gray-500'
                }`}>
                  {inRange && '✓ In target range'}
                  {above && `↑ ${reps - repHi} above target — consider more weight`}
                  {below && `${repLo - reps} reps short of target — reduce weight if needed`}
                </div>
              );
            })()}

            {/* Complete set button */}
            <Button
              onClick={handleSetComplete}
              className="w-full"
              size="lg"
              disabled={restTimer > 0}
            >
              <Check className="w-5 h-5 mr-2" />
              Complete Set {currentSet}
            </Button>

            {/* Sets completed for this exercise */}
            {exerciseSets.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Completed sets</p>
                <div className="space-y-1">
                  {exerciseSets.map((s, i) => {
                    const e1rm = Math.round(s.weight * (1 + s.reps / 30));
                    return (
                      <div key={i} className="flex justify-between items-center text-sm bg-gray-50 rounded px-3 py-1.5">
                        <span className="text-gray-400">Set {s.set}</span>
                        <span className="font-medium">{s.weight} kg × {s.reps}</span>
                        <span className="text-xs text-gray-400">~{e1rm} kg 1RM</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        {currentExercise.instructions && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">How to perform</p>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {currentExercise.instructions}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Up next */}
        {currentExerciseIndex < exercises.length - 1 && (
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Up next</p>
              <div className="space-y-1.5">
                {exercises.slice(currentExerciseIndex + 1, currentExerciseIndex + 4).map((ex, i) => {
                  const s = suggestions[ex.id || ex.name];
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs flex-shrink-0">
                        {currentExerciseIndex + 2 + i}
                      </span>
                      <span className="flex-1">{ex.name}</span>
                      {s?.action === 'increase_weight' && (
                        <span className="text-xs text-green-600">↑ {s.suggestedWeight} kg</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
