import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { exerciseDatabase, type Exercise } from '../../data/exercises';
import { profileApi, planApi } from '../../utils/api';
import { toast } from 'sonner';
import { Search, Plus, Trash2, Clock, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const MUSCLE_TARGETS: Record<string, string[]> = {
  push: ['chest', 'front_delts', 'side_delts', 'triceps'],
  pull: ['lats', 'upper_back', 'rear_delts', 'biceps'],
  legs: ['quads', 'hamstrings', 'glutes'],
  upper: ['chest', 'upper_back', 'lats', 'triceps', 'biceps'],
  lower: ['quads', 'hamstrings', 'glutes'],
  full: ['chest', 'upper_back', 'quads', 'hamstrings'],
};

function getDayType(dayName: string): string {
  const n = dayName.toLowerCase();
  if (n.includes('push'))                       return 'push';
  if (n.includes('pull'))                       return 'pull';
  if (n.includes('leg') || n.includes('lower')) return 'legs';
  if (n.includes('upper'))                      return 'upper';
  return 'full';
}

function getAvailableMuscles(dayType: string): string[] {
  const categoryMap: Record<string, string[]> = {
    push:  ['push'],
    pull:  ['pull'],
    legs:  ['legs'],
    upper: ['push', 'pull'],
    lower: ['legs'],
  };
  const categories = categoryMap[dayType]; // undefined → full / bro_split → all
  const muscles = new Set<string>();
  exerciseDatabase
    .filter(ex => !categories || categories.includes(ex.category))
    .forEach(ex => ex.primaryMuscles.forEach(m => muscles.add(m)));
  return [...muscles].sort();
}

function assessWorkout(exercises: Exercise[], dayName: string) {
  if (exercises.length === 0) {
    return { score: 0, label: 'Empty', color: 'gray', missing: [], tips: ['Add exercises to get started'] };
  }

  const dayType  = getDayType(dayName);
  const targets  = MUSCLE_TARGETS[dayType] || MUSCLE_TARGETS.full;
  const covered  = new Set<string>();
  exercises.forEach(ex => {
    ex.primaryMuscles.forEach(m => covered.add(m));
    ex.secondaryMuscles.forEach(m => covered.add(m));
  });

  const missing  = targets.filter(m => !covered.has(m));
  const coverage = Math.round(((targets.length - missing.length) / targets.length) * 100);
  const tips: string[] = [];

  if (exercises.length < 3) tips.push('Add more exercises for a complete session');
  if (exercises.length > 8) tips.push('Too many exercises may make the session too long');
  const hasCompound = exercises.some(ex => ex.primaryMuscles.length >= 2 || ex.secondaryMuscles.length >= 2);
  if (!hasCompound) tips.push('Add at least one compound movement');

  let score = coverage;
  if (exercises.length >= 3 && exercises.length <= 8) score = Math.min(100, score + 10);
  if (hasCompound) score = Math.min(100, score + 10);

  const label = score >= 80 ? 'Great' : score >= 60 ? 'Good' : score >= 40 ? 'Needs work' : 'Incomplete';
  const color = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';
  return { score, label, color, missing, tips };
}

export function WorkoutBuilder() {
  const [profile, setProfile]                     = useState<any>(null);
  const [selectedExercises, setSelectedExercises] = useState<{ [key: string]: Exercise[] }>({});
  const [searchQuery, setSearchQuery]             = useState('');
  const [currentDay, setCurrentDay]               = useState('');
  const [loading, setLoading]                     = useState(true);
  const [saving, setSaving]                       = useState(false);
  const [selectedMuscle, setSelectedMuscle]       = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const profile = await profileApi.get();
      setProfile(profile);

      // FIX #8: Fetch the existing plan first. Only call initializeDays if
      // there is no saved plan yet. The previous code called initializeDays
      // unconditionally, then overwrote the empty days — causing a visible
      // flash of empty workout days before the saved plan appeared.
      try {
        const plan = await planApi.get();
        if (plan?.workouts && Object.keys(plan.workouts).length > 0) {
          setSelectedExercises(plan.workouts);
          setCurrentDay(Object.keys(plan.workouts)[0]);
          return; // ← exit early; don't call initializeDays
        }
      } catch {
        // No plan saved yet — fall through to initializeDays
      }

      // Only reached when there is no existing plan
      initializeDays(profile);
    } catch {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const initializeDays = (prof: any) => {
    const days: { [key: string]: Exercise[] } = {};
    const style = prof?.workoutStyle;
    if      (style === 'full_body')   ['Day 1', 'Day 2', 'Day 3'].forEach(d => (days[d] = []));
    else if (style === 'upper_lower') ['Upper A', 'Lower A', 'Upper B', 'Lower B'].forEach(d => (days[d] = []));
    else if (style === 'ppl')         ['Push', 'Pull', 'Legs'].forEach(d => (days[d] = []));
    else if (style === 'bro_split')   ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs'].forEach(d => (days[d] = []));
    else                              ['Day 1', 'Day 2', 'Day 3'].forEach(d => (days[d] = []));
    setSelectedExercises(days);
    setCurrentDay(Object.keys(days)[0]);
  };

  const getFilteredExercises = (): { suggested: Exercise[]; rest: Exercise[] } => {
    const all = exerciseDatabase.filter(ex => {
      if (profile?.equipment === 'bodyweight' && ex.equipment !== 'bodyweight') return false;
      if (profile?.equipment === 'limited'    && ex.equipment === 'full_gym')   return false;
      if (profile?.experienceLevel === 'beginner' && ex.difficulty === 'advanced') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return ex.name.toLowerCase().includes(q) || ex.primaryMuscles.some(m => m.toLowerCase().includes(q));
      }
      return true;
    }).filter(ex => !selectedMuscle || ex.primaryMuscles.includes(selectedMuscle) || ex.secondaryMuscles.includes(selectedMuscle));

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
    setSelectedExercises(prev => ({ ...prev, [currentDay]: [...current, exercise] }));
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

  const setsPerExercise = profile?.experienceLevel === 'beginner' ? 2 : 3;

  const getSessionLength = (exercises: Exercise[]): number => {
    const restMinutes    = 2;
    const setTimeMinutes = 0.75;
    return Math.round(10 + exercises.length * setsPerExercise * (restMinutes + setTimeMinutes));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await planApi.save(selectedExercises);
      toast.success('Workout plan saved!');
      navigate('/plan');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const days             = Object.keys(selectedExercises);
  const currentExercises = selectedExercises[currentDay] || [];
  const { suggested, rest } = getFilteredExercises();
  const sessionLen       = getSessionLength(currentExercises);
  const targetLen        = profile?.sessionLength || 60;
  const assessment       = assessWorkout(currentExercises, currentDay);
  const availableMuscles = getAvailableMuscles(getDayType(currentDay));

  const assessmentColorClass = {
    green: 'bg-green-50 border-green-200 text-green-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    red:   'bg-red-50 border-red-200 text-red-800',
    gray:  'bg-gray-50 border-gray-200 text-gray-600',
  }[assessment.color];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="font-bold text-lg">Workout Builder</h1>
            <p className="text-xs text-gray-500">
              {profile?.workoutStyle?.replace(/_/g, ' ')} · {days.length} days ·{' '}
              {setsPerExercise} sets/exercise
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? 'Saving...' : 'Save Plan'}
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-4 space-y-4">
        <Tabs value={currentDay} onValueChange={(day) => { setCurrentDay(day); setSelectedMuscle(null); }}>
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            {days.map(day => (
              <TabsTrigger key={day} value={day} className="flex-shrink-0">
                {day}
                <span className="ml-1 text-xs opacity-60">({(selectedExercises[day] || []).length})</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {days.map(day => (
            <TabsContent key={day} value={day} className="space-y-4 mt-4">
              <div className="grid md:grid-cols-2 gap-4">

                {/* LEFT — selected exercises */}
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    <div className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border ${
                      sessionLen > targetLen + 15 ? 'bg-red-50 border-red-200 text-red-700' :
                      sessionLen < targetLen - 20 ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                      'bg-green-50 border-green-200 text-green-700'
                    }`}>
                      <Clock className="w-3.5 h-3.5" />
                      <span>~{sessionLen} min</span>
                      {sessionLen > targetLen + 15 && <AlertTriangle className="w-3.5 h-3.5" />}
                    </div>
                    <div className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border ${assessmentColorClass}`}>
                      {assessment.score >= 70 ? <CheckCircle className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
                      <span>{assessment.label} ({assessment.score}%)</span>
                    </div>
                  </div>

                  {(assessment.missing.length > 0 || assessment.tips.length > 0) && (
                    <div className={`p-3 rounded-lg border text-sm space-y-1 ${assessmentColorClass}`}>
                      {assessment.missing.length > 0 && (
                        <p>Missing muscles: <span className="font-medium">{assessment.missing.map(m => m.replace(/_/g, ' ')).join(', ')}</span></p>
                      )}
                      {assessment.tips.map((tip, i) => <p key={i}>• {tip}</p>)}
                    </div>
                  )}

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-600">Selected ({currentExercises.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {currentExercises.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">No exercises yet — add from the library →</p>
                      ) : (
                        currentExercises.map((ex, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg group">
                            <div className="flex flex-col gap-0.5">
                              <button onClick={() => moveExercise(day, idx, -1)} disabled={idx === 0}
                                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs leading-none">▲</button>
                              <button onClick={() => moveExercise(day, idx, 1)} disabled={idx === currentExercises.length - 1}
                                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs leading-none">▼</button>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{ex.name}</p>
                              <p className="text-xs text-gray-500 truncate">{ex.primaryMuscles.join(', ')}</p>
                            </div>
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {setsPerExercise} sets
                            </Badge>
                            <button onClick={() => removeExercise(day, idx)}
                              className="text-gray-300 hover:text-red-500 transition-colors p-1 flex-shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  {currentExercises.length > 0 && (() => {
                    const allMuscles = new Map<string, 'primary' | 'secondary'>();
                    currentExercises.forEach(ex => {
                      ex.primaryMuscles.forEach(m => allMuscles.set(m, 'primary'));
                      ex.secondaryMuscles.forEach(m => { if (!allMuscles.has(m)) allMuscles.set(m, 'secondary'); });
                    });
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(allMuscles.entries()).map(([m, type]) => (
                          <Badge key={m} variant={type === 'primary' ? 'default' : 'secondary'} className="text-xs">
                            {m.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* RIGHT — exercise library */}
                <Card>
                  <CardHeader className="pb-2 ">
                    <CardTitle className="text-sm">Exercise Library</CardTitle>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <Input
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 h-8 text-sm"
                      />
                    </div>
                    {availableMuscles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {availableMuscles.map(muscle => (
                          <button
                            key={muscle}
                            onClick={() => setSelectedMuscle(prev => prev === muscle ? null : muscle)}
                            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                              selectedMuscle === muscle
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {muscle.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[520px] overflow-y-auto">
                      {suggested.length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                            <p className="text-xs font-medium text-indigo-700">✨ Suggested for {currentDay}</p>
                          </div>
                          {suggested.map(ex => (
                            <ExerciseRow key={ex.id} ex={ex}
                              added={currentExercises.some(e => e.id === ex.id)}
                              onAdd={() => addExercise(ex)} />
                          ))}
                        </>
                      )}
                      {rest.length > 0 && (
                        <>
                          {suggested.length > 0 && (
                            <div className="px-4 py-2 bg-gray-50 border-y">
                              <p className="text-xs text-gray-500">Other exercises</p>
                            </div>
                          )}
                          {rest.map(ex => (
                            <ExerciseRow key={ex.id} ex={ex}
                              added={currentExercises.some(e => e.id === ex.id)}
                              onAdd={() => addExercise(ex)} />
                          ))}
                        </>
                      )}
                      {suggested.length === 0 && rest.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-8">No exercises match your search</p>
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

function ExerciseRow({ ex, added, onAdd }: { ex: Exercise; added: boolean; onAdd: () => void }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-gray-50 transition-colors ${added ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{ex.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-500">{ex.primaryMuscles.map(m => m.replace(/_/g, ' ')).join(', ')}</span>
          <span className="text-xs text-gray-500">{ex.category}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            ex.difficulty === 'beginner'     ? 'bg-green-100 text-green-700' :
            ex.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-700' :
                                               'bg-red-100 text-red-700'
          }`}>{ex.difficulty}</span>
        </div>
      </div>
      <button
        onClick={onAdd}
        disabled={added}
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
          added ? 'bg-gray-100 text-gray-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'
        }`}
      >
        {added ? '✓' : <Plus className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}