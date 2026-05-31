import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Input } from '../components/ui/input';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { profileApi, workoutApi, progressApi } from '../../utils/api';
import { Calendar, TrendingUp, Target, Flame, Dumbbell, Plus, ChevronRight } from 'lucide-react';
import { format, parseISO, startOfWeek, subDays, isSameDay } from 'date-fns';
import { toast } from 'sonner';

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile]             = useState<any>(null);
  const [workoutPlan, setWorkoutPlan]     = useState<any>(null);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [bodyweightData, setBodyweightData] = useState<{ date: string; weight: number }[]>([]);
  const [showWeightLog, setShowWeightLog] = useState(false);
  const [newWeight, setNewWeight]         = useState('');
  const [loggingWeight, setLoggingWeight] = useState(false);
  const [loading, setLoading]             = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [prof, plan, history, bw] = await Promise.all([
        profileApi.get(),
        planApi_get(),
        workoutApi.getHistory(50).catch(() => []),  // don't fail whole page
        progressApi.getBodyweight(30),
      ]);
      setProfile(prof);
      setWorkoutHistory(history);
      setBodyweightData(bw);
      setWorkoutPlan(plan);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Inline helper to get plan (planApi not imported above to avoid duplication)
  async function planApi_get() {
    try {
      const { planApi } = await import('../../utils/api');
      return await planApi.get();
    } catch { return null; }
  }

  const handleLogWeight = async () => {
    const w = parseFloat(newWeight);
    if (!w || w < 20 || w > 500) { toast.error('Enter a valid weight'); return; }
    setLoggingWeight(true);
    try {
      await progressApi.logBodyweight(w, format(new Date(), 'yyyy-MM-dd'));
      toast.success('Weight logged!');
      setNewWeight('');
      setShowWeightLog(false);
      const updated = await progressApi.getBodyweight(30);
      setBodyweightData(updated);
    } catch {
      toast.error('Failed to log weight');
    } finally {
      setLoggingWeight(false);
    }
  };

  // ── Derived stats ──────────────────────────────────────────────────────────

  const getWeeklyProgress = () => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const done = workoutHistory.filter(l => new Date(l.completedAt) >= weekStart).length;
    const planned = profile?.trainingDays || 3;
    return { completed: done, planned, pct: Math.min(100, Math.round((done / planned) * 100)) };
  };

  const getReadinessScore = () => {
    if (!profile) return null;
    const sleepScore    = Math.min(40, (profile.avgSleep / 8) * 40);
    const stressScore   = ((10 - profile.stressLevel) / 10) * 30;
    const recentCount   = workoutHistory.filter(l => new Date(l.completedAt) >= subDays(new Date(), 2)).length;
    const recoveryScore = recentCount === 0 ? 30 : recentCount === 1 ? 20 : 10;
    return Math.round(sleepScore + stressScore + recoveryScore);
  };

  const getNextWorkout = () => {
    if (!workoutPlan?.workouts) return null;
    const days = Object.keys(workoutPlan.workouts);
    if (!days.length) return null;
    if (!workoutHistory.length) return { day: days[0], isToday: true };
    const lastDayName = workoutHistory[0].dayName;
    const lastIdx = days.indexOf(lastDayName);
    const nextIdx = lastIdx === -1 ? 0 : (lastIdx + 1) % days.length;
    return { day: days[nextIdx], isToday: false };
  };

  const getCalorieTarget = () => {
    if (!profile?.weight || !profile?.height || !profile?.age) return null;
    const { weight, height, age, gender, primaryGoal, activityLevel } = profile;
    const bmr = gender === 'male'
      ? 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
      : 447.593 + 9.247 * weight + 3.098 * height - 4.330 * age;
    const mult = ({ sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725 } as any)[activityLevel] || 1.4;
    let tdee = bmr * mult;
    if (primaryGoal === 'build_muscle') tdee += 300;
    if (primaryGoal === 'lose_fat') tdee -= 400;
    return Math.round(tdee);
  };

  const getStreak = () => {
    if (!workoutHistory.length) return 0;
    const planned = profile?.trainingDays || 3;
    let streak = 0;
    for (let i = 0; i < 53; i++) {
      const ws = startOfWeek(subDays(new Date(), i * 7), { weekStartsOn: 1 });
      const we = new Date(ws); we.setDate(we.getDate() + 7);
      const count = workoutHistory.filter(l => { const d = parseISO(l.completedAt); return d >= ws && d < we; }).length;
      if (count >= planned) streak++;
      else break;
    }
    return streak;
  };

  const weekProg     = getWeeklyProgress();
  const readiness    = getReadinessScore();
  const nextWorkout  = getNextWorkout();
  const cals         = getCalorieTarget();
  const protein      = profile ? Math.round(profile.weight * 2.2) : null;
  const streak       = getStreak();

  const sortedBw = [...bodyweightData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const latestWeight = sortedBw[sortedBw.length - 1] ?? null;
  const weightDelta  = sortedBw.length >= 2
    ? Math.round((sortedBw[sortedBw.length - 1].weight - sortedBw[0].weight) * 10) / 10
    : null;

  const weightChart = sortedBw.map(e => ({ date: format(parseISO(e.date), 'MMM d'), weight: e.weight }));

  const readinessColor = !readiness ? 'gray'
    : readiness >= 75 ? 'green' : readiness >= 50 ? 'yellow' : 'red';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-gray-600 mb-4">Set up your profile to get started.</p>
            <Button onClick={() => navigate('/onboarding')}>Start Onboarding</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!workoutPlan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-gray-600 mb-4">You haven't built a workout plan yet.</p>
            <Button onClick={() => navigate('/workout-builder')}>Build Plan</Button>
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
          <p className="text-gray-500 text-sm mt-0.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {format(new Date(), 'EEEE, MMM d')}
          </p>
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
              <p className="text-xs text-gray-500 mt-1">workouts</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Readiness</p>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-3xl font-bold">{readiness ?? '–'}</span>
                <Flame className={`w-5 h-5 ${
                  readinessColor === 'green' ? 'text-green-500'
                  : readinessColor === 'yellow' ? 'text-yellow-500' : 'text-red-500'
                }`} />
              </div>
              <p className={`text-xs font-medium ${
                readinessColor === 'green' ? 'text-green-600'
                : readinessColor === 'yellow' ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {readiness && readiness >= 75 ? 'Ready to train'
                  : readiness && readiness >= 50 ? 'Train with care'
                  : 'Consider rest'}
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
                <p className="text-xs text-orange-600">Keep it going</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Daily targets */}
        {(cals || protein) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4" /> Daily Targets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {cals && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Calories</span>
                  <span className="font-semibold">{cals} kcal</span>
                </div>
              )}
              {protein && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Protein</span>
                  <span className="font-semibold">{protein} g</span>
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
                  onKeyDown={e => e.key === 'Enter' && handleLogWeight()}
                  className="flex-1"
                  autoFocus
                />
                <Button size="sm" onClick={handleLogWeight} disabled={loggingWeight}>
                  {loggingWeight ? '…' : 'Save'}
                </Button>
              </div>
            )}

            {latestWeight && (
              <div className="flex items-end gap-2 mb-3">
                <span className="text-3xl font-bold">{latestWeight.weight}</span>
                <span className="text-gray-500 mb-1">kg</span>
                <span className="text-xs text-gray-400 mb-1 ml-1">
                  {format(parseISO(latestWeight.date), 'MMM d')}
                </span>
                {weightDelta !== null && (
                  <span className={`text-sm font-medium mb-1 ${
                    weightDelta > 0 ? 'text-red-500' : weightDelta < 0 ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {weightDelta > 0 ? '+' : ''}{weightDelta} kg
                  </span>
                )}
              </div>
            )}

            {weightChart.length > 1 ? (
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={weightChart}>
                  <XAxis dataKey="date" hide />
                  <YAxis domain={['auto', 'auto']} hide />
                  <Tooltip />
                  <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : !latestWeight ? (
              <p className="text-sm text-gray-400 text-center py-3">Tap Log to track your weight</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Next workout */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Dumbbell className="w-4 h-4" />
              {nextWorkout?.isToday ? "Today's Workout" : 'Next Workout'}
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
                      <span className="text-xs text-gray-400">
                        +{(workoutPlan.workouts[nextWorkout.day] || []).length - 4} more
                      </span>
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
                      <div className="text-right text-xs text-gray-500">
                        <p>{sets} sets</p>
                        <p>{vol}t vol</p>
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
