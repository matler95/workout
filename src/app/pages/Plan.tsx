import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { apiCall } from '../../utils/supabase-client';
import { Dumbbell, Clock, Edit } from 'lucide-react';

export function Plan() {
  const [profile, setProfile]       = useState<any>(null);
  const [workoutPlan, setWorkoutPlan] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [profileRes, planRes] = await Promise.all([
        apiCall('/profile'),
        apiCall('/workouts/plan'),
      ]);
      setProfile(profileRes.profile);
      setWorkoutPlan(planRes.plan);
    } catch (error: any) {
      console.error('Failed to load plan:', error);
    }
  };

  if (!workoutPlan) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader><CardTitle>No Workout Plan</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">You haven't created a workout plan yet.</p>
            <Button onClick={() => navigate('/workout-builder')} className="w-full">
              Create Workout Plan
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Mirrors startingWeights.ts: beginners get 2 sets, everyone else 3
  const setsPerExercise = profile?.experienceLevel === 'beginner' ? 2 : 3;
  const workoutDays     = Object.keys(workoutPlan.workouts || {});

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Workout Plan</h1>
          <Button variant="outline" size="sm" onClick={() => navigate('/workout-builder')}>
            <Edit className="w-4 h-4 mr-2" /> Edit Plan
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{workoutDays.length}</div>
                <div className="text-xs text-gray-600">Days / Week</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{profile?.sessionLength || 60}</div>
                <div className="text-xs text-gray-600">Min / Session</div>
              </div>
              <div>
                <div className="text-2xl font-bold capitalize">
                  {profile?.workoutStyle?.replace(/_/g, ' ') || '—'}
                </div>
                <div className="text-xs text-gray-600">Style</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {workoutDays.map(dayName => {
            const exercises = workoutPlan.workouts[dayName] || [];
            const estimatedMin = Math.round(10 + exercises.length * setsPerExercise * 2.75);
            return (
              <Card key={dayName}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{dayName}</CardTitle>
                      <div className="flex gap-3 mt-2 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Dumbbell className="w-4 h-4" />
                          <span>{exercises.length} exercises</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>~{estimatedMin} min</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => navigate('/active-workout', { state: { dayName } })}
                      size="sm"
                    >
                      Start
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {exercises.map((ex: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div>
                          <div className="font-medium text-sm">{ex.name}</div>
                          <div className="text-xs text-gray-600">{ex.primaryMuscles?.join(', ')}</div>
                        </div>
                        <Badge variant="outline" className="text-xs">
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