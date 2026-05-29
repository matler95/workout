import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { apiCall } from '../../utils/supabase-client';
import { toast } from 'sonner';
import { Clock, Check, X, ChevronRight, Trophy } from 'lucide-react';

export function ActiveWorkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const dayName = location.state?.dayName;

  const [workoutPlan, setWorkoutPlan] = useState<any>(null);
  const [exercises, setExercises] = useState<any[]>([]);
  const [currentPhase, setCurrentPhase] = useState<'warmup' | 'exercise' | 'feedback'>('warmup');
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [restTimer, setRestTimer] = useState(0);
  const [completedSets, setCompletedSets] = useState<any[]>([]);
  const [feedback, setFeedback] = useState('');

  const [customWeight, setCustomWeight] = useState('');
  const [customReps, setCustomReps] = useState('');

  useEffect(() => {
    if (!dayName) {
      navigate('/plan');
      return;
    }
    loadWorkout();
  }, [dayName]);

  useEffect(() => {
    if (restTimer > 0) {
      const interval = setInterval(() => {
        setRestTimer((t) => Math.max(0, t - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [restTimer]);

  const loadWorkout = async () => {
    try {
      const { plan } = await apiCall('/workouts/plan');
      setWorkoutPlan(plan);
      setExercises(plan.workouts[dayName] || []);
    } catch (error: any) {
      toast.error('Failed to load workout');
      navigate('/plan');
    }
  };

  const handleWarmupComplete = () => {
    setCurrentPhase('exercise');
    toast.success('Let\'s crush this workout!');
  };

  const handleSetComplete = () => {
    const weight = parseFloat(customWeight) || 50;
    const reps = parseInt(customReps) || 10;

    const setData = {
      exerciseId: exercises[currentExerciseIndex].id,
      exerciseName: exercises[currentExerciseIndex].name,
      set: currentSet,
      weight,
      reps,
      timestamp: new Date().toISOString(),
    };

    setCompletedSets([...completedSets, setData]);
    toast.success(`Set ${currentSet} complete!`);

    if (currentSet < 3) {
      setCurrentSet(currentSet + 1);
      setRestTimer(120);
    } else {
      handleExerciseComplete();
    }

    setCustomWeight('');
    setCustomReps('');
  };

  const handleExerciseComplete = () => {
    if (currentExerciseIndex < exercises.length - 1) {
      setCurrentExerciseIndex(currentExerciseIndex + 1);
      setCurrentSet(1);
      setRestTimer(0);
      toast.success('Next exercise!');
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
        }),
      });
      toast.success('Workout logged! Great job!');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error('Failed to log workout');
    }
  };

  const skipExercise = () => {
    handleExerciseComplete();
  };

  if (!exercises.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>Loading workout...</p>
      </div>
    );
  }

  const currentExercise = exercises[currentExerciseIndex];
  const totalSets = exercises.length * 3;
  const completedSetsCount = completedSets.length;
  const progressPercentage = (completedSetsCount / totalSets) * 100;

  if (currentPhase === 'warmup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center">
              <Clock className="w-10 h-10 text-white" />
            </div>
            <CardTitle className="text-2xl">Warm-Up Time</CardTitle>
            <p className="text-gray-600 mt-2">
              Take a few minutes to prepare your body. Get your blood flowing!
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mb-6">
              <div className="p-3 bg-white rounded-lg">
                <p className="text-sm">• Dynamic stretches</p>
              </div>
              <div className="p-3 bg-white rounded-lg">
                <p className="text-sm">• Light cardio (5 min)</p>
              </div>
              <div className="p-3 bg-white rounded-lg">
                <p className="text-sm">• Activate target muscles</p>
              </div>
            </div>
            <Button onClick={handleWarmupComplete} className="w-full">
              I'm Ready - Start Workout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentPhase === 'feedback') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-20 h-20 bg-green-600 rounded-full flex items-center justify-center">
              <Trophy className="w-10 h-10 text-white" />
            </div>
            <CardTitle className="text-2xl">Workout Complete!</CardTitle>
            <p className="text-gray-600 mt-2">
              Amazing work! How did it feel?
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Workout Feedback</label>
              <Textarea
                placeholder="How was the difficulty? Any exercises that felt too easy or too hard?"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
              />
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="text-sm text-gray-600">Completed</div>
              <div className="text-2xl font-bold">{completedSetsCount} sets</div>
              <div className="text-sm text-gray-600 mt-1">{exercises.length} exercises</div>
            </div>
            <Button onClick={handleWorkoutComplete} className="w-full">
              Finish & Log Workout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">{dayName}</h1>
            <p className="text-sm text-gray-600">
              Exercise {currentExerciseIndex + 1} of {exercises.length}
            </p>
          </div>
          <Badge variant="secondary">{Math.round(progressPercentage)}% Complete</Badge>
        </div>

        <Progress value={progressPercentage} className="h-3" />

        {restTimer > 0 ? (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6 text-center">
              <div className="text-6xl font-bold text-blue-600 mb-2">{restTimer}s</div>
              <div className="text-gray-600">Rest time remaining</div>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setRestTimer(0)}
              >
                Skip Rest
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl">{currentExercise.name}</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    Set {currentSet} of 3
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={skipExercise}>
                  Skip <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Target Muscles</div>
                <div className="flex flex-wrap gap-1">
                  {currentExercise.primaryMuscles?.map((muscle: string) => (
                    <Badge key={muscle}>{muscle}</Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Weight (kg)</label>
                  <Input
                    type="number"
                    placeholder="50"
                    value={customWeight}
                    onChange={(e) => setCustomWeight(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Reps</label>
                  <Input
                    type="number"
                    placeholder="10"
                    value={customReps}
                    onChange={(e) => setCustomReps(e.target.value)}
                  />
                </div>
              </div>

              <Button
                onClick={handleSetComplete}
                className="w-full"
                size="lg"
              >
                <Check className="w-5 h-5 mr-2" />
                Complete Set
              </Button>

              {completedSets.filter(s => s.exerciseId === currentExercise.id).length > 0 && (
                <div className="pt-4 border-t">
                  <div className="text-sm font-medium mb-2">Previous Sets</div>
                  <div className="space-y-1">
                    {completedSets
                      .filter(s => s.exerciseId === currentExercise.id)
                      .map((set, idx) => (
                        <div key={idx} className="text-sm text-gray-600">
                          Set {set.set}: {set.weight}kg × {set.reps} reps
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Exercise Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-line">
              {currentExercise.instructions || 'No instructions available'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
