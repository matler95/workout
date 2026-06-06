import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { profileApi, planApi } from '../../utils/api';
import { Dumbbell, Clock, Edit, BedDouble } from 'lucide-react';

export function Plan() {
  const [profile, setProfile]         = useState<any>(null);
  const [workoutPlan, setWorkoutPlan] = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const navigate  = useNavigate();
  const location  = useLocation();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prof, plan] = await Promise.all([profileApi.get(), planApi.get()]);
      setProfile(prof);
      setWorkoutPlan(plan);
    } catch (e) {
      console.error('Failed to load plan:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch on route change (back-navigation from WorkoutBuilder)
  useEffect(() => { loadData(); }, [location.key, loadData]);

  // Re-fetch when tab becomes visible (returning from ActiveWorkout)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [loadData]);

  if (loading) return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-40 rounded-xl" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
        <Skeleton className="h-24 w-full rounded-2xl" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
      </div>
    </div>
  );

  if (!workoutPlan) return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardHeader><CardTitle>No Workout Plan</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">You haven't created a workout plan yet.</p>
          <Button onClick={() => navigate('/workout-builder')} className="w-full rounded-xl">
            Create Workout Plan
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const workoutDays = Object.keys(workoutPlan.workouts || {});

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
            const isRest    = exercises.length === 1 && (exercises[0] as any).__rest === true;

            // Rest day card
            if (isRest) {
              return (
                <Card key={dayName} className="border-0 bg-muted/30 shadow-soft border-dashed border-2 border-muted">
                  <CardContent className="py-5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                      <BedDouble className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-muted-foreground">{dayName}</p>
                      <p className="text-xs text-muted-foreground">Rest day — recovery & stretching</p>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            // Step C fix: use per-exercise set counts instead of a fixed value
            const totalSets = exercises.reduce(
              (sum: number, ex: any) => sum + (ex.sets ?? (profile?.experienceLevel === 'beginner' ? 2 : 3)),
              0
            );
            // 10 min warmup + avg 2.75 min per set (work + rest) + 5 min cooldown
            const estimatedMin = Math.round(10 + totalSets * 2.75 + 5);

            const themeClass = (() => {
              const first = exercises[0]?.primaryMuscles?.[0]?.toLowerCase() || '';
              if (first.includes('leg') || first.includes('quad') || first.includes('glute')) return 'bg-emerald-50 dark:bg-emerald-900/20';
              if (first.includes('chest')) return 'bg-cyan-50 dark:bg-cyan-900/20';
              if (first.includes('lat') || first.includes('back')) return 'bg-purple-50 dark:bg-purple-900/20';
              if (first.includes('bicep') || first.includes('tricep')) return 'bg-amber-50 dark:bg-amber-900/20';
              return 'bg-card';
            })();

            return (
              <Card key={dayName} className={`border-0 ${themeClass} shadow-soft`}>
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
                    <div className="hidden sm:block">
                      <Button onClick={() => navigate('/active-workout', { state: { dayName } })}
                        size="lg" className="rounded-2xl bg-emerald-500 text-white hover:bg-emerald-600">
                        Start
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {exercises.map((ex: any, idx: number) => {
                      const sets = ex.sets ?? (profile?.experienceLevel === 'beginner' ? 2 : 3);
                      return (
                        <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded-xl">
                          <div>
                            <div className="font-medium text-sm">{ex.name}</div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {ex.primaryMuscles?.join(', ')?.replace(/_/g, ' ')}
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-xs rounded-lg">{sets} sets</Badge>
                        </div>
                      );
                    })}
                    <div className="block sm:hidden mt-3">
                      <Button onClick={() => navigate('/active-workout', { state: { dayName } })}
                        size="lg" className="w-full rounded-2xl bg-emerald-500 text-white hover:bg-emerald-600">
                        Start
                      </Button>
                    </div>
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
