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
import { profileApi, planApi, workoutApi } from '../../utils/api';
import { toast } from 'sonner';
import {
  Clock, Check, Trophy, SkipForward,
  Minus, Plus, X, TrendingUp, TrendingDown, HelpCircle,
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
} from '../../utils/startingWeights';
import { calculateMuscleVolume } from '../../utils/volumeTracking';
import {
  getWeightMode, getWeightModeConfig, formatWeight, plateSuggestion,
  type WeightMode,
} from '../../utils/exerciseWeightMode';
import {
  generateSessionId, queueStart, queueUpdate,
  queueMarkPending, queueClear,
} from '../../utils/offlineQueue';
import Celebration from '../components/ui/celebration';

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
  action?: ProgressionSuggestion['action'];
  isFirstSession: boolean;
  mode: WeightMode;
}

// ─── Timer persistence ─────────────────────────────────────────────────────────

const TIMER_START_KEY   = 'aw_rest_start';
const WORKOUT_START_KEY = 'aw_workout_start';

function saveRestStart(ms: number) {
  try { sessionStorage.setItem(TIMER_START_KEY, String(ms)); } catch {}
}
function loadRestStart(): number | null {
  try { const v = sessionStorage.getItem(TIMER_START_KEY); return v ? Number(v) : null; } catch { return null; }
}
function clearRestStart() {
  try { sessionStorage.removeItem(TIMER_START_KEY); } catch {}
}
function saveWorkoutStart(ms: number) {
  try { sessionStorage.setItem(WORKOUT_START_KEY, String(ms)); } catch {}
}
function loadWorkoutStart(): number {
  try { const v = sessionStorage.getItem(WORKOUT_START_KEY); return v ? Number(v) : Date.now(); } catch { return Date.now(); }
}

// ─── FIX 1: Stable exercise key helper ────────────────────────────────────────
// Plan exercises stored in JSONB may have id: undefined if they were added
// before the exercise ID audit. Fall back to the name so the progression
// engine can still match history entries (which also key by name in that case).

function exerciseKey(ex: { id?: string; name: string }): string {
  return (ex.id && ex.id.trim() !== '') ? ex.id : ex.name;
}

// ─── Suggestion pill ──────────────────────────────────────────────────────────

function SuggestionPill({ plan }: { plan: ExercisePlan }) {
  if (plan.source === 'bodyweight') return null;

  const { action, suggestedWeight } = plan;
  if (!action || action === 'insufficient_data') return null;

  const mode = plan.mode ?? 'dumbbell';
  const weightStr = formatWeight(suggestedWeight, mode);
  const config = {
    increase_weight: {
      icon: <TrendingUp className="w-3 h-3" />,
      label: `↑ ${weightStr}`,
      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    },
    increase_reps: {
      icon: <TrendingUp className="w-3 h-3" />,
      label: `↑ more reps`,
      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    },
    maintain: {
      icon: null,
      label: `→ ${weightStr}`,
      cls: 'bg-muted text-muted-foreground',
    },
    deload: {
      icon: <TrendingDown className="w-3 h-3" />,
      label: `↓ ${weightStr}`,
      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    },
  }[action] ?? null;

  if (!config) return null;

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${config.cls}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

// ─── Exit dialog ───────────────────────────────────────────────────────────────

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
              ? 'You have logged sets this session. Save your progress or discard it?'
              : 'No sets logged yet. Exit without saving?'}
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

const REST_DURATION = 120;

export function ActiveWorkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const dayName  = location.state?.dayName as string | undefined;

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
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showConfetti, setShowConfetti]     = useState(false);
  const [showExtraWeight, setShowExtraWeight] = useState(false);
  const [showRPEInfo, setShowRPEInfo]         = useState(false);

  const timerRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const offlineSessionId   = useRef<string>(generateSessionId());
  const startTimeRef = useRef<number>(loadWorkoutStart());

  useEffect(() => {
    if (!dayName) { navigate('/plan', { replace: true }); return; }
    loadWorkout();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [dayName]);

  // Restore timer from sessionStorage on mount / visibility change
  useEffect(() => {
    const savedStart = loadRestStart();
    if (savedStart !== null) {
      const remaining = REST_DURATION - Math.floor((Date.now() - savedStart) / 1000);
      remaining > 0 ? setRestTimer(remaining) : (clearRestStart(), setRestTimer(0));
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const s = loadRestStart();
        if (s !== null) {
          const remaining = REST_DURATION - Math.floor((Date.now() - s) / 1000);
          if (remaining > 0) {
            setRestTimer(remaining);
          } else {
            clearRestStart();
            setRestTimer(0);
            toast.success('Rest done — go!');
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Rest timer tick
  useEffect(() => {
    if (restTimer <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      clearRestStart();
      return;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRestTimer(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          clearRestStart();
          toast.success('Rest done — go!');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [restTimer]);

  const startRestTimer = () => {
    saveRestStart(Date.now());
    setRestTimer(REST_DURATION);
  };

  // ── Load workout ─────────────────────────────────────────────────────────────

  const loadWorkout = async () => {
    try {
      const [planResult, history, profile] = await Promise.all([
        planApi.get(),
        workoutApi.getHistory(100),
        profileApi.get(),
      ]);

      const exs: any[] = planResult?.workouts?.[dayName!] || [];
      setExercises(exs);

      const historySuggestions = computeAllSuggestions(history as WorkoutLog[]);
      const builtPlans: Record<string, ExercisePlan> = {};

      for (const ex of exs) {
        // FIX 1: use stable key — never rely on id alone since JSONB exercises
        // may have been saved without an id field.
        const key  = exerciseKey(ex);
        const tier = classifyExercise(ex.name);
        const [repLo, repHi] = getRepTarget(tier);
        const planSets = (ex.sets && ex.sets >= 1 && ex.sets <= 6) ? ex.sets : 3;
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
            sets: planSets,
            source: tier === 'bodyweight' ? 'bodyweight' : 'history',
            action: historySuggestion.action,
            isFirstSession: false,
            mode: getWeightMode(ex.name, ex.equipment || 'full_gym', tier),
          };
        } else if (profile) {
          // FIX 1: pass the stable key as exerciseId so startingWeights can
          // look up the WEIGHT_BY_ID map correctly even when ex.id is undefined.
          const estimate = estimateStartingWeight(ex.name, profile, ex.id || undefined);
          builtPlans[key] = {
            suggestedWeight: estimate.weight,
            suggestedReps: estimate.reps,
            sets: planSets,
            source: tier === 'bodyweight' ? 'bodyweight' : 'estimated',
            isFirstSession: true,
            mode: estimate.mode,
          };
        } else {
          builtPlans[key] = {
            suggestedWeight: 0,
            suggestedReps: [repLo, repHi],
            sets: planSets,
            source: tier === 'bodyweight' ? 'bodyweight' : 'estimated',
            isFirstSession: true,
            mode: getWeightMode(ex.name, ex.equipment || 'full_gym', tier),
          };
        }
      }

      setPlans(builtPlans);
      if (exs.length > 0) applyPlanToInputs(exs[0], builtPlans);
    } catch {
      toast.error('Failed to load workout');
      navigate('/plan');
    } finally {
      setLoading(false);
    }
  };

  const applyPlanToInputs = (ex: any, allPlans: Record<string, ExercisePlan>) => {
    const plan = allPlans[exerciseKey(ex)];
    if (!plan) { setCustomWeight(''); setCustomReps(''); return; }
    if (plan.mode === 'bodyweight') {
      setCustomWeight('0');
      setCustomReps(String(plan.suggestedReps[0]));
      setShowExtraWeight(false);
    } else {
      setCustomWeight(plan.suggestedWeight > 0 ? String(plan.suggestedWeight) : '');
      setCustomReps(String(plan.suggestedReps[0]));
    }
  };

  // ── Exit ─────────────────────────────────────────────────────────────────────

  const handleExitChoice = async (choice: ExitChoice) => {
    setShowExitDialog(false);
    if (choice === null) return;

    if (choice === 'save' && completedSets.length > 0) {
      try {
        await workoutApi.log({
          dayName: dayName!,
          completedAt:    new Date().toISOString(),
          sets:           completedSets,
          feedback:       '(partial workout)',
          perceivedEffort,
          rpeCorrections: {},
          duration:       Math.round((Date.now() - startTimeRef.current) / 60000),
        });
        queueClear(offlineSessionId.current);
        toast.success('Partial workout saved');
      } catch {
        toast.error('Could not save');
      }
    }

    clearRestStart();
    try { sessionStorage.removeItem(WORKOUT_START_KEY); } catch {}
    navigate('/plan');
  };

  // ── Set / exercise flow ──────────────────────────────────────────────────────

  const handleSetComplete = () => {
    const weight = parseFloat(customWeight) || 0;
    const reps   = parseInt(customReps) || 0;
    if (reps <= 0) { toast.error('Enter reps'); return; }

    const ex      = exercises[currentExerciseIndex];
    const key     = exerciseKey(ex);
    const plan    = plans[key];
    const mode    = plan?.mode ?? getWeightMode(ex.name, ex.equipment || 'full_gym', classifyExercise(ex.name));
    const isBodyweightMode = mode === 'bodyweight';

    if (!isBodyweightMode && weight <= 0) { toast.error('Enter weight'); return; }

    const loggedWeight = isBodyweightMode
      ? (showExtraWeight ? weight : 0)
      : weight;

    // FIX 1: exerciseId is always a non-empty string — falls back to name.
    // This is what gets written to workout_sets.exercise_id in the DB.
    // The progression engine keys history by (exerciseId || exerciseName),
    // so using the same stable key here ensures future sessions match correctly.
    const newSet: SetLog = {
      exerciseId:   key,            // stable: ex.id || ex.name
      exerciseName: ex.name,
      set:          currentSet,
      weight:       loggedWeight,
      reps,
      timestamp:    new Date().toISOString(),
    };

    const newCompleted = [...completedSets, newSet];
    setCompletedSets(newCompleted);
    queueUpdate(offlineSessionId.current, newCompleted);

    const setsForThisExercise = plan?.sets ?? 3;
    const modeForToast = plan?.mode ?? 'dumbbell';
    const weightDisplay = isBodyweightMode
      ? (showExtraWeight && weight > 0 ? `+${weight} kg, ` : '')
      : `${weight} ${modeForToast === 'dumbbell' ? 'kg/side' : modeForToast === 'smith' ? 'kg plates' : 'kg'}, `;
    toast.success(`Set ${currentSet} ✓ — ${weightDisplay}${reps} reps`);

    if (currentSet < setsForThisExercise) {
      setCurrentSet(currentSet + 1);
      startRestTimer();
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
      setShowExtraWeight(false);
      clearRestStart();
      applyPlanToInputs(exercises[nextIdx], plans);
    } else {
      setCurrentPhase('feedback');
    }
  };

  const handleWorkoutComplete = async () => {
    try {
      const rpeCorrections: Record<string, number> = {};
      for (const ex of exercises) {
        const key  = exerciseKey(ex);
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

      const muscleVolume = calculateMuscleVolume(completedSets);

      const now      = new Date().toISOString();
      const duration = Math.round((Date.now() - startTimeRef.current) / 60000);

      queueMarkPending(offlineSessionId.current, {
        dayName: dayName!, completedAt: now,
        sets: completedSets, feedback, perceivedEffort,
        rpeCorrections, duration, muscleVolume,
      });

      await workoutApi.log({
        dayName: dayName!, completedAt: now,
        sets: completedSets, feedback, perceivedEffort,
        rpeCorrections, duration, muscleVolume,
      });

      queueClear(offlineSessionId.current);

      clearRestStart();
      try { sessionStorage.removeItem(WORKOUT_START_KEY); } catch {}

      toast.success('Workout saved! 💪');
      setShowConfetti(true);
      setTimeout(() => {
        setShowConfetti(false);
        navigate('/dashboard');
      }, 900);
    } catch {
      toast.error('Failed to save');
    }
  };

  // ── Loading / empty guards ──────────────────────────────────────────────────

  if (!dayName) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-muted border-t-primary mx-auto" />
          <p className="mt-3 text-sm text-muted-foreground animate-pulse">Loading workout...</p>
        </div>
      </div>
    );
  }

  if (exercises.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center border-0 shadow-lg">
          <CardContent className="pt-8 pb-8">
            <p className="text-muted-foreground mb-4">No exercises found for {dayName}</p>
            <Button onClick={() => navigate('/workout-builder')}>Edit Workout</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Warmup screen ───────────────────────────────────────────────────────────

  if (currentPhase === 'warmup') {
    const progressionCount = Object.values(plans).filter(
      p => p.action === 'increase_weight'
    ).length;

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-violet-600 flex items-center justify-center p-4 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.1),transparent_50%)]" />
        <Card className="w-full max-w-md relative z-10 border-0 shadow-2xl shadow-black/10">
          <CardContent className="pt-4 space-y-4">
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => navigate('/plan')}
              >
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-3 w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Clock className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold">{dayName}</h2>
              <p className="text-muted-foreground text-sm">
                {exercises.length} exercises
                {progressionCount > 0 && (
                  <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-medium">
                    · {progressionCount} ready to progress ↑
                  </span>
                )}
              </p>
            </div>

            <div className="bg-card rounded-xl p-3 text-sm space-y-1 border border-border/50">
              <p className="font-medium">Warm up first (5–10 min)</p>
              <p className="text-muted-foreground">• Light cardio + dynamic stretches</p>
              <p className="text-muted-foreground">• 1–2 warm-up sets at ~50% working weight</p>
            </div>

            {(() => {
              const adjusted = exercises.filter(ex => {
                const plan = plans[exerciseKey(ex)];
                return plan && !plan.isFirstSession && plan.action !== 'insufficient_data';
              });
              if (adjusted.length === 0) return null;
              return (
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => setShowRPEInfo(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <HelpCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>How are weights chosen?</span>
                  </button>
                </div>
              );
            })()}
            {showRPEInfo && (
              <div className="bg-muted/60 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
                Weights are based on your last session. If you rated a session as very easy or very hard,
                the weight was automatically adjusted for today. Your effort rating after this workout
                will fine-tune it further.
              </div>
            )}

            <div className="space-y-1">
              {exercises.map((ex, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-sm py-1.5 border-b border-border/50 last:border-0"
                >
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs flex-shrink-0 font-medium">
                    {i + 1}
                  </span>
                  <span className="flex-1">{ex.name}</span>
                  {(() => {
                    const p = plans[exerciseKey(ex)];
                    if (!p) return null;
                    const wStr = formatWeight(p.suggestedWeight, p.mode ?? 'dumbbell');
                    if (p.action === 'increase_weight') return (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">↑ {wStr}</span>
                    );
                    if (p.action === 'deload') return (
                      <span className="text-xs text-amber-600 dark:text-amber-400">↓ {wStr}</span>
                    );
                    if (p.source === 'estimated' && p.suggestedWeight > 0) return (
                      <span className="text-xs text-muted-foreground">{wStr}</span>
                    );
                    if (p.source === 'history' && p.action === 'maintain' && p.suggestedWeight > 0) return (
                      <span className="text-xs text-muted-foreground">{wStr}</span>
                    );
                    if (p.mode === 'bodyweight') return (
                      <span className="text-xs text-muted-foreground">{p.suggestedReps[0]}–{p.suggestedReps[1]} reps</span>
                    );
                    return null;
                  })()}
                </div>
              ))}
            </div>

            <Button
              className="w-full rounded-xl h-12 font-semibold bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-lg shadow-emerald-500/25"
              size="lg"
              onClick={() => {
                const startMs = Date.now();
                startTimeRef.current = startMs;
                saveWorkoutStart(startMs);
                queueStart(offlineSessionId.current, dayName!);
                setCurrentPhase('exercise');
              }}
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
    const durationMin    = Math.round((Date.now() - startTimeRef.current) / 60000);

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 flex items-center justify-center p-4 relative">
        <Celebration show={showConfetti} />
        <Card className="w-full max-w-md relative z-10 border-0 shadow-2xl">
          <CardContent className="pt-6 space-y-4">
            <div className="text-center">
              <div className="mx-auto mb-3 w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold">Workout Complete!</h2>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { value: completedSets.length, label: 'sets' },
                { value: new Set(completedSets.map(s => s.exerciseId)).size, label: 'exercises' },
                { value: `${durationMin}m`, label: 'duration' },
              ].map(({ value, label }) => (
                <div key={label} className="bg-green-50 dark:bg-green-950/30 rounded-lg py-3">
                  <div className="text-xl font-bold text-green-700 dark:text-green-300">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            {totalVolume > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Total volume</p>
                <p className="text-2xl font-bold">
                  {Math.round(totalVolume / 1000 * 10) / 10}
                  <span className="text-sm text-muted-foreground ml-1">tonnes</span>
                </p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">
                How hard was it? (RPE 1–10)
              </label>
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
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {perceivedEffort <= 3 ? 'Too easy'
                  : perceivedEffort <= 5 ? 'Slightly easy'
                  : perceivedEffort <= 7 ? 'Just right'
                  : perceivedEffort <= 8 ? 'Hard'
                  : 'Very hard'}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Notes (optional)</label>
              <Textarea
                placeholder="Anything to note for next time?"
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                rows={2}
              />
            </div>

            <Button
              onClick={handleWorkoutComplete}
              className="w-full rounded-xl h-12 font-semibold bg-gradient-to-r from-emerald-500 to-green-600"
              size="lg"
            >
              Save & Finish
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Exercise screen ─────────────────────────────────────────────────────────

  const currentExercise     = exercises[currentExerciseIndex];
  const currentKey          = exerciseKey(currentExercise);
  const plan                = plans[currentKey];
  const tier                = classifyExercise(currentExercise.name);
  const [repLo, repHi]      = plan?.suggestedReps ?? getRepTarget(tier);
  const exerciseSets        = completedSets.filter(s => s.exerciseId === currentKey);
  const setsForThisExercise = plan?.sets ?? 3;
  const totalSetsAll        = exercises.reduce(
    (sum, ex) => sum + (plans[exerciseKey(ex)]?.sets ?? 3),
    0
  );
  const progressPct     = Math.round((completedSets.length / Math.max(1, totalSetsAll)) * 100);
  const weightMode      = plan?.mode ?? getWeightMode(currentExercise.name, currentExercise.equipment || 'full_gym', tier);
  const modeConfig      = getWeightModeConfig(weightMode);
  const isBodyweight    = weightMode === 'bodyweight';
  const plates          = !isBodyweight ? plateSuggestion(parseFloat(customWeight) || 0, weightMode) : '';

  const repFeedback = (() => {
    const r = parseInt(customReps);
    if (!r || isNaN(r)) return null;
    if (r > repHi)  return { msg: `${r} reps — above target, consider adding weight next set`, color: 'text-blue-600 dark:text-blue-400' };
    if (r < repLo)  return { msg: `${r} reps — below target, reduce weight if needed`, color: 'text-amber-600 dark:text-amber-400' };
    return { msg: `${r} reps ✓`, color: 'text-emerald-600 dark:text-emerald-400' };
  })();

  return (
    <div className="min-h-screen bg-background pb-page">
      {/* Sticky header */}
      <div className="bg-card/80 backdrop-blur-xl border-b border-border/50 sticky top-0 z-10 px-4 py-2.5">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{dayName}</p>
            <p className="font-semibold text-sm">
              Ex. {currentExerciseIndex + 1}/{exercises.length} · Set {currentSet}/{setsForThisExercise}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{progressPct}%</p>
              <Progress value={progressPct} className="w-20 h-1.5 mt-0.5" />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-red-500 h-8 px-2"
              onClick={() => setShowExitDialog(true)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <ExitDialog
        open={showExitDialog}
        hasSets={completedSets.length > 0}
        onChoice={handleExitChoice}
      />

      {/* Rest timer */}
      {restTimer > 0 && (
        <div className="sticky top-[57px] z-10 bg-blue-600 dark:bg-blue-700">
          <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-white text-xs font-semibold uppercase tracking-wide opacity-80">Rest</span>
              <span className="text-white text-xl font-bold tabular-nums">
                {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, '0')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-20 h-1.5 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${((REST_DURATION - restTimer) / REST_DURATION) * 100}%` }}
                />
              </div>
              <button
                onClick={() => { setRestTimer(0); clearRestStart(); }}
                className="text-white/80 hover:text-white text-xs font-medium py-1 px-2 rounded bg-white/20 hover:bg-white/30 transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`max-w-2xl mx-auto px-4 space-y-4 ${restTimer > 0 ? 'pt-4' : 'pt-4'}`}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
              <div className="flex-1 pr-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-xl leading-tight">{currentExercise.name}</CardTitle>
                  {plan && <SuggestionPill plan={plan} />}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {currentExercise.primaryMuscles?.map((m: string) => (
                    <Badge key={m} className="text-xs">{m.replace(/_/g, ' ')}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Target: {repLo}–{repHi} reps
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => advanceExercise(completedSets)}
                className="text-muted-foreground flex-shrink-0"
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {isBodyweight ? (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Reps</label>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0"
                      onClick={() => setCustomReps(r => String(Math.max(1, parseInt(r || '1') - 1)))}>
                      <Minus className="w-3 h-3" />
                    </Button>
                    <Input type="number" placeholder="reps" value={customReps}
                      onChange={e => setCustomReps(e.target.value)} className="text-center font-medium" />
                    <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0"
                      onClick={() => setCustomReps(r => String(parseInt(r || '0') + 1))}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {!showExtraWeight ? (
                  <button
                    onClick={() => setShowExtraWeight(true)}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add weight (vest / belt / plate)
                  </button>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-medium">Added weight (kg)</label>
                      <button onClick={() => { setShowExtraWeight(false); setCustomWeight('0'); }}
                        className="text-xs text-muted-foreground hover:text-foreground">Remove</button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0"
                        onClick={() => setCustomWeight(w => String(Math.max(0, Math.round((parseFloat(w||'0') - modeConfig.step) * 10) / 10)))}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <Input type="number" placeholder="0" value={customWeight === '0' ? '' : customWeight}
                        onChange={e => setCustomWeight(e.target.value)} className="text-center font-medium" />
                      <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0"
                        onClick={() => setCustomWeight(w => String(Math.round((parseFloat(w||'0') + modeConfig.step) * 10) / 10))}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Vest, dip belt, or plate held between feet</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium">{modeConfig.inputLabel}</label>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0"
                      onClick={() => setCustomWeight(w =>
                        String(Math.max(0, Math.round((parseFloat(w||'0') - modeConfig.step) * 10) / 10))
                      )}>
                      <Minus className="w-3 h-3" />
                    </Button>
                    <Input type="number" placeholder="0" value={customWeight}
                      onChange={e => setCustomWeight(e.target.value)} className="text-center font-medium" />
                    <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0"
                      onClick={() => setCustomWeight(w =>
                        String(Math.round((parseFloat(w||'0') + modeConfig.step) * 10) / 10)
                      )}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  {modeConfig.hint && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{modeConfig.hint}</p>
                  )}
                  {plates && (
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">{plates}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Reps</label>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0"
                      onClick={() => setCustomReps(r => String(Math.max(1, parseInt(r||'1') - 1)))}>
                      <Minus className="w-3 h-3" />
                    </Button>
                    <Input type="number" placeholder="reps" value={customReps}
                      onChange={e => setCustomReps(e.target.value)} className="text-center font-medium" />
                    <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0"
                      onClick={() => setCustomReps(r => String(parseInt(r||'0') + 1))}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {repFeedback && (
              <p className={`text-xs ${repFeedback.color}`}>{repFeedback.msg}</p>
            )}

            <Button
              onClick={handleSetComplete}
              className="w-full rounded-xl h-12 font-semibold bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-lg shadow-emerald-500/25"
              size="lg"
            >
              <Check className="w-5 h-5 mr-2" />
              Complete Set {currentSet}
            </Button>

            {exerciseSets.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">This exercise</p>
                <div className="space-y-1">
                  {exerciseSets.map((s, i) => {
                    const e1rm = s.weight > 0 ? Math.round(s.weight * (1 + s.reps / 30)) : null;
                    return (
                      <div
                        key={i}
                        className="flex justify-between items-center text-sm bg-muted/50 rounded px-3 py-1.5"
                      >
                        <span className="text-muted-foreground">Set {s.set}</span>
                        <span className="font-medium">
                          {(() => {
                            if (weightMode === 'bodyweight') {
                              return s.weight > 0
                                ? `${s.reps} reps +${s.weight} kg`
                                : `${s.reps} reps`;
                            }
                            if (weightMode === 'dumbbell') return `${s.weight} kg/side × ${s.reps}`;
                            if (weightMode === 'smith')    return `${s.weight} kg plates × ${s.reps}`;
                            return `${s.weight} kg × ${s.reps}`;
                          })()}
                        </span>
                        {e1rm && weightMode !== 'bodyweight' && (
                          <span className="text-xs text-muted-foreground">~{e1rm} kg 1RM</span>
                        )}
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
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">How to perform</p>
              <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                {currentExercise.instructions}
              </p>
            </CardContent>
          </Card>
        )}

        {currentExerciseIndex < exercises.length - 1 && (
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Up next</p>
              <div className="space-y-1.5">
                {exercises.slice(currentExerciseIndex + 1, currentExerciseIndex + 4).map((ex, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs flex-shrink-0">
                      {currentExerciseIndex + 2 + i}
                    </span>
                    <span className="flex-1">{ex.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}