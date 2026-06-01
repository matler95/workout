import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { apiCall } from '../../utils/supabase-client';
import { toast } from 'sonner';
import {
  Clock, Check, Trophy, TrendingUp, TrendingDown,
  SkipForward, Minus, Plus, ArrowUp,
  AlertTriangle, Info, Minus as MinusIcon, X,
} from 'lucide-react';
import {
  computeAllSuggestions,
  classifyExercise,
  getRepTarget,
  type ProgressionSuggestion,
  type WorkoutLog,
} from '../../../utils/progressiveOverload';
import {
  estimateStartingWeight,
  applyFirstSessionRPECorrection,
  type UserProfile,
  type StartingWeightResult,
} from '../../utils/startingWeights';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SetLog {
  exerciseId: string;
  exerciseName: string;
  set: number;
  weight: number;
  reps: number;
  timestamp: string;
}

interface ExercisePlan {
  suggestedWeight: number;
  suggestedReps: [number, number];
  sets: number;
  source: 'history' | 'estimated' | 'bodyweight';
  suggestion?: ProgressionSuggestion;
  estimate?: StartingWeightResult;
  isFirstSession: boolean;
}

// ─── Suggestion banner ─────────────────────────────────────────────────────────

function SuggestionBanner({ plan, exerciseKey }: { plan: ExercisePlan; exerciseKey: string }) {
  if (plan.source === 'bodyweight') return null;

  if (plan.source === 'estimated') {
    const e = plan.estimate!;
    const tier = classifyExercise(exerciseKey);
    const tierLabel: Record<string, string> = {
      heavy_barbell: 'barbell',
      compound_db_machine: 'compound',
      isolation: 'isolation',
      bodyweight: 'bodyweight',
    };
    return (
      <div className="border rounded-lg p-3 bg-indigo-50 border-indigo-200">
        <div className="flex items-start gap-2 text-indigo-800">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Estimated starting weight</p>
            <p className="text-xs mt-0.5 opacity-80 leading-relaxed">
              Based on your bodyweight, experience level, and goal. Start here — the app will
              calibrate after you log your effort rating.
            </p>
            {e.confidence === 'tier_fallback' && (
              <p className="text-xs mt-1 opacity-60 italic">
                No exact match found — using {tierLabel[tier] ?? tier} tier average.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const s = plan.suggestion!;
  if (s.action === 'insufficient_data') return null;

  const config = {
    increase_weight: { icon: <ArrowUp className="w-4 h-4 flex-shrink-0" />, bg: 'bg-green-50 border-green-200', text: 'text-green-800', label: `Increase to ${s.suggestedWeight} kg` },
    increase_reps:   { icon: <TrendingUp className="w-4 h-4 flex-shrink-0" />, bg: 'bg-green-50 border-green-200', text: 'text-green-800', label: `Target ${s.suggestedReps?.[0]}–${s.suggestedReps?.[1]} reps` },
    maintain:        { icon: <Info className="w-4 h-4 flex-shrink-0" />, bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', label: `Stay at ${s.currentWeight} kg` },
    deload:          { icon: <AlertTriangle className="w-4 h-4 flex-shrink-0" />, bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', label: `Reduce to ${s.suggestedWeight} kg` },
    insufficient_data: { icon: <Info className="w-4 h-4 flex-shrink-0" />, bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700', label: '' },
  }[s.action];

  const confidenceDot = { high: 'bg-green-400', medium: 'bg-yellow-400', low: 'bg-gray-400' }[s.confidence];

  return (
    <div className={`border rounded-lg p-3 ${config.bg}`}>
      <div className={`flex items-start gap-2 ${config.text}`}>
        {config.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{config.label}</span>
            <span className="flex items-center gap-1 text-xs opacity-70">
              <span className={`w-2 h-2 rounded-full ${confidenceDot}`} />
              {s.confidence} confidence
            </span>
          </div>
          <p className="text-xs mt-1 opacity-80 leading-relaxed">{s.reasoning}</p>
          {s.tip && <p className="text-xs mt-1 opacity-60 italic">{s.tip}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── e1RM display ──────────────────────────────────────────────────────────────

function E1RMDisplay({ plan }: { plan: ExercisePlan }) {
  const s = plan.suggestion;
  if (!s || s.action === 'insufficient_data' || s.currentE1RM === 0) return null;
  const diff = s.previousE1RM !== null
    ? Math.round((s.currentE1RM - s.previousE1RM) * 10) / 10
    : null;
  return (
    <div className="flex items-center gap-3 text-xs text-gray-500 px-1">
      <span>Est. 1RM: <strong className="text-gray-700">{Math.round(s.currentE1RM)} kg</strong></span>
      {diff !== null && (
        <span className={`flex items-center gap-0.5 ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
          {diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : <MinusIcon className="w-3 h-3" />}
          {diff > 0 ? '+' : ''}{diff} kg vs last
        </span>
      )}
    </div>
  );
}

// ─── Exit dialog ───────────────────────────────────────────────────────────────
// FIX #7: gives users a safe way to abandon a workout with explicit choices.

type ExitChoice = 'save' | 'discard' | null;

function ExitDialog({
  open,
  hasSets,
  onChoice,
}: {
  open: boolean;
  hasSets: boolean;
  onChoice: (choice: ExitChoice) => void;
}) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End workout?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasSets
              ? 'You have logged sets this session. Would you like to save your progress or discard it?'
              : 'No sets have been logged yet. Are you sure you want to exit?'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          {hasSets && (
            <AlertDialogAction
              onClick={() => onChoice('save')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Save partial workout
            </AlertDialogAction>
          )}
          <AlertDialogAction
            onClick={() => onChoice('discard')}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Discard workout
          </AlertDialogAction>
          <AlertDialogCancel onClick={() => onChoice(null)}>
            Keep training
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ActiveWorkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const dayName  = location.state?.dayName;

  const [exercises, setExercises]           = useState<any[]>([]);
  const [plans, setPlans]                   = useState<Record<string, ExercisePlan>>({});
  const [currentPhase, setCurrentPhase]     = useState<'warmup' | 'exercise' | 'feedback'>('warmup');
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet]         = useState(1);
  const [restTimer, setRestTimer]           = useState(0);
  const [completedSets, setCompletedSets]   = useState<SetLog[]>([]);
  const [feedback, setFeedback]             = useState('');
  const [perceivedEffort, setPerceivedEffort] = useState(6);
  const [customWeight, setCustomWeight]     = useState('');
  const [customReps, setCustomReps]         = useState('');
  const [loading, setLoading]               = useState(true);
  // FIX #7: exit dialog state
  const [showExitDialog, setShowExitDialog] = useState(false);

  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());
  const SETS_PER_EXERCISE = 3;

  useEffect(() => {
    if (!dayName) { navigate('/plan'); return; }
    loadWorkout();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [dayName]);

  useEffect(() => {
    if (restTimer <= 0) return;
    timerRef.current = setInterval(() => {
      setRestTimer(t => {
        if (t <= 1) { clearInterval(timerRef.current!); toast.success('Rest done — go!'); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [restTimer]);

  // ── Load workout ─────────────────────────────────────────────────────────────

  const loadWorkout = async () => {
    try {
      const [planRes, historyRes, profileRes] = await Promise.all([
        apiCall('/workouts/plan'),
        apiCall('/workouts/history'),
        apiCall('/profile'),
      ]);

      const exs: any[] = planRes.plan?.workouts?.[dayName] || [];
      setExercises(exs);

      const history: WorkoutLog[] = historyRes.history || [];
      const profile: UserProfile | null = profileRes.profile;

      const historySuggestions = computeAllSuggestions(history);
      const builtPlans: Record<string, ExercisePlan> = {};

      for (const ex of exs) {
        const key  = ex.id || ex.name;
        const tier = classifyExercise(ex.name);
        const [repLo, repHi] = getRepTarget(tier);
        const historySuggestion = historySuggestions[key];

        if (historySuggestion && historySuggestion.action !== 'insufficient_data') {
          let w: number = historySuggestion.currentWeight;
          let reps: [number, number] = historySuggestion.suggestedReps ?? [repLo, repHi];

          switch (historySuggestion.action) {
            case 'increase_weight': w    = historySuggestion.suggestedWeight ?? w; break;
            case 'deload':          w    = historySuggestion.suggestedWeight ?? w; break;
            case 'increase_reps':   reps = historySuggestion.suggestedReps   ?? reps; break;
          }

          builtPlans[key] = {
            suggestedWeight: w,
            suggestedReps: reps,
            sets: SETS_PER_EXERCISE,
            source: tier === 'bodyweight' ? 'bodyweight' : 'history',
            suggestion: historySuggestion,
            isFirstSession: false,
          };
        } else if (profile) {
          const estimate = estimateStartingWeight(ex.name, profile);
          builtPlans[key] = {
            suggestedWeight: estimate.weight,
            suggestedReps: estimate.reps,
            sets: estimate.sets,
            source: tier === 'bodyweight' ? 'bodyweight' : 'estimated',
            estimate,
            isFirstSession: true,
          };
        } else {
          builtPlans[key] = {
            suggestedWeight: 0,
            suggestedReps: [repLo, repHi],
            sets: SETS_PER_EXERCISE,
            source: tier === 'bodyweight' ? 'bodyweight' : 'estimated',
            isFirstSession: true,
          };
        }
      }

      setPlans(builtPlans);
      if (exs.length > 0) applyPlanToInputs(exs[0], builtPlans);
    } catch (e) {
      toast.error('Failed to load workout');
      navigate('/plan');
    } finally {
      setLoading(false);
    }
  };

  const applyPlanToInputs = (ex: any, allPlans: Record<string, ExercisePlan>) => {
    const plan = allPlans[ex.id || ex.name];
    if (!plan) { setCustomWeight(''); setCustomReps(''); return; }
    if (plan.source === 'bodyweight') {
      setCustomWeight('0');
      setCustomReps(String(plan.suggestedReps[0]));
    } else {
      setCustomWeight(plan.suggestedWeight > 0 ? String(plan.suggestedWeight) : '');
      setCustomReps(String(plan.suggestedReps[0]));
    }
  };

  // ── Exit handling (FIX #7) ────────────────────────────────────────────────

  const handleExitChoice = async (choice: ExitChoice) => {
    setShowExitDialog(false);
    if (choice === null) return; // "Keep training"

    if (choice === 'save' && completedSets.length > 0) {
      // Save whatever was logged so far, with a note that it was partial
      try {
        await apiCall('/workouts/log', {
          method: 'POST',
          body: JSON.stringify({
            dayName,
            completedAt:    new Date().toISOString(),
            sets:           completedSets,
            feedback:       '(partial workout)',
            perceivedEffort,
            rpeCorrections: {},
            duration:       Math.round((Date.now() - startTimeRef.current) / 60000),
          }),
        });
        toast.success('Partial workout saved');
      } catch {
        toast.error('Could not save — workout discarded');
      }
    }

    navigate('/plan');
  };

  // ── Set / exercise flow ──────────────────────────────────────────────────────

  const handleSetComplete = () => {
    const weight = parseFloat(customWeight) || 0;
    const reps   = parseInt(customReps) || 0;
    if (reps <= 0) { toast.error('Enter reps'); return; }

    const ex   = exercises[currentExerciseIndex];
    const plan = plans[ex.id || ex.name];
    const isBodyweight = plan?.source === 'bodyweight';

    if (!isBodyweight && weight <= 0) { toast.error('Enter weight'); return; }

    const newSet: SetLog = {
      exerciseId:   ex.id,
      exerciseName: ex.name,
      set:          currentSet,
      weight:       isBodyweight ? 0 : weight,
      reps,
      timestamp:    new Date().toISOString(),
    };

    const newCompleted = [...completedSets, newSet];
    setCompletedSets(newCompleted);

    const setsForThisExercise = plan?.sets ?? SETS_PER_EXERCISE;
    toast.success(`Set ${currentSet} ✓ — ${isBodyweight ? `${reps} reps` : `${weight} kg × ${reps}`}`);

    if (currentSet < setsForThisExercise) {
      setCurrentSet(currentSet + 1);
      setRestTimer(120);
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
      applyPlanToInputs(exercises[nextIdx], plans);
      toast.success(`Next: ${exercises[nextIdx].name}`);
    } else {
      setCurrentPhase('feedback');
    }
  };

  const handleWorkoutComplete = async () => {
    try {
      const rpeCorrections: Record<string, number> = {};
      for (const ex of exercises) {
        const key  = ex.id || ex.name;
        const plan = plans[key];
        if (plan?.isFirstSession && plan.source === 'estimated') {
          const { newWeight } = applyFirstSessionRPECorrection(
            plan.suggestedWeight,
            perceivedEffort,
            classifyExercise(ex.name),
          );
          rpeCorrections[key] = newWeight;
        }
      }

      await apiCall('/workouts/log', {
        method: 'POST',
        body: JSON.stringify({
          dayName,
          completedAt:    new Date().toISOString(),
          sets:           completedSets,
          feedback,
          perceivedEffort,
          rpeCorrections,
          duration:       Math.round((Date.now() - startTimeRef.current) / 60000),
        }),
      });

      toast.success('Workout saved! 💪');
      navigate('/dashboard');
    } catch {
      toast.error('Failed to save');
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────

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
            <p className="text-gray-500 mb-4">No exercises found for {dayName}</p>
            <Button onClick={() => navigate('/workout-builder')}>Edit Workout</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Warmup screen ───────────────────────────────────────────────────────────

  if (currentPhase === 'warmup') {
    const progressionCount = Object.values(plans).filter(p => p.suggestion?.action === 'increase_weight').length;
    const firstTimers      = Object.values(plans).filter(p => p.isFirstSession).length;

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-end mb-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-gray-600"
                onClick={() => navigate('/plan')}
              >
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </div>
            <div className="mx-auto mb-3 w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center">
              <Clock className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-xl">{dayName}</CardTitle>
            <p className="text-gray-400 text-sm">{exercises.length} exercises</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {progressionCount > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm font-medium text-green-800 mb-2">
                  🎯 {progressionCount} exercise{progressionCount > 1 ? 's' : ''} ready to go heavier:
                </p>
                {exercises
                  .filter(ex => plans[ex.id || ex.name]?.suggestion?.action === 'increase_weight')
                  .map(ex => {
                    const plan = plans[ex.id || ex.name];
                    return (
                      <div key={ex.id} className="text-xs text-green-700 flex justify-between py-0.5">
                        <span>{ex.name}</span>
                        <span className="font-medium">
                          {plan.suggestion?.currentWeight} → {plan.suggestedWeight} kg
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}

            {firstTimers > 0 && progressionCount === 0 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <p className="text-sm font-medium text-indigo-800">
                  ✨ Starting weights estimated for {firstTimers} exercise{firstTimers > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-indigo-600 mt-1">
                  Based on your bodyweight, experience, and goal. Adjust freely — the app calibrates after your first session.
                </p>
              </div>
            )}

            <div className="bg-white rounded-lg p-3 text-sm space-y-1 border border-gray-100">
              <p className="font-medium text-gray-700">Warm-up first (5–10 min)</p>
              <p className="text-gray-500">• Light cardio to raise heart rate</p>
              <p className="text-gray-500">• Dynamic stretches for today's muscle groups</p>
              <p className="text-gray-500">• 1–2 light warm-up sets with ~50% of working weight</p>
            </div>

            <div className="space-y-1">
              {exercises.map((ex, i) => {
                const plan = plans[ex.id || ex.name];
                return (
                  <div key={i} className="flex items-center gap-2 text-sm py-1.5 border-b border-gray-100 last:border-0">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs flex-shrink-0 font-medium">
                      {i + 1}
                    </span>
                    <span className="flex-1">{ex.name}</span>
                    {plan?.source === 'history' && plan.suggestion?.action === 'increase_weight' && (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">↑ {plan.suggestedWeight} kg</span>
                    )}
                    {plan?.source === 'history' && plan.suggestion?.action === 'deload' && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">↓ deload</span>
                    )}
                    {plan?.source === 'estimated' && (
                      <span className="text-xs text-gray-400">{plan.suggestedWeight} kg est.</span>
                    )}
                    {plan?.source === 'history' && plan.suggestion?.action === 'maintain' && (
                      <span className="text-xs text-gray-400">{plan.suggestedWeight} kg</span>
                    )}
                    {plan?.source === 'bodyweight' && (
                      <span className="text-xs text-gray-400">{plan.suggestedReps[0]}–{plan.suggestedReps[1]} reps</span>
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

  // ── Feedback screen ─────────────────────────────────────────────────────────

  if (currentPhase === 'feedback') {
    const totalVolume    = completedSets.reduce((s, x) => s + x.weight * x.reps, 0);
    const uniqueExercises = new Set(completedSets.map(s => s.exerciseId)).size;
    const durationMin    = Math.round((Date.now() - startTimeRef.current) / 60000);
    const firstSessionExercises = exercises.filter(ex => plans[ex.id || ex.name]?.isFirstSession);

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
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { value: completedSets.length, label: 'sets' },
                { value: uniqueExercises,      label: 'exercises' },
                { value: `${durationMin}m`,    label: 'duration' },
              ].map(({ value, label }) => (
                <div key={label} className="bg-green-50 rounded-lg py-3">
                  <div className="text-xl font-bold text-green-700">{value}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                </div>
              ))}
            </div>

            {totalVolume > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Total volume</p>
                <p className="text-2xl font-bold">
                  {Math.round(totalVolume / 1000 * 10) / 10}
                  <span className="text-sm text-gray-500 ml-1">tonnes</span>
                </p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Overall effort (RPE 1–10)</label>
              {firstSessionExercises.length > 0 && (
                <p className="text-xs text-indigo-600 mb-2 leading-relaxed">
                  ℹ️ This rating also calibrates starting weights for your {firstSessionExercises.length} new exercise{firstSessionExercises.length > 1 ? 's' : ''} — be honest!
                </p>
              )}
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
              <p className="text-xs text-gray-400 mt-1.5">
                {perceivedEffort <= 3 ? '😴 Too easy — weights will be increased next session'
                  : perceivedEffort <= 5 ? '🙂 Slightly easy — minor adjustment'
                  : perceivedEffort <= 7 ? '💪 Perfect effort — right in the zone'
                  : perceivedEffort <= 8 ? '😤 Hard — good stimulus, recovering well'
                  : '🔥 Very hard — recovery focus next session'}
              </p>
            </div>

            {firstSessionExercises.length > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <p className="text-xs font-medium text-indigo-800 mb-2">Next session adjustments (based on RPE {perceivedEffort}):</p>
                {firstSessionExercises.map(ex => {
                  const plan = plans[ex.id || ex.name];
                  if (!plan || plan.source !== 'estimated') return null;
                  const { newWeight } = applyFirstSessionRPECorrection(
                    plan.suggestedWeight,
                    perceivedEffort,
                    classifyExercise(ex.name),
                  );
                  return (
                    <div key={ex.id} className="text-xs text-indigo-700 flex justify-between py-0.5">
                      <span className="truncate pr-2">{ex.name}</span>
                      <span className="font-medium flex-shrink-0">
                        {plan.suggestedWeight} → {newWeight} kg
                        {newWeight === plan.suggestedWeight && ' (no change)'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

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

  // ── Exercise screen ─────────────────────────────────────────────────────────

  const currentExercise       = exercises[currentExerciseIndex];
  const exerciseKey           = currentExercise.id || currentExercise.name;
  const plan                  = plans[exerciseKey];
  const tier                  = classifyExercise(currentExercise.name);
  const [repLo, repHi]        = plan?.suggestedReps ?? getRepTarget(tier);
  const exerciseSets          = completedSets.filter(s => s.exerciseId === currentExercise.id);
  const setsForThisExercise   = plan?.sets ?? SETS_PER_EXERCISE;
  const totalSetsAll          = exercises.reduce((sum, ex) => sum + (plans[ex.id || ex.name]?.sets ?? SETS_PER_EXERCISE), 0);
  const progressPct           = Math.round((completedSets.length / totalSetsAll) * 100);
  const weightStep            = tier === 'isolation' ? 1 : 2.5;
  const isBodyweight          = plan?.source === 'bodyweight';

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* FIX #7: exit button in sticky header */}
      <div className="bg-white border-b sticky top-0 z-10 px-4 py-2.5">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">{dayName}</p>
            <p className="font-semibold text-sm">
              Ex. {currentExerciseIndex + 1}/{exercises.length} · Set {currentSet}/{setsForThisExercise}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-400">{progressPct}%</p>
              <Progress value={progressPct} className="w-20 h-1.5 mt-0.5" />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-red-500 h-8 px-2"
              onClick={() => setShowExitDialog(true)}
              title="End workout"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Exit confirmation dialog */}
      <ExitDialog
        open={showExitDialog}
        hasSets={completedSets.length > 0}
        onChoice={handleExitChoice}
      />

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
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <p className="text-xs text-gray-400">Target: {repLo}–{repHi} reps</p>
                  {plan?.isFirstSession && (
                    <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">First time</span>
                  )}
                </div>
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
            {plan && <SuggestionBanner plan={plan} exerciseKey={exerciseKey} />}
            {plan && <E1RMDisplay plan={plan} />}

            <div className={`grid gap-3 ${isBodyweight ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {!isBodyweight && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Weight (kg)</label>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0"
                      onClick={() => setCustomWeight(w =>
                        String(Math.max(0, Math.round((parseFloat(w || '0') - weightStep) * 10) / 10))
                      )}>
                      <Minus className="w-3 h-3" />
                    </Button>
                    <Input
                      type="number"
                      placeholder="kg"
                      value={customWeight}
                      onChange={e => setCustomWeight(e.target.value)}
                      className="text-center font-medium"
                    />
                    <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0"
                      onClick={() => setCustomWeight(w =>
                        String(Math.round((parseFloat(w || '0') + weightStep) * 10) / 10)
                      )}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-center">±{weightStep} kg</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Reps</label>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0"
                    onClick={() => setCustomReps(r => String(Math.max(1, parseInt(r || '1') - 1)))}>
                    <Minus className="w-3 h-3" />
                  </Button>
                  <Input
                    type="number"
                    placeholder="reps"
                    value={customReps}
                    onChange={e => setCustomReps(e.target.value)}
                    className="text-center font-medium"
                  />
                  <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0"
                    onClick={() => setCustomReps(r => String(parseInt(r || '0') + 1))}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>

            {customReps && (() => {
              const reps = parseInt(customReps);
              if (isNaN(reps)) return null;
              const inRange = reps >= repLo && reps <= repHi;
              const above   = reps > repHi;
              return (
                <div className={`text-xs px-3 py-1.5 rounded ${
                  inRange ? 'bg-green-50 text-green-700'
                  : above  ? 'bg-blue-50 text-blue-700'
                  : 'bg-gray-50 text-gray-500'
                }`}>
                  {inRange && `✓ In target range (${repLo}–${repHi})`}
                  {above   && `↑ ${reps - repHi} above target — consider more weight next set`}
                  {!inRange && !above && `${repLo - reps} short of target — reduce weight if needed`}
                </div>
              );
            })()}

            {/* FIX #14: button always enabled; show warning during rest instead of disabling */}
            {restTimer > 0 && (
              <p className="text-xs text-amber-600 text-center">
                ⏱ Rest in progress — you can still log this set early
              </p>
            )}
            <Button
              onClick={handleSetComplete}
              className="w-full"
              size="lg"
            >
              <Check className="w-5 h-5 mr-2" />
              Complete Set {currentSet}
            </Button>

            {exerciseSets.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">This exercise</p>
                <div className="space-y-1">
                  {exerciseSets.map((s, i) => {
                    const e1rm = s.weight > 0 ? Math.round(s.weight * (1 + s.reps / 30)) : null;
                    return (
                      <div key={i} className="flex justify-between items-center text-sm bg-gray-50 rounded px-3 py-1.5">
                        <span className="text-gray-400">Set {s.set}</span>
                        <span className="font-medium">
                          {s.weight > 0 ? `${s.weight} kg × ${s.reps}` : `${s.reps} reps`}
                        </span>
                        {e1rm && <span className="text-xs text-gray-400">~{e1rm} kg 1RM</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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

        {currentExerciseIndex < exercises.length - 1 && (
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Up next</p>
              <div className="space-y-1.5">
                {exercises.slice(currentExerciseIndex + 1, currentExerciseIndex + 4).map((ex, i) => {
                  const p = plans[ex.id || ex.name];
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs flex-shrink-0">
                        {currentExerciseIndex + 2 + i}
                      </span>
                      <span className="flex-1">{ex.name}</span>
                      {p?.suggestion?.action === 'increase_weight' && (
                        <span className="text-xs text-green-600">↑ {p.suggestedWeight} kg</span>
                      )}
                      {p?.source === 'estimated' && (
                        <span className="text-xs text-gray-400">{p.suggestedWeight} kg est.</span>
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
