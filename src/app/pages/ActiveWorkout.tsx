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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { profileApi, planApi, workoutApi } from '../../utils/api';
import { toast } from 'sonner';
import {
  Clock, Check, Trophy, X, TrendingUp, TrendingDown,
  HelpCircle, MoreVertical, ArrowDown, SkipForward, Minus, Plus,
  ChevronDown, ChevronUp, ArrowUp, ArrowUpDown, PlusCircle, Volume2, VolumeX,
} from 'lucide-react';
import {
  computeAllSuggestions,
  classifyExercise,
  getRepTarget,
  buildHistoryKey,
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
  formatEquipmentLabel,
  type WeightMode,
} from '../../utils/exerciseWeightMode';
import { getMovementId } from '../../data/exercises';
import { getMovementDisplayName } from '../../utils/exerciseGrouping';
import {
  generateSessionId, queueStart, queueUpdate,
  queueMarkPending, queueClear,
} from '../../utils/offlineQueue';
import Celebration from '../components/ui/celebration';
import {
  maybePlayTimerDone, maybePlaySetComplete,
  getSoundEnabled, setSoundEnabled, unlockAudio,
} from '../../utils/timerSound';
import { AddExerciseDrawer, type AddExerciseResult } from '../components/AddExerciseDrawer';
import { SetCompletePulse } from '../components/ui/SetCompletePulse';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SetLog {
  exerciseId:    string;
  exerciseName:  string;
  set:           number;
  weight:        number;
  reps:          number;
  timestamp:     string;
  /** Phase 2: equipment type for equipment-aware history keys */
  equipmentType?: string;
}

interface ExercisePlan {
  suggestedWeight:  number;
  suggestedReps:    [number, number];
  sets:             number;
  source:           'history' | 'estimated' | 'bodyweight';
  action?:          ProgressionSuggestion['action'];
  isFirstSession:   boolean;
  mode:             WeightMode;
  /** Phase 2: equipment type used to build the history key */
  equipmentType?:   string;
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

// ─── Phase 2: Stable exercise key helper ──────────────────────────────────────

/**
 * Builds the history key for an exercise plan entry.
 * Uses composite key when equipmentType is known.
 */
function exerciseHistoryKey(ex: {
  id?: string;
  name: string;
  equipmentType?: string;
}): string {
  const baseId = (ex.id && ex.id.trim() !== '') ? ex.id : ex.name;
  return buildHistoryKey(baseId, ex.name, ex.equipmentType);
}

/** Plain base ID (no equipment suffix) — used for plan lookup */
function exerciseBaseKey(ex: { id?: string; name: string }): string {
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

// ─── Phase 5: Reorder dialog ───────────────────────────────────────────────────

function ReorderDialog({
  open,
  queue,
  onClose,
  onReorder,
}: {
  open: boolean;
  queue: any[];
  onClose: () => void;
  onReorder: (newQueue: any[]) => void;
}) {
  const [localQueue, setLocalQueue] = useState<any[]>([]);

  useEffect(() => {
    if (open) setLocalQueue([...queue]);
  }, [open, queue]);

  const move = (idx: number, dir: -1 | 1) => {
    const newQ = [...localQueue];
    const target = idx + dir;
    if (target < 0 || target >= newQ.length) return;
    [newQ[idx], newQ[target]] = [newQ[target], newQ[idx]];
    setLocalQueue(newQ);
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Reorder Exercises</AlertDialogTitle>
          <AlertDialogDescription>
            Drag or use arrows to change the order for this session.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 my-2 max-h-64 overflow-y-auto">
          {localQueue.map((ex, i) => (
            <div
              key={exerciseBaseKey(ex)}
              className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
            >
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-muted-foreground/60 hover:text-foreground disabled:opacity-20 leading-none p-0.5"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === localQueue.length - 1}
                  className="text-muted-foreground/60 hover:text-foreground disabled:opacity-20 leading-none p-0.5"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>
              <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs flex-shrink-0 font-medium">
                {i + 1}
              </span>
              <span className="text-sm flex-1 truncate">{ex.name}</span>
            </div>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { onReorder(localQueue); onClose(); }}>
            Apply
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

const REST_DURATION = 120;

export function ActiveWorkout() {
  const location = useLocation();
  const navigate  = useNavigate();
  const dayName   = location.state?.dayName as string | undefined;

  const [exercises, setExercises]         = useState<any[]>([]);
  const [exerciseQueue, setExerciseQueue] = useState<any[]>([]);
  const [deferredIds, setDeferredIds]     = useState<Set<string>>(new Set());
  // Phase 3.4: track ad-hoc (mid-workout added) exercise IDs
  const [adHocIds, setAdHocIds]           = useState<Set<string>>(new Set());
  const [totalPlanned, setTotalPlanned]   = useState(0);

  const [plans, setPlans]                 = useState<Record<string, ExercisePlan>>({});
  const [currentPhase, setCurrentPhase]   = useState<'warmup' | 'exercise' | 'feedback'>('warmup');
  const [currentSet, setCurrentSet]       = useState(1);
  const [restTimer, setRestTimer]         = useState(0);
  const [completedSets, setCompletedSets] = useState<SetLog[]>([]);
  const [feedback, setFeedback]           = useState('');
  const [perceivedEffort, setPerceivedEffort] = useState(6);
  const [customWeight, setCustomWeight]   = useState('');
  const [customReps, setCustomReps]       = useState('');
  const [loading, setLoading]             = useState(true);
  const [showExitDialog, setShowExitDialog]     = useState(false);
  const [showReorderDialog, setShowReorderDialog] = useState(false);
  // Phase 5.4: set complete pulse animation
  const [showPulse, setShowPulse]             = useState(false);

  // Phase 5.2: sound preference — read from localStorage, toggle in UI
  const [soundEnabled, setSoundEnabledState] = useState(() => getSoundEnabled());
  const toggleSound = () => {
    setSoundEnabledState(prev => {
      const next = !prev;
      setSoundEnabled(next);
      return next;
    });
  };

  // Phase 3.2: mid-workout add exercise
  const [showAddExercise, setShowAddExercise]     = useState(false);
  const [showConfetti, setShowConfetti]   = useState(false);
  const [showExtraWeight, setShowExtraWeight] = useState(false);
  const [showRPEInfo, setShowRPEInfo]     = useState(false);
  // Phase 4: collapsible instructions — collapsed by default
  const [showInstructions, setShowInstructions] = useState(false);

  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const offlineSessionId = useRef<string>(generateSessionId());
  const startTimeRef     = useRef<number>(loadWorkoutStart());
  // Phase 3.3: stable ref so handleAddExercise has fresh profile without stale closures
  const profileRef       = useRef<any>(null);

  const currentExercise = exerciseQueue[0];

  useEffect(() => {
    if (!dayName) { navigate('/plan', { replace: true }); return; }
    loadWorkout();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [dayName]);

  // Phase 4: reset instructions collapsed state when exercise changes
  useEffect(() => {
    setShowInstructions(false);
  }, [currentExercise?.id, currentExercise?.name]);

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
          maybePlayTimerDone();   // Phase 5.2
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

      profileRef.current = profile;   // keep ref in sync for handleAddExercise
      const exs: any[] = planResult?.workouts?.[dayName!] || [];
      setExercises(exs);
      setExerciseQueue([...exs]);
      setTotalPlanned(exs.length);

      const historySuggestions = computeAllSuggestions(history as WorkoutLog[]);
      const builtPlans: Record<string, ExercisePlan> = {};

      for (const ex of exs) {
        // Phase 2: use composite key (with equipmentType) for history lookup
        const histKey  = exerciseHistoryKey(ex);
        const baseKey  = exerciseBaseKey(ex);
        const tier     = classifyExercise(ex.name);
        const [repLo, repHi] = getRepTarget(tier);
        const planSets = (ex.sets && ex.sets >= 1 && ex.sets <= 6) ? ex.sets : 3;

        // Try composite key first, fall back to base key (legacy history)
        const historySuggestion =
          historySuggestions[histKey] ??
          historySuggestions[baseKey];

        // Phase 2: resolve equipment type from exercise definition
        const equipType: string | undefined =
          ex.selectedEquipmentType ?? ex.equipmentType ?? undefined;

        const mode = getWeightMode(
          ex.name,
          ex.selectedEquipmentType ?? ex.equipmentType ?? ex.equipment ?? 'full_gym',
          tier,
        );

        if (historySuggestion && historySuggestion.action !== 'insufficient_data') {
          let w: number = historySuggestion.currentWeight;
          let reps: [number, number] = historySuggestion.suggestedReps ?? [repLo, repHi];

          switch (historySuggestion.action) {
            case 'increase_weight': w    = historySuggestion.suggestedWeight ?? w; break;
            case 'deload':          w    = historySuggestion.suggestedWeight ?? w; break;
            case 'increase_reps':   reps = historySuggestion.suggestedReps   ?? reps; break;
          }

          builtPlans[histKey] = {
            suggestedWeight: w,
            suggestedReps:   reps,
            sets:            planSets,
            source:          tier === 'bodyweight' ? 'bodyweight' : 'history',
            action:          historySuggestion.action,
            isFirstSession:  false,
            mode,
            equipmentType:   equipType,
          };
        } else if (profile) {
          const estimate = estimateStartingWeight(ex.name, profile, ex.id || undefined);
          builtPlans[histKey] = {
            suggestedWeight: estimate.weight,
            suggestedReps:   estimate.reps,
            sets:            planSets,
            source:          tier === 'bodyweight' ? 'bodyweight' : 'estimated',
            isFirstSession:  true,
            mode:            estimate.mode,
            equipmentType:   equipType,
          };
        } else {
          builtPlans[histKey] = {
            suggestedWeight: 0,
            suggestedReps:   [repLo, repHi],
            sets:            planSets,
            source:          tier === 'bodyweight' ? 'bodyweight' : 'estimated',
            isFirstSession:  true,
            mode,
            equipmentType:   equipType,
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
    const key  = exerciseHistoryKey(ex);
    const plan = allPlans[key] ?? allPlans[exerciseBaseKey(ex)];
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

  // ── Queue management ──────────────────────────────────────────────────────────

  const handleDoLater = () => {
    if (exerciseQueue.length <= 1) {
      toast.info('This is the last exercise — finish or skip it.');
      return;
    }
    const [current, ...rest] = exerciseQueue;
    const key = exerciseBaseKey(current);
    setDeferredIds(prev => new Set([...prev, key]));
    const newQueue = [...rest, current];
    setExerciseQueue(newQueue);
    setCurrentSet(1);
    setRestTimer(0);
    setShowExtraWeight(false);
    clearRestStart();
    applyPlanToInputs(newQueue[0], plans);
    toast('Moved to end — you\'ll come back to it.', { icon: '🔄' });
  };

  const handleSkipEntirely = () => {
    const newQueue = exerciseQueue.slice(1);
    if (newQueue.length === 0) {
      setCurrentPhase('feedback');
      return;
    }
    setExerciseQueue(newQueue);
    setCurrentSet(1);
    setRestTimer(0);
    setShowExtraWeight(false);
    clearRestStart();
    applyPlanToInputs(newQueue[0], plans);
    toast('Exercise skipped for today.', { icon: '⏭' });
  };

  // Phase 5: apply reordered queue
  // Phase 3.3: add an exercise mid-workout — build a plan entry and append to queue
  const handleAddExercise = ({ exercise, equipmentType }: AddExerciseResult) => {
    const profile = profileRef.current;
    const tier     = classifyExercise(exercise.name);
    const [repLo, repHi] = getRepTarget(tier);
    const mode = getWeightMode(
      exercise.selectedEquipmentType ?? equipmentType ?? exercise.equipmentType ?? 'other',
    );
    const histKey = buildHistoryKey(exercise.id || exercise.name, exercise.name, equipmentType);
    const existing = plans[histKey];
    let suggestedWeight = existing?.suggestedWeight ?? 0;
    let source: 'history' | 'estimated' | 'bodyweight' = existing?.source ?? 'estimated';
    if (!existing) {
      try {
        const est = estimateStartingWeight(exercise.name, profile, exercise.id || undefined);
        suggestedWeight = est.weight;
        source = est.isBodyweight ? 'bodyweight' : 'estimated';
      } catch { suggestedWeight = 0; }
    }
    const newPlan: ExercisePlan = {
      suggestedWeight,
      suggestedReps: [repLo, repHi],
      sets: 3,
      source,
      action: existing?.action,
      isFirstSession: !existing,
      mode,
      equipmentType,
    };
    const exWithEquip = { ...exercise, selectedEquipmentType: equipmentType };
    setExerciseQueue(prev => [...prev, exWithEquip]);
    setPlans(prev => ({ ...prev, [histKey]: newPlan }));
    // Mark as ad-hoc so it doesn't count against skipped exercises
    setAdHocIds(prev => new Set(prev).add(exercise.id || exercise.name));
    toast.success(`\${exercise.name} added to queue`);
  };

  const handleReorder = (newQueue: any[]) => {
    setExerciseQueue(newQueue);
    setCurrentSet(1);
    setRestTimer(0);
    setShowExtraWeight(false);
    clearRestStart();
    applyPlanToInputs(newQueue[0], plans);
    toast('Exercise order updated.', { icon: '↕️' });
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

  // ── Phase 3: Additional sets (log extra set beyond plan) ──────────────────────

  const handleAddExtraSet = () => {
    if (!currentExercise) return;
    const key     = exerciseHistoryKey(currentExercise);
    const plan    = plans[key] ?? plans[exerciseBaseKey(currentExercise)];
    const newPlan = { ...plan, sets: (plan?.sets ?? 3) + 1 };
    setPlans(prev => ({ ...prev, [key]: newPlan }));
    // Pre-fill with last logged weight/reps for this exercise
    const lastSet = [...completedSets]
      .filter(s => s.exerciseId === (key.includes('::') ? key.split('::')[0] : key))
      .pop();
    if (lastSet) {
      setCustomWeight(lastSet.weight > 0 ? String(lastSet.weight) : customWeight);
      setCustomReps(String(lastSet.reps));
    }
    toast('Extra set added.', { icon: '➕' });
  };

  // ── Set / exercise flow ──────────────────────────────────────────────────────

  const handleSetComplete = () => {
    if (!currentExercise) return;

    const weight = parseFloat(customWeight) || 0;
    const reps   = parseInt(customReps) || 0;
    if (reps <= 0) { toast.error('Enter reps'); return; }

    const histKey  = exerciseHistoryKey(currentExercise);
    const baseKey  = exerciseBaseKey(currentExercise);
    const plan     = plans[histKey] ?? plans[baseKey];
    const tier     = classifyExercise(currentExercise.name);
    const mode     = plan?.mode ?? getWeightMode(
      currentExercise.name,
      currentExercise.selectedEquipmentType ?? currentExercise.equipmentType ?? currentExercise.equipment ?? 'full_gym',
      tier,
    );
    const isBodyweightMode = mode === 'bodyweight';

    if (!isBodyweightMode && weight <= 0) { toast.error('Enter weight'); return; }

    const loggedWeight = isBodyweightMode
      ? (showExtraWeight ? weight : 0)
      : weight;

    const newSet: SetLog = {
      exerciseId:    baseKey,
      exerciseName:  currentExercise.name,
      set:           currentSet,
      weight:        loggedWeight,
      reps,
      timestamp:     new Date().toISOString(),
      // Phase 2: attach equipment type for composite history key
      equipmentType: plan?.equipmentType,
    };

    unlockAudio();                                // Phase 5.2: ensure iOS audio unlocked on gesture
    maybePlaySetComplete();                       // Phase 5.2: soft tick on set log
    // Phase 5.4: brief pulse animation
    setShowPulse(true);
    setTimeout(() => setShowPulse(false), 700);
    const newCompleted = [...completedSets, newSet];
    setCompletedSets(newCompleted);
    queueUpdate(offlineSessionId.current, newCompleted);

    const modeForToast = plan?.mode ?? 'dumbbell';
    const weightDisplay = isBodyweightMode
      ? (showExtraWeight && weight > 0 ? `+${weight} kg, ` : '')
      : `${weight} ${modeForToast === 'dumbbell' ? 'kg/side' : modeForToast === 'machine' ? 'kg' : modeForToast === 'smith' ? 'kg plates' : 'kg'}, `;
    toast.success(`Set ${currentSet} ✓ — ${weightDisplay}${reps} reps`);

    const setsForThisExercise = plan?.sets ?? 3;

    if (currentSet < setsForThisExercise) {
      setCurrentSet(currentSet + 1);
      startRestTimer();
    } else {
      advanceQueue(newCompleted);
    }
  };

  const advanceQueue = (current: SetLog[]) => {
    const newQueue = exerciseQueue.slice(1);
    if (newQueue.length === 0) {
      setCurrentPhase('feedback');
    } else {
      setExerciseQueue(newQueue);
      setCurrentSet(1);
      setRestTimer(0);
      setShowExtraWeight(false);
      clearRestStart();
      applyPlanToInputs(newQueue[0], plans);
    }
  };

  const handleWorkoutComplete = async () => {
    try {
      const rpeCorrections: Record<string, number> = {};
      for (const ex of exercises) {
        const histKey = exerciseHistoryKey(ex);
        const plan    = plans[histKey] ?? plans[exerciseBaseKey(ex)];
        if (plan?.isFirstSession && plan.source === 'estimated') {
          const { newWeight } = applyFirstSessionRPECorrection(
            plan.suggestedWeight,
            perceivedEffort,
            classifyExercise(ex.name),
          );
          rpeCorrections[histKey] = newWeight;
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

  // ── Guards ──────────────────────────────────────────────────────────────────

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
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate('/plan')}>
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
                const histKey = exerciseHistoryKey(ex);
                const plan    = plans[histKey] ?? plans[exerciseBaseKey(ex)];
                return plan && !plan.isFirstSession && plan.action !== 'insufficient_data';
              });
              if (adjusted.length === 0) return null;
              return (
                <button
                  onClick={() => setShowRPEInfo(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>How are weights chosen?</span>
                </button>
              );
            })()}
            {showRPEInfo && (
              <div className="bg-muted/60 rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
                Weights are based on your last session. If you rated a session as very easy or very hard,
                the weight was automatically adjusted for today.
              </div>
            )}

            <div className="space-y-1">
              {exercises.map((ex, i) => {
                const histKey = exerciseHistoryKey(ex);
                const p       = plans[histKey] ?? plans[exerciseBaseKey(ex)];
                return (
                  <div key={i} className="flex items-center gap-2 text-sm py-1.5 border-b border-border/50 last:border-0">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs flex-shrink-0 font-medium">
                      {i + 1}
                    </span>
                    <span className="flex-1">{ex.name}</span>
                    {p && (() => {
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
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              You can reorder or skip exercises any time during the workout.
            </p>

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
    const totalVolume   = completedSets.reduce((s, x) => s + x.weight * x.reps, 0);
    const durationMin   = Math.round((Date.now() - startTimeRef.current) / 60000);
    // Phase 3.4: ad-hoc exercises are never counted as skipped
    const plannedIds    = exercises.filter(e => !adHocIds.has(e.id || e.name)).map(e => e.id || e.name);
    const completedIds  = new Set(completedSets.map(s => s.exerciseId));
    const skippedCount  = plannedIds.filter(id => !completedIds.has(id)).length;

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 flex items-center justify-center p-4 relative">
        <Celebration show={showConfetti} />
      <SetCompletePulse show={showPulse} />
        <Card className="w-full max-w-md relative z-10 border-0 shadow-2xl">
          <CardContent className="pt-6 space-y-4">
            <div className="text-center">
              <div className="mx-auto mb-3 w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold">Workout Complete!</h2>
              {skippedCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {skippedCount} exercise{skippedCount > 1 ? 's' : ''} skipped today
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { value: completedSets.length,                                          label: 'sets' },
                { value: new Set(completedSets.map(s => s.exerciseId)).size,           label: 'exercises' },
                { value: `${durationMin}m`,                                             label: 'duration' },
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
              <label className="text-sm font-medium mb-2 block">How hard was it? (RPE 1–10)</label>
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

  if (!currentExercise) return null;

  const histKey             = exerciseHistoryKey(currentExercise);
  const baseKey             = exerciseBaseKey(currentExercise);
  const plan                = plans[histKey] ?? plans[baseKey];
  const tier                = classifyExercise(currentExercise.name);
  const [repLo, repHi]      = plan?.suggestedReps ?? getRepTarget(tier);
  const exerciseSets        = completedSets.filter(s => s.exerciseId === baseKey);
  const setsForThisExercise = plan?.sets ?? 3;
  const isDeferred          = deferredIds.has(baseKey);

  const totalSetsAll = exercises.reduce(
    (sum, ex) => sum + (plans[exerciseHistoryKey(ex)]?.sets ?? plans[exerciseBaseKey(ex)]?.sets ?? 3),
    0
  );
  const progressPct = Math.round((completedSets.length / Math.max(1, totalSetsAll)) * 100);

  const weightMode   = plan?.mode ?? getWeightMode(
    currentExercise.name,
    currentExercise.selectedEquipmentType ?? currentExercise.equipmentType ?? currentExercise.equipment ?? 'full_gym',
    tier,
  );
  const modeConfig   = getWeightModeConfig(weightMode);
  const isBodyweight = weightMode === 'bodyweight';
  const plates       = !isBodyweight && weightMode !== 'machine'
    ? plateSuggestion(parseFloat(customWeight) || 0, weightMode)
    : '';

  const repFeedback = (() => {
    const r = parseInt(customReps);
    if (!r || isNaN(r)) return null;
    if (r > repHi) return { msg: `${r} reps — above target, consider adding weight next set`, color: 'text-blue-600 dark:text-blue-400' };
    if (r < repLo) return { msg: `${r} reps — below target, reduce weight if needed`, color: 'text-amber-600 dark:text-amber-400' };
    return { msg: `${r} reps ✓`, color: 'text-emerald-600 dark:text-emerald-400' };
  })();

  const upNextQueue = exerciseQueue.slice(1);

  return (
    <div className="min-h-screen bg-background pb-page">
      {/* Phase 5.4: set-complete pulse — overlaid on exercise screen */}
      <SetCompletePulse show={showPulse} />
      {/* Sticky header */}
      <div className="bg-card/80 backdrop-blur-xl border-b border-border/50 sticky top-0 z-10 px-4 py-2.5">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{dayName}</p>
            <p className="font-semibold text-sm">
              {exerciseQueue.length} left · Set {currentSet}/{setsForThisExercise}
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

      {/* Phase 3.2: Add exercise drawer */}
      <AddExerciseDrawer
        open={showAddExercise}
        onClose={() => setShowAddExercise(false)}
        onAdd={handleAddExercise}
        existingExerciseIds={new Set(exerciseQueue.map((e: any) => e.id || e.name))}
      />

      {/* Phase 5: Reorder dialog */}
      <ReorderDialog
        open={showReorderDialog}
        queue={exerciseQueue}
        onClose={() => setShowReorderDialog(false)}
        onReorder={handleReorder}
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
              {/* Phase 5.2: sound toggle in rest timer bar */}
              <button
                onClick={toggleSound}
                className="text-white/70 hover:text-white transition-colors p-1"
                aria-label={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
              >
                {soundEnabled
                  ? <Volume2 className="w-4 h-4" />
                  : <VolumeX className="w-4 h-4" />
                }
              </button>
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

      <div className="max-w-2xl mx-auto px-4 space-y-4 pt-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
              <div className="flex-1 pr-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-xl leading-tight">
                    {(() => {
                      // Phase 2.6: show "Movement (Equipment)" when equipment was explicitly selected
                      const equip = currentExercise.selectedEquipmentType ?? currentExercise.equipmentType;
                      const mid   = getMovementId(currentExercise);
                      const movName = getMovementDisplayName(mid);
                      // Only show equipment suffix if we have a clean movement name (differs from full name)
                      const showEquip = equip && movName.toLowerCase() !== currentExercise.name.toLowerCase();
                      return showEquip
                        ? <>{movName} <span className="text-base font-normal text-muted-foreground">({formatEquipmentLabel(equip!)})</span></>
                        : currentExercise.name;
                    })()}
                  </CardTitle>
                  {plan && <SuggestionPill plan={plan} />}
                  {isDeferred && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                      🔄 Coming back to this
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {currentExercise.primaryMuscles?.map((m: string) => (
                    <Badge key={m} className="text-xs">{m.replace(/_/g, ' ')}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Target: {repLo}–{repHi} reps
                  {/* Phase 1.3: show equipment mode label */}
                  {weightMode !== 'bodyweight' && (
                    <span className="ml-2 text-muted-foreground/60">· {modeConfig.inputLabel}</span>
                  )}
                </p>
              </div>

              {/* Exercise action menu — Phase 5: reorder button prominent */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground flex-shrink-0">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {/* Phase 5: Reorder as first option — most useful mid-workout action */}
                  <DropdownMenuItem
                    onClick={() => setShowReorderDialog(true)}
                    className="gap-2"
                  >
                    <ArrowUpDown className="w-4 h-4" />
                    Reorder exercises
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDoLater}
                    disabled={exerciseQueue.length <= 1}
                    className="gap-2"
                  >
                    <ArrowDown className="w-4 h-4" />
                    Do later
                    <span className="ml-auto text-xs text-muted-foreground">moves to end</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSkipEntirely}
                    className="gap-2 text-muted-foreground"
                  >
                    <SkipForward className="w-4 h-4" />
                    Skip today
                    <span className="ml-auto text-xs text-muted-foreground">removes it</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowAddExercise(true)}
                    className="gap-2 text-primary"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Add exercise
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

            {/* Phase 3: Completed sets log + Add extra set button */}
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
                            // Phase 1.3: machine shows plain kg
                            return `${s.weight} kg × ${s.reps}`;
                          })()}
                        </span>
                        {e1rm && weightMode !== 'bodyweight' && weightMode !== 'machine' && (
                          <span className="text-xs text-muted-foreground">~{e1rm} kg 1RM</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Phase 3: Add extra set — only show after all planned sets logged */}
                {currentSet > setsForThisExercise && (
                  <button
                    onClick={handleAddExtraSet}
                    className="mt-2 text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add another set
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Phase 4: Collapsible instructions — collapsed by default */}
        {currentExercise.instructions && (
          <Card>
            <button
              onClick={() => setShowInstructions(v => !v)}
              className="w-full flex items-center justify-between px-6 py-3 text-left"
            >
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                How to perform
              </p>
              {showInstructions
                ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              }
            </button>
            {showInstructions && (
              <CardContent className="pt-0 pb-4">
                <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                  {currentExercise.instructions}
                </p>
              </CardContent>
            )}
          </Card>
        )}

        {/* Up next — reflects live queue order */}
        {upNextQueue.length > 0 && (
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Up next</p>
                {/* Phase 5: quick reorder button in up-next panel */}
                <button
                  onClick={() => setShowReorderDialog(true)}
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                >
                  <ArrowUpDown className="w-3 h-3" /> Reorder
                </button>
              </div>
              <div className="space-y-1.5">
                {upNextQueue.slice(0, 4).map((ex, i) => {
                  const isDefEx = deferredIds.has(exerciseBaseKey(ex));
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs flex-shrink-0">
                        {i + 2}
                      </span>
                      <span className="flex-1">{ex.name}</span>
                      {isDefEx && (
                        <span className="text-xs text-violet-500 dark:text-violet-400 flex-shrink-0">moved</span>
                      )}
                    </div>
                  );
                })}
                {upNextQueue.length > 4 && (
                  <p className="text-xs text-muted-foreground pl-7">+{upNextQueue.length - 4} more</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
