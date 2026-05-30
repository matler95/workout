import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Input } from '../components/ui/input';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiCall } from '../../utils/supabase-client';
import { Calendar, TrendingUp, Target, Flame, Dumbbell, Plus, ChevronRight } from 'lucide-react';
import { format, parseISO, startOfWeek, subDays, isSameDay } from 'date-fns';
import { toast } from 'sonner';

export function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [workoutPlan, setWorkoutPlan] = useState<any>(null);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [bodyweightData, setBodyweightData] = useState<{ date: string; weight: number }[]>([]);
  const [showWeightLog, setShowWeightLog] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [loggingWeight, setLoggingWeight] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [profileRes, planRes, historyRes, weightRes] = await Promise.all([
        apiCall('/profile'),
        apiCall('/workouts/plan'),
        apiCall('/workouts/history'),
        apiCall('/progress/bodyweight'),
      ]);
      setProfile(profileRes.profile);
      setWorkoutPlan(planRes.plan);
      const sorted = [...(historyRes.history || [])].sort(
        (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      );
      setWorkoutHistory(sorted);
      setBodyweightData(weightRes.entries || []);
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
  };

  const handleLogWeight = async () => {
    const w = parseFloat(newWeight);
    if (!w || w < 20 || w > 300) { toast.error('Enter a valid weight'); return; }
    setLoggingWeight(true);
    try {
      await apiCall('/progress/bodyweight', {
        method: 'POST',
        body: JSON.stringify({ weight: w, date: format(new Date(), 'yyyy-MM-dd') }),
      });
      toast.success('Weight logged!');
      setNewWeight('');
      setShowWeightLog(false);
      loadData();
    } catch {
      toast.error('Failed to log weight');
    } finally {
      setLoggingWeight(false);
    }
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const getWeeklyProgress = () => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const thisWeek = workoutHistory.filter(l => new Date(l.completedAt) >= weekStart);
    const planned = profile?.trainingDays || 3;
    return { completed: thisWeek.length, planned, pct: Math.min(100, Math.round((thisWeek.length / planned) * 100)) };
  };

  const getReadinessScore = () => {
    if (!profile) return null;
    const sleepScore = Math.min(40, (profile.avgSleep / 8) * 40);
    const stressScore = ((10 - profile.stressLevel) / 10) * 30;
    // Recovery: fewer recent workouts = better recovery
    const recentWorkouts = workoutHistory.filter(l => new Date(l.completedAt) >= subDays(new Date(), 2)).length;
    const recoveryScore = recentWorkouts === 0 ? 30 : recentWorkouts === 1 ? 20 : 10;
    return Math.round(sleepScore + stressScore + recoveryScore);
  };

  const getNextWorkout = () => {
    if (!workoutPlan?.workouts) return null;
    const days = Object.keys(workoutPlan.workouts);
    if (days.length === 0) return null;

    const lastLog = workoutHistory[0];
    if (!lastLog) return { day: days[0], isToday: true };

    const lastDayName = lastLog.dayName;
    const lastIdx = days.indexOf(lastDayName);
    const nextIdx = lastIdx === -1 ? 0 : (lastIdx + 1) % days.length;
    const isToday = isSameDay(parseISO(lastLog.completedAt), subDays(new Date(), 1)); // trained yesterday
    return { day: days[nextIdx], isToday: lastIdx === -1 };
  };

  const getCalorieTarget = () => {
    if (!profile) return null;
    const { weight, height, age, gender, primaryGoal, activityLevel } = profile;
    if (!weight || !height || !age) return null;
    const bmr = gender === 'male'
      ? 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
      : 447.593 + 9.247 * weight + 3.098 * height - 4.330 * age;
    const mult = { sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725 }[activityLevel as string] || 1.4;
    let tdee = bmr * mult;
    if (primaryGoal === 'build_muscle') tdee += 300;
    if (primaryGoal === 'lose_fat') tdee -= 400;
    return Math.round(tdee);
  };

  const getStreak = () => {
    if (workoutHistory.length === 0) return 0;
    const planned = profile?.trainingDays || 3;
    let streak = 0;
    for (let i = 0; ; i++) {
      const weekStart = startOfWeek(subDays(new Date(), i * 7), { weekStartsOn: 1 });
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
      const count = workoutHistory.filter(l => {
        const d = parseISO(l.completedAt);
        return d >= weekStart && d < weekEnd;
      }).length;
      if (count >= planned) streak++;
      else break;
      if (i > 52) break;
    }
    return streak;
  };

  const weekProg = getWeeklyProgress();
  const readiness = getReadinessScore();
  const nextWorkout = getNextWorkout();
  const cals = getCalorieTarget();
  const protein = profile ? Math.round(profile.weight * 2.2) : null;
  const streak = getStreak();
  const latestWeight = bodyweightData.length > 0
    ? [...bodyweightData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    : null;

  const weightChart = [...bodyweightData]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-14)
    .map(e => ({ date: format(parseISO(e.date), 'MMM d'), weight: e.weight }));

  const readinessColor = !readiness ? 'gray' : readiness >= 75 ? 'green' : readiness >= 50 ? 'yellow' : 'red';
  const readinessLabel = !readiness ? '' : readiness >= 75 ? 'Ready to train' : readiness >= 50 ? 'Train with care' : 'Consider rest';

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader><CardTitle>Complete Your Profile</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">Set up your profile to get started.</p>
            <Button onClick={() => navigate('/onboarding')} className="w-full">Start Onboarding</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!workoutPlan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader><CardTitle>Create Your Workout Plan</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">You haven't built a workout plan yet.</p>
            <Button onClick={() => navigate('/workout-builder')} className="w-full">Build Plan</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-xl mx-auto space-y-4">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Hey, {profile.name?.split(' ')[0]} 👋</h1>
          <p className="text-gray-500 text-sm mt-0.5">{format(new Date(), 'EEEE, MMM d')}</p>
        </div>

        {/* This week + Readiness */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">This week</p>
              <div className="flex items-end gap-1 mb-2">
                <span className="text-3xl font-bold">{weekProg.completed}</span>
                <span className="text-gray-400 text-sm mb-1">/ {weekProg.planned}</span>
              </div>
              <Progress value={weekProg.pct} className="h-1.5" />
              <p className="text-xs text-gray-500 mt-1">workouts done</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Readiness</p>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-3xl font-bold">{readiness ?? '–'}</span>
                <Flame className={`w-5 h-5 ${readinessColor === 'green' ? 'text-green-500' : readinessColor === 'yellow' ? 'text-yellow-500' : 'text-red-500'}`} />
              </div>
              <p className={`text-xs font-medium ${readinessColor === 'green' ? 'text-green-600' : readinessColor === 'yellow' ? 'text-yellow-600' : 'text-red-600'}`}>
                {readinessLabel}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Streak */}
        {streak > 0 && (
          <Card className="bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200">
            <CardContent className="py-3 flex items-center gap-3">
              <Flame className="w-8 h-8 text-orange-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-orange-800">{streak} week streak! 🔥</p>
                <p className="text-xs text-orange-600">Keep it going — don't break the chain</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Targets */}
        {(cals || protein) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4" /> Daily Targets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cals && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Calories</span>
                  <span className="font-semibold">{cals} kcal</span>
                </div>
              )}
              {protein && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Protein</span>
                  <span className="font-semibold">{protein}g</span>
                </div>
              )}
              <p className="text-xs text-gray-400">Goal: {profile.primaryGoal?.replace(/_/g, ' ')}</p>
            </CardContent>
          </Card>
        )}

        {/* Bodyweight */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Bodyweight
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setShowWeightLog(v => !v)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Log
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {showWeightLog && (
              <div className="flex gap-2 mb-3">
                <Input
                  type="number"
                  placeholder={`Weight (${profile.units === 'imperial' ? 'lbs' : 'kg'})`}
                  value={newWeight}
                  onChange={e => setNewWeight(e.target.value)}
                  className="flex-1"
                  onKeyDown={e => e.key === 'Enter' && handleLogWeight()}
                  autoFocus
                />
                <Button size="sm" onClick={handleLogWeight} disabled={loggingWeight}>
                  {loggingWeight ? '...' : 'Save'}
                </Button>
              </div>
            )}

            {latestWeight && (
              <div className="flex items-end gap-2 mb-3">
                <span className="text-3xl font-bold">{latestWeight.weight}</span>
                <span className="text-gray-500 mb-1">kg</span>
                <span className="text-xs text-gray-400 mb-1 ml-1">{format(parseISO(latestWeight.date), 'MMM d')}</span>
                {weightChart.length >= 2 && (() => {
                  const diff = Math.round((latestWeight.weight - weightChart[0].weight) * 10) / 10;
                  return (
                    <span className={`text-sm font-medium mb-1 ${diff > 0 ? 'text-red-500' : diff < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {diff > 0 ? '+' : ''}{diff}kg
                    </span>
                  );
                })()}
              </div>
            )}

            {weightChart.length > 1 ? (
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={weightChart}>
                  <XAxis dataKey="date" hide />
                  <YAxis domain={['auto', 'auto']} hide />
                  <Tooltip />
                  <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              !latestWeight && (
                <p className="text-sm text-gray-400 text-center py-3">Tap Log to track your weight</p>
              )
            )}
          </CardContent>
        </Card>

        {/* Next workout */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Dumbbell className="w-4 h-4" />
              {nextWorkout?.isToday ? "Today's Workout" : "Next Workout"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nextWorkout ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xl font-bold">{nextWorkout.day}</p>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {(workoutPlan.workouts[nextWorkout.day] || []).slice(0, 4).map((ex: any, i: number) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">{ex.name}</span>
                    ))}
                    {(workoutPlan.workouts[nextWorkout.day] || []).length > 4 && (
                      <span className="text-xs text-gray-400">+{(workoutPlan.workouts[nextWorkout.day] || []).length - 4} more</span>
                    )}
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => navigate('/active-workout', { state: { dayName: nextWorkout.day } })}
                >
                  Start Workout <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No upcoming workout found</p>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        {workoutHistory.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm">Recent Activity</CardTitle>
                <button onClick={() => navigate('/progress')} className="text-xs text-indigo-600">View all</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {workoutHistory.slice(0, 3).map((log, i) => {
                  const sets = (log.sets || []).length;
                  const vol = Math.round((log.sets || []).reduce((s: number, x: any) => s + x.weight * x.reps, 0) / 1000 * 10) / 10;
                  return (
                    <div key={i} className="flex justify-between items-center text-sm py-1.5 border-b last:border-0">
                      <div>
                        <p className="font-medium">{log.dayName}</p>
                        <p className="text-xs text-gray-500">{format(parseISO(log.completedAt), 'EEE, MMM d')}</p>
                      </div>
                      <div className="text-right text-gray-500 text-xs">
                        <p>{sets} sets</p>
                        <p>{vol}k vol</p>
                      </div>
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
