import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { profileApi, planApi } from '../../utils/api';
import { Dumbbell, Clock, Edit } from 'lucide-react';

export function Plan() {
  const [profile, setProfile]         = useState<any>(null);
  const [workoutPlan, setWorkoutPlan] = useState<any>(null);
  // FIX #4: track loading state to prevent the "No Workout Plan" flash
  const [loading, setLoading]         = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [prof, plan] = await Promise.all([
        profileApi.get(),
        planApi.get(),
      ]);
      setProfile(prof);
      setWorkoutPlan(plan);
    } catch (error: any) {
      console.error('Failed to load plan:', error);
    } finally {
      // FIX #4: always clear loading, even on error
      setLoading(false);
    }
  };

  // FIX #4: show a spinner while data is in-flight
  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 pb-24">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton className="h-8 w-40 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
          </div>
          <Skeleton className="h-24 w-full rounded-2xl" />
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!workoutPlan) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader><CardTitle>No Workout Plan</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">You haven't created a workout plan yet.</p>
            <Button onClick={() => navigate('/workout-builder')} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-500/20">
              Create Workout Plan
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const setsPerExercise = profile?.experienceLevel === 'beginner' ? 2 : 3;
  const workoutDays     = Object.keys(workoutPlan.workouts || {});

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex justify-between items-center pt-2">
          <h1 className="text-2xl font-bold tracking-tight">Workout Plan</h1>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => navigate('/workout-builder')}>
            <Edit className="w-4 h-4 mr-2" /> Edit Plan
          </Button>
        </div>

        <Card className="border-0 shadow-md">
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold tracking-tight">{workoutDays.length}</div>
                <div className="text-xs text-muted-foreground font-medium">Days / Week</div>
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight">{profile?.sessionLength || 60}</div>
                <div className="text-xs text-muted-foreground font-medium">Min / Session</div>
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight capitalize">
                  {profile?.workoutStyle?.replace(/_/g, ' ') || '—'}
                </div>
                <div className="text-xs text-muted-foreground font-medium">Style</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {workoutDays.map(dayName => {
            const exercises = workoutPlan.workouts[dayName] || [];
            const estimatedMin = Math.round(10 + exercises.length * setsPerExercise * 2.75);
            return (
              <Card key={dayName} className="border-0 shadow-md hover:shadow-lg transition-shadow duration-200">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg tracking-tight">{dayName}</CardTitle>
                      <div className="flex gap-3 mt-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-md bg-violet-500/10 flex items-center justify-center">
                            <Dumbbell className="w-3 h-3 text-violet-600" />
                          </div>
                          <span>{exercises.length} exercises</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center">
                            <Clock className="w-3 h-3 text-amber-600" />
                          </div>
                          <span>~{estimatedMin} min</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => navigate('/active-workout', { state: { dayName } })}
                      size="sm"
                      className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-500/20"
                    >
                      Start
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {exercises.map((ex: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 bg-muted/50 rounded-xl">
                        <div>
                          <div className="font-medium text-sm">{ex.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{ex.primaryMuscles?.join(', ')?.replace(/_/g, ' ')}</div>
                        </div>
                        <Badge variant="secondary" className="text-xs rounded-lg">
                          {setsPerExercise} sets
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}