import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { exerciseDatabase, type Exercise } from '../../data/exercises';
import { profileApi, planApi } from '../../utils/api';
import { toast } from 'sonner';
import { Search, Plus, Trash2, CheckCircle, Info, Minus, BedDouble } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';

// Exercise as stored in the plan — extends base Exercise with user-configured sets
export interface ExerciseWithSets extends Exercise {
  sets: number;
}

// ─── Muscle group normalization ───────────────────────────────────────────────
// Maps exercise primaryMuscles strings → canonical group names used in targets.
// This fixes the mismatch where MUSCLE_TARGETS used loose names that didn't
// match actual exercise muscle strings (e.g. "back" vs "lats"/"upper_back").

const MUSCLE_ALIASES: Record<string, string> = {
  // Chest
  chest:        'chest',
  upper_chest:  'chest',
  lower_chest:  'chest',
  // Back
  lats:         'back',
  upper_back:   'back',
  lower_back:   'back',
  traps:        'back',
  rhomboids:    'back',
  // Shoulders
  front_delts:  'shoulders',
  side_delts:   'shoulders',
  rear_delts:   'shoulders',
  delts:        'shoulders',
  // Arms
  biceps:       'biceps',
  triceps:      'triceps',
  // Legs
  quads:        'quads',
  quadriceps:   'quads',
  hamstrings:   'hamstrings',
  glutes:       'glutes',
  calves:       'calves',
  hip_flexors:  'hamstrings',
  // Core
  abs:          'core',
  core:         'core',
  obliques:     'core',
};

function normalizeMuscle(muscle: string): string {
  return MUSCLE_ALIASES[muscle.toLowerCase()] ?? muscle.toLowerCase();
}

// Day type → required muscle groups (using normalized names)
const MUSCLE_TARGETS: Record<string, string[]> = {
  push:  ['chest', 'shoulders', 'triceps'],
  pull:  ['back', 'biceps'],
  legs:  ['quads', 'hamstrings', 'glutes'],
  upper: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
  lower: ['quads', 'hamstrings', 'glutes'],
  full:  ['chest', 'back', 'quads', 'hamstrings'],
};

function getDayType(dayName: string): string {
  const n = dayName.toLowerCase();
  if (n.includes('push'))                        return 'push';
  if (n.includes('pull'))                        return 'pull';
  if (n.includes('leg') || n.includes('lower'))  return 'legs';
  if (n.includes('upper'))                       return 'upper';
  return 'full';
}

function assessWorkout(exercises: Exercise[], dayName: string) {
  if (exercises.length === 0) {
    return { score: 0, label: 'Empty', color: 'gray' as const, missing: [] };
  }

  const dayType = getDayType(dayName);
  const targets = MUSCLE_TARGETS[dayType] || MUSCLE_TARGETS.full;

  // Collect all normalized muscles from selected exercises
  const covered = new Set<string>();
  exercises.forEach(ex => {
    ex.primaryMuscles.forEach(m => covered.add(normalizeMuscle(m)));
    ex.secondaryMuscles.forEach(m => covered.add(normalizeMuscle(m)));
  });

  const missing = targets.filter(m => !covered.has(m));
  const coverage = Math.round(((targets.length - missing.length) / targets.length) * 100);

  let score = coverage;
  if (exercises.length >= 3 && exercises.length <= 8) score = Math.min(100, score + 10);
  const hasCompound = exercises.some(
    ex => ex.primaryMuscles.length >= 2 || ex.secondaryMuscles.length >= 2
  );
  if (hasCompound) score = Math.min(100, score + 10);

  const label = score >= 80 ? 'Complete' : score >= 60 ? 'Good' : score >= 40 ? 'Needs work' : 'Incomplete';
  const color = score >= 80 ? 'green' as const : score >= 60 ? 'yellow' as const : 'red' as const;
  return { score, label, color, missing };
}

function getAvailableMuscles(dayType: string): string[] {
  const categoryMap: Record<string, string[]> = {
    push:  ['push'],
    pull:  ['pull'],
    legs:  ['legs'],
    upper: ['push', 'pull'],
    lower: ['legs'],
  };
  const categories = categoryMap[dayType];
  const muscles = new Set<string>();
  exerciseDatabase
    .filter(ex => !categories || categories.includes(ex.category))
    .forEach(ex => ex.primaryMuscles.forEach(m => muscles.add(m)));
  return [...muscles].sort();
}

// ─── Component ────────────────────────────────────────────────────────────────

function defaultSets(profile: any): number {
  return profile?.experienceLevel === 'beginner' ? 2 : 3;
}

export function WorkoutBuilder() {
  const [profile, setProfile]                     = useState<any>(null);
  const [selectedExercises, setSelectedExercises] = useState<{ [key: string]: ExerciseWithSets[] }>({});
  const [restDays, setRestDays]                     = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery]             = useState('');
  const [currentDay, setCurrentDay]               = useState('');
  const [loading, setLoading]                     = useState(true);
  const [saving, setSaving]                       = useState(false);
  const [selectedMuscle, setSelectedMuscle]       = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const prof = await profileApi.get();
      setProfile(prof);

      try {
        const plan = await planApi.get();
        if (plan?.workouts && Object.keys(plan.workouts).length > 0) {
          setSelectedExercises(plan.workouts);
          setCurrentDay(Object.keys(plan.workouts)[0]);
          return;
        }
      } catch {
        // No plan yet
      }

      initializeDays(prof);
    } catch {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const initializeDays = (prof: any) => {
    const days: { [key: string]: ExerciseWithSets[] } = {};
    const style = prof?.workoutStyle;
    if      (style === 'full_body')   ['Day 1', 'Day 2', 'Day 3'].forEach(d => (days[d] = []));
    else if (style === 'upper_lower') ['Upper A', 'Lower A', 'Upper B', 'Lower B'].forEach(d => (days[d] = []));
    else if (style === 'ppl')         ['Push', 'Pull', 'Legs'].forEach(d => (days[d] = []));
    else if (style === 'bro_split')   ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs'].forEach(d => (days[d] = []));
    else                              ['Day 1', 'Day 2', 'Day 3'].forEach(d => (days[d] = []));
    setSelectedExercises(days);
    setCurrentDay(Object.keys(days)[0]);
  };

  const toggleRestDay = (day: string) => {
    setRestDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const getFilteredExercises = (): { suggested: Exercise[]; rest: Exercise[] } => {
    const all = exerciseDatabase.filter(ex => {
      if (profile?.equipment === 'bodyweight' && ex.equipment !== 'bodyweight') return false;
      if (profile?.equipment === 'limited'    && ex.equipment === 'full_gym')   return false;
      if (profile?.experienceLevel === 'beginner' && ex.difficulty === 'advanced') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          ex.name.toLowerCase().includes(q) ||
          ex.primaryMuscles.some(m => m.toLowerCase().includes(q))
        );
      }
      return true;
    }).filter(ex =>
      !selectedMuscle ||
      ex.primaryMuscles.includes(selectedMuscle) ||
      ex.secondaryMuscles.includes(selectedMuscle)
    );

    const dayType = getDayType(currentDay);
    const suggested = all.filter(ex => {
      if (dayType === 'push')  return ex.category === 'push';
      if (dayType === 'pull')  return ex.category === 'pull';
      if (dayType === 'legs')  return ex.category === 'legs';
      if (dayType === 'upper') return ex.category === 'push' || ex.category === 'pull';
      return true;
    });
    const suggestedIds = new Set(suggested.map(e => e.id));
    return { suggested, rest: all.filter(e => !suggestedIds.has(e.id)) };
  };

  const addExercise = (exercise: Exercise) => {
    const current = selectedExercises[currentDay] || [];
    if (current.some(e => e.id === exercise.id)) { toast.error('Already added'); return; }
    const withSets: ExerciseWithSets = { ...exercise, sets: defaultSets(profile) };
    setSelectedExercises(prev => ({ ...prev, [currentDay]: [...current, withSets] }));
  };

  const updateSets = (day: string, idx: number, delta: number) => {
    setSelectedExercises(prev => {
      const exs = [...(prev[day] || [])];
      const current = exs[idx];
      const newSets = Math.min(6, Math.max(1, (current.sets ?? defaultSets(profile)) + delta));
      exs[idx] = { ...current, sets: newSets };
      return { ...prev, [day]: exs };
    });
  };

  const removeExercise = (day: string, idx: number) => {
    setSelectedExercises(prev => ({ ...prev, [day]: prev[day].filter((_, i) => i !== idx) }));
  };

  const moveExercise = (day: string, idx: number, dir: -1 | 1) => {
    const exs    = [...(selectedExercises[day] || [])];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= exs.length) return;
    [exs[idx], exs[newIdx]] = [exs[newIdx], exs[idx]];
    setSelectedExercises(prev => ({ ...prev, [day]: exs }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Mark rest days by storing a special sentinel array with a rest flag
      const planToSave: Record<string, any[]> = {};
      for (const [day, exs] of Object.entries(selectedExercises)) {
        if (restDays.has(day)) {
          // Store rest day as empty array with __rest flag on first item
          planToSave[day] = [{ __rest: true }];
        } else {
          planToSave[day] = exs;
        }
      }
      await planApi.save(planToSave);
      toast.success('Plan saved!');
      navigate('/plan');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading builder...</p>
        </div>
      </div>
    );
  }

  const days             = Object.keys(selectedExercises);
  const currentExercises = selectedExercises[currentDay] || [];
  const { suggested, rest } = getFilteredExercises();
  const assessment       = assessWorkout(currentExercises, currentDay);
  const availableMuscles = getAvailableMuscles(getDayType(currentDay));

  // Assessment badge colors
  const assessmentBadgeClass = {
    green:  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    red:    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    gray:   'bg-muted text-muted-foreground',
  }[assessment.color];

  return (
    <div className="min-h-screen bg-background pb-20 overflow-x-hidden">
      {/* Header */}
      <div className="bg-card/80 backdrop-blur-xl border-b border-border/50 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex justify-between items-center min-w-0">
          <div className="min-w-0 flex-1 mr-3">
            <h1 className="font-bold text-lg tracking-tight truncate">Workout Builder</h1>
            <p className="text-xs text-muted-foreground truncate">
              {profile?.workoutStyle?.replace(/_/g, ' ')} · {days.length} days
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="flex-shrink-0 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-500/20"
          >
            {saving ? 'Saving...' : 'Save Plan'}
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-4 space-y-4 overflow-x-hidden">
        <Tabs
          value={currentDay}
          onValueChange={day => { setCurrentDay(day); setSelectedMuscle(null); }}
        >
          {/* Tab strip */}
          <div className="overflow-x-auto scrollbar-none -mx-4 px-4">
            <TabsList className="flex w-max min-w-full">
              {days.map(day => (
                <TabsTrigger key={day} value={day} className={`flex-shrink-0 whitespace-nowrap ${restDays.has(day) ? 'opacity-50' : ''}`}>
                  {restDays.has(day) ? <BedDouble className="w-3 h-3 mr-1 inline" /> : null}
                  {day}
                  {!restDays.has(day) && (
                    <span className="ml-1 text-xs opacity-60">
                      ({(selectedExercises[day] || []).length})
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {days.map(day => (
            <TabsContent key={day} value={day} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* LEFT — selected exercises */}
                <div className="space-y-3 min-w-0">
                  {/* Rest day toggle */}
                  <div className="flex items-center justify-between mb-1">
                    <button
                      onClick={() => toggleRestDay(day)}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                        restDays.has(day)
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      <BedDouble className="w-3 h-3" />
                      {restDays.has(day) ? 'Rest day (tap to undo)' : 'Mark as rest day'}
                    </button>
                  </div>

                  {/* If rest day, show overlay instead of exercise UI */}
                  {restDays.has(day) && (
                    <Card className="border-dashed border-2 border-muted">
                      <CardContent className="py-12 text-center">
                        <BedDouble className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">Rest day — no exercises scheduled</p>
                        <p className="text-xs text-muted-foreground mt-1">Active recovery, stretching, or full rest</p>
                      </CardContent>
                    </Card>
                  )}

                  {!restDays.has(day) && <>
                  {/* Inline assessment badge — single line, no card */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${assessmentBadgeClass}`}>
                      {assessment.score >= 70
                        ? <CheckCircle className="w-3 h-3" />
                        : <Info className="w-3 h-3" />
                      }
                      {assessment.label}
                    </span>

                    {/* Missing muscles — compact, only when actually missing */}
                    {assessment.missing.length > 0 && currentExercises.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        Missing: {assessment.missing.map(m => m.replace(/_/g, ' ')).join(', ')}
                      </span>
                    )}
                  </div>

                  <Card className="min-w-0">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">
                        Selected ({currentExercises.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {currentExercises.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          No exercises yet — add from the library below
                        </p>
                      ) : (
                        currentExercises.map((ex, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg group"
                          >
                            <div className="flex flex-col gap-0.5 flex-shrink-0">
                              <button
                                onClick={() => moveExercise(day, idx, -1)}
                                disabled={idx === 0}
                                className="text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-20 text-xs leading-none"
                              >▲</button>
                              <button
                                onClick={() => moveExercise(day, idx, 1)}
                                disabled={idx === currentExercises.length - 1}
                                className="text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-20 text-xs leading-none"
                              >▼</button>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{ex.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {ex.primaryMuscles.map(m => m.replace(/_/g, ' ')).join(', ')}
                              </p>
                            </div>
                            {/* Sets stepper */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => updateSets(day, idx, -1)}
                                disabled={(ex.sets ?? defaultSets(profile)) <= 1}
                                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs font-semibold w-8 text-center tabular-nums">
                                {ex.sets ?? defaultSets(profile)}×
                              </span>
                              <button
                                onClick={() => updateSets(day, idx, 1)}
                                disabled={(ex.sets ?? defaultSets(profile)) >= 6}
                                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => removeExercise(day, idx)}
                              className="text-muted-foreground/50 hover:text-red-500 transition-colors p-1 flex-shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  {/* Muscle coverage pills — informational, compact */}
                  {currentExercises.length > 0 && (() => {
                    const allMuscles = new Map<string, 'primary' | 'secondary'>();
                    currentExercises.forEach(ex => {
                      ex.primaryMuscles.forEach(m => allMuscles.set(m, 'primary'));
                      ex.secondaryMuscles.forEach(m => {
                        if (!allMuscles.has(m)) allMuscles.set(m, 'secondary');
                      });
                    });
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(allMuscles.entries()).map(([m, type]) => (
                          <Badge
                            key={m}
                            variant={type === 'primary' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {m.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    );
                  })()}
                  </> /* end !restDays.has(day) */}
                </div>

                {/* RIGHT — exercise library */}
                <Card className="min-w-0">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Exercise Library</CardTitle>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 h-8 text-sm"
                      />
                    </div>
                    {/* Muscle filter pills */}
                    {availableMuscles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {availableMuscles.map(muscle => (
                          <button
                            key={muscle}
                            onClick={() => setSelectedMuscle(prev => prev === muscle ? null : muscle)}
                            className={`text-xs px-2.5 py-1.5 rounded-xl font-medium transition-all duration-200 ${
                              selectedMuscle === muscle
                                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                          >
                            {muscle.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[520px] overflow-y-auto overflow-x-hidden">
                      {suggested.length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-primary/5 border-b border-primary/10">
                            <p className="text-xs font-medium text-primary">
                              ✨ Suggested for {currentDay}
                            </p>
                          </div>
                          {suggested.map(ex => (
                            <ExerciseRow
                              key={ex.id}
                              ex={ex}
                              added={currentExercises.some(e => e.id === ex.id)}
                              onAdd={() => addExercise(ex)}
                            />
                          ))}
                        </>
                      )}
                      {rest.length > 0 && (
                        <>
                          {suggested.length > 0 && (
                            <div className="px-4 py-2 bg-muted/50 border-y">
                              <p className="text-xs text-muted-foreground">Other exercises</p>
                            </div>
                          )}
                          {rest.map(ex => (
                            <ExerciseRow
                              key={ex.id}
                              ex={ex}
                              added={currentExercises.some(e => e.id === ex.id)}
                              onAdd={() => addExercise(ex)}
                            />
                          ))}
                        </>
                      )}
                      {suggested.length === 0 && rest.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          No exercises match your search
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function ExerciseRow({
  ex,
  added,
  onAdd,
}: {
  ex: Exercise;
  added: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/50 transition-colors ${
        added ? 'opacity-50' : ''
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{ex.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground truncate">
            {ex.primaryMuscles.map(m => m.replace(/_/g, ' ')).join(', ')}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
            ex.difficulty === 'beginner'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
              : ex.difficulty === 'intermediate'
              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
          }`}>
            {ex.difficulty}
          </span>
        </div>
      </div>
      <button
        onClick={onAdd}
        disabled={added}
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
          added
            ? 'bg-muted text-muted-foreground'
            : 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-sm shadow-indigo-500/20'
        }`}
      >
        {added ? '✓' : <Plus className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
