import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { exerciseDatabase, type Exercise } from '../../data/exercises';
import { apiCall } from '../../utils/supabase-client';
import { toast } from 'sonner';
import { Search, Plus, Trash2, Clock, AlertCircle } from 'lucide-react';

export function WorkoutBuilder() {
  const [profile, setProfile] = useState<any>(null);
  const [selectedExercises, setSelectedExercises] = useState<{ [key: string]: Exercise[] }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [currentDay, setCurrentDay] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { profile } = await apiCall('/profile');
      setProfile(profile);
      initializeWorkoutDays(profile);
    } catch (error: any) {
      toast.error('Failed to load profile');
    }
  };

  const initializeWorkoutDays = (prof: any) => {
    const days: { [key: string]: Exercise[] } = {};

    if (prof.workoutStyle === 'full_body') {
      days['Day 1'] = [];
      days['Day 2'] = [];
      days['Day 3'] = [];
    } else if (prof.workoutStyle === 'upper_lower') {
      days['Upper 1'] = [];
      days['Lower 1'] = [];
      days['Upper 2'] = [];
      days['Lower 2'] = [];
    } else if (prof.workoutStyle === 'ppl') {
      days['Push'] = [];
      days['Pull'] = [];
      days['Legs'] = [];
    } else if (prof.workoutStyle === 'bro_split') {
      days['Chest'] = [];
      days['Back'] = [];
      days['Shoulders'] = [];
      days['Arms'] = [];
      days['Legs'] = [];
    }

    setSelectedExercises(days);
    setCurrentDay(Object.keys(days)[0]);
  };

  const getSuggestedExercises = (): Exercise[] => {
    if (!profile) return [];

    return exerciseDatabase
      .filter((ex) => {
        if (profile.equipment === 'full_gym') return true;
        if (profile.equipment === 'bodyweight') return ex.equipment === 'bodyweight';
        return true;
      })
      .filter((ex) => {
        if (profile.experienceLevel === 'beginner') return ex.difficulty !== 'advanced';
        return true;
      })
      .filter((ex) => {
        if (currentDay.toLowerCase().includes('push')) return ex.category === 'push';
        if (currentDay.toLowerCase().includes('pull')) return ex.category === 'pull';
        if (currentDay.toLowerCase().includes('legs') || currentDay.toLowerCase().includes('lower')) return ex.category === 'legs';
        if (currentDay.toLowerCase().includes('chest')) return ex.category === 'push' && ex.primaryMuscles.includes('chest');
        if (currentDay.toLowerCase().includes('back')) return ex.category === 'pull';
        if (currentDay.toLowerCase().includes('shoulder')) return ex.category === 'push' && ex.primaryMuscles.some(m => m.includes('delt'));
        return true;
      })
      .filter((ex) => {
        if (!searchQuery) return true;
        return ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
               ex.primaryMuscles.some(m => m.toLowerCase().includes(searchQuery.toLowerCase()));
      });
  };

  const addExercise = (exercise: Exercise) => {
    if (!currentDay) return;

    setSelectedExercises({
      ...selectedExercises,
      [currentDay]: [...(selectedExercises[currentDay] || []), exercise],
    });
    toast.success(`Added ${exercise.name}`);
  };

  const removeExercise = (dayKey: string, index: number) => {
    setSelectedExercises({
      ...selectedExercises,
      [dayKey]: selectedExercises[dayKey].filter((_, i) => i !== index),
    });
  };

  const calculateSessionLength = (exercises: Exercise[]): number => {
    const setsPerExercise = 3;
    const restTime = 2;
    const warmupCooldown = 10;

    return warmupCooldown + (exercises.length * setsPerExercise * restTime);
  };

  const getTrainedMuscles = (exercises: Exercise[]): string[] => {
    const muscles = new Set<string>();
    exercises.forEach((ex) => {
      ex.primaryMuscles.forEach((m) => muscles.add(m));
      ex.secondaryMuscles.forEach((m) => muscles.add(m));
    });
    return Array.from(muscles);
  };

  const handleSave = async () => {
    try {
      await apiCall('/workouts/plan', {
        method: 'POST',
        body: JSON.stringify({
          workouts: selectedExercises,
          createdAt: new Date().toISOString(),
        }),
      });
      toast.success('Workout plan saved!');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error('Failed to save workout plan');
    }
  };

  const suggestedExercises = getSuggestedExercises();
  const currentDayExercises = selectedExercises[currentDay] || [];
  const estimatedTime = calculateSessionLength(currentDayExercises);
  const trainedMuscles = getTrainedMuscles(currentDayExercises);

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-20">
      <div className="max-w-6xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Build Your Workout Plan</CardTitle>
            <p className="text-sm text-gray-600">
              Select exercises for each workout day. Suggested exercises appear first based on your profile.
            </p>
          </CardHeader>
        </Card>

        <Tabs value={currentDay} onValueChange={setCurrentDay} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            {Object.keys(selectedExercises).map((day) => (
              <TabsTrigger key={day} value={day}>
                {day} ({selectedExercises[day].length})
              </TabsTrigger>
            ))}
          </TabsList>

          {Object.keys(selectedExercises).map((day) => (
            <TabsContent key={day} value={day} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Selected Exercises</CardTitle>
                    <div className="flex gap-2 text-sm">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>~{estimatedTime} min</span>
                      </div>
                      {estimatedTime > (profile?.sessionLength || 60) && (
                        <div className="flex items-center gap-1 text-orange-600">
                          <AlertCircle className="w-4 h-4" />
                          <span>May be too long</span>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {currentDayExercises.length === 0 ? (
                      <p className="text-sm text-gray-500">No exercises selected yet</p>
                    ) : (
                      <>
                        {currentDayExercises.map((ex, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <div className="font-medium">{ex.name}</div>
                              <div className="text-xs text-gray-600">
                                {ex.primaryMuscles.join(', ')}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeExercise(day, idx)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <div className="text-sm font-medium mb-2">Trained Muscles:</div>
                          <div className="flex flex-wrap gap-1">
                            {trainedMuscles.map((muscle) => (
                              <Badge key={muscle} variant="secondary">{muscle}</Badge>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Exercise Library</CardTitle>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Search exercises..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="max-h-[600px] overflow-y-auto space-y-2">
                    {suggestedExercises.map((ex) => {
                      const isAdded = currentDayExercises.some((e) => e.id === ex.id);
                      return (
                        <div key={ex.id} className="p-3 border rounded-lg hover:bg-gray-50">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-medium">{ex.name}</div>
                              <div className="text-xs text-gray-600 mt-1">
                                {ex.primaryMuscles.join(', ')} • {ex.difficulty}
                              </div>
                              <Badge variant="outline" className="mt-2 text-xs">
                                {ex.equipment.replace('_', ' ')}
                              </Badge>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => addExercise(ex)}
                              disabled={isAdded}
                            >
                              {isAdded ? 'Added' : <Plus className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Workout Plan
          </Button>
        </div>
      </div>
    </div>
  );
}
