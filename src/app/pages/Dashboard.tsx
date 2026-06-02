import React, { useState, useEffect } from 'react';
import { getNextWorkout } from '../../utils/getNextWorkout';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Input } from '../components/ui/input';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { profileApi, workoutApi, progressApi, planApi } from '../../utils/api';
import { Calendar, TrendingUp, Target, Flame, Dumbbell, Plus, Play } from 'lucide-react';
import { format, parseISO, startOfWeek, subDays, isSameWeek } from 'date-fns';
import { toast } from 'sonner';
import { SmartInsights } from '../components/SmartInsights';
import { InjuryRiskAlerts } from '../components/InjuryRiskAlerts';
import {
  suggestDeload,
  calculateRecoveryScore,
  suggestProgression,
  checkFatigueWarnings,
} from '../../utils/smartAlgorithms';
import { exerciseDatabase } from '../../data/exercises';

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile]               = useState<any>(null);
  const [workoutPlan, setWorkoutPlan]       = useState<any>(null);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [bodyweightData, setBodyweightData] = useState<{ date: string; weight: number }[]>([]);
  const [showWeightLog, setShowWeightLog]   = useState(false);
  const [newWeight, setNewWeight]           = useState('');
  const [loggingWeight, setLoggingWeight]   = useState(false);
  const [loading, setLoading]               = useState(true);
  const [volumeData, setVolumeData]         = useState<any[]>([]);
  const [deloadSuggestion, setDeloadSuggestion] = useState<any>(null);
  const [recoveryScore, setRecoveryScore] = useState<any>(null);
  const [fatigueWarnings, setFatigueWarnings] = useState<any[]>([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [prof, plan, history, bw, vol] = await Promise.all([
        profileApi.get().catch(() => null),
        planApi.get().catch(() => null),
        workoutApi.getHistory(200).catch(() => []),
        progressApi.getBodyweight(30).catch(() => []),
        progressApi.getWeeklyVolume().catch(() => []),
      ]);
      setProfile(prof);
      setWorkoutPlan(plan);
      setWorkoutHistory(history);
      setBodyweightData(bw);
      setVolumeData(vol);

      if (prof && history.length > 0 && vol.length > 0) {
        const deload = suggestDeload(vol, history, prof);
        setDeloadSuggestion(deload);

        const recovery = calculateRecoveryScore(prof, history);
        setRecoveryScore(recovery);

        const nextDay = plan?.workouts ? Object.keys(plan.workouts)[0] : null;
        if (nextDay && plan?.workouts) {
          const nextDayExercises = (plan.workouts[nextDay] || []).map((ex: any) => ({
            id: ex.id,
            name: ex.name,
            primaryMuscles: ex.primaryMuscles || [],
            secondaryMuscles: ex.secondaryMuscles || [],
          }));
          const warnings = checkFatigueWarnings(nextDayExercises, prof, history);
          setFatigueWarnings(warnings);
        }
      }
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  };

  // FIX: Convert from display units to kg before saving.
  // The DB always stores kg. Imperial users type lbs, so we convert before the API call.
  const handleLogWeight = async () => {
    const displayWeight = parseFloat(newWeight);
    if (!displayWeight || displayWeight <= 0) { toast.error('Enter a valid weight'); return; }

    const units = profile?.units || 'metric';

    // Validate in display units first
    const minDisplay = units === 'imperial' ? 44  : 20;   // 20 kg ≈ 44 lbs
    const maxDisplay = units === 'imperial' ? 660 : 300;  // 300 kg ≈ 660 lbs
    if (displayWeight < minDisplay || displayWeight > maxDisplay) {
      toast.error(`Enter a weight between ${minDisplay} and ${maxDisplay} ${units === 'imperial' ? 'lbs' : 'kg'}`);
      return;
    }

    // Convert to kg for storage
    const weightKg = units === 'imperial'
      ? Math.round((displayWeight / 2.20462) * 10) / 10
      : displayWeight;

    setLoggingWeight(true);
    try {
      await progressApi.logBodyweight(weightKg, format(new Date(), 'yyyy-MM-dd'));
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

  const getCalorieTarget = () => {
    if (!profile?.weight || !profile?.height || !profile?.age) return null;
    // profile.weight and profile.height are always stored in metric (kg, cm)
    const { weight, height, age, gender, primaryGoal, activityLevel, trainingDays, cardioSessions } = profile;
    const bmr = gender === 'male'
      ? 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
      : 447.593 + 9.247 * weight + 3.098 * height - 4.330 * age;

    const baseMult = ({ sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725 } as any)[activityLevel] || 1.4;
    const weeklyWorkouts = (trainingDays || 0) + (cardioSessions || 0);
    const sessionBonus = Math.max(0, weeklyWorkouts - 3) * 0.01;
    let tdee = bmr * (baseMult + sessionBonus);

    if (primaryGoal === 'build_muscle') tdee += Math.round(bmr * 0.10);
    if (primaryGoal === 'lose_fat')     tdee -= Math.round(bmr * 0.15);

    return Math.round(tdee);
  };

  const getStreak = () => {
    if (!workoutHistory.length) return 0;
    const planned = profile?.trainingDays || 3;

    const weekCounts = new Map<string, number>();
    for (const log of workoutHistory) {
      const ws = format(startOfWeek(parseISO(log.completedAt), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      weekCounts.set(ws, (weekCounts.get(ws) || 0) + 1);
    }

    const now = new Date();
    let streak = 0;

    for (let i = 0; i <= 52; i++) {
      const weekDate = subDays(now, i * 7);
      const ws = format(startOfWeek(weekDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const count = weekCounts.get(ws) || 0;

      if (i === 0) {
        if (count >= planned) streak++;
        continue;
      }

      if (count >= planned) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  };

  const weekProg    = getWeeklyProgress();
  const readiness   = getReadinessScore();
  const nextWorkout = getNextWorkout(workoutPlan, workoutHistory);
  const cals        = getCalorieTarget();
  // profile.weight is always kg; multiply by 2.2 for protein grams (same formula either way)
  const protein     = profile ? Math.round(profile.weight * 2.2) : null;
  const streak      = getStreak();
  const units       = profile?.units || 'metric';

  const sortedBw     = [...bodyweightData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const latestWeight = sortedBw[sortedBw.length - 1] ?? null;
  const weightDelta  = sortedBw.length >= 2
    ? Math.round((sortedBw[sortedBw.length - 1].weight - sortedBw[0].weight) * 10) / 10
    : null;

  // DB values are always kg — convert only for display
  const displayWeight = (kg: number) =>
    units === 'imperial' ? Math.round(kg * 2.20462) : kg;

  const weightUnit = units === 'imperial' ? 'lbs' : 'kg';

  const weightChart = sortedBw.map(e => ({
    date:   format(new Date(e.date + 'T12:00:00'), 'MMM d'),
    weight: displayWeight(e.weight),
  }));

  const readinessColor = !readiness ? 'gray'
    : readiness >= 75 ? 'green' : readiness >= 50 ? 'yellow' : 'red';

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Dumbbell className="w-7 h-7 text-white" />
            </div>
            <p className="text-muted-foreground mb-4">Set up your profile to get started.</p>
            <Button onClick={() => navigate('/onboarding')} className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-500/20">Start Onboarding</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!workoutPlan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Target className="w-7 h-7 text-white" />
            </div>
            <p className="text-muted-foreground mb-4">You haven't built a workout plan yet.</p>
            <Button onClick={() => navigate('/workout-builder')} className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-500/20">Build Plan</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
      <div className="max-w-xl mx-auto space-y-4">

        {/* Header */}
        <div className="pt-2">
          <h1 className="text-2xl font-bold tracking-tight">Hey, {profile.name?.split(' ')[0]} 👋</h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {format(new Date(), 'EEEE, MMM d')}
          </p>
        </div>

        {/* Hero: Today's Workout */}
        <Card className="border-0 shadow-soft bg-emerald-50/50 dark:bg-emerald-900/20 overflow-hidden hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Ready for</p>
                <h2 className="text-2xl font-bold tracking-tight">{nextWorkout?.isToday ? "Today's Workout" : "Next Workout"}</h2>
                <p className="text-sm text-muted-foreground mt-1">{nextWorkout ? `${nextWorkout.day} • ${(workoutPlan.workouts[nextWorkout.day] || []).length} exercises` : 'No workout scheduled'}</p>
              </div>
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-800/50 flex items-center justify-center shadow-soft flex-shrink-0">
                <Dumbbell className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            {nextWorkout && (
              <div className="mt-4">
                <Button size="lg" className="w-full rounded-2xl" onClick={() => navigate('/active-workout', { state: { dayName: nextWorkout.day } })}>
                  Start workout
                  <Play className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Smart Insights */}
        <SmartInsights
          deloadSuggestion={deloadSuggestion}
          recoveryScore={recoveryScore}
          fatigueWarnings={fatigueWarnings}
          onViewProgress={() => navigate('/progress')}
          onGeneratePlan={() => navigate('/workout-builder')}
        />

        {/* Injury Risk Alerts */}
        {workoutHistory.length > 0 && (
          <InjuryRiskAlerts
            workoutHistory={workoutHistory}
            exercises={exerciseDatabase}
          />
        )}

        {/* This week + Readiness */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-0 shadow-md hover:shadow-lg transition-shadow duration-200">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">This week</p>
              <div className="flex items-end gap-1 mb-2">
                <span className="text-3xl font-bold tracking-tight">{weekProg.completed}</span>
                <span className="text-muted-foreground text-sm mb-1">/ {weekProg.planned}</span>
              </div>
              <Progress value={weekProg.pct} className="h-1.5" />
              <p className="text-xs text-muted-foreground mt-1">workouts</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md hover:shadow-lg transition-shadow duration-200">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">Readiness</p>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-3xl font-bold tracking-tight">{readiness ?? '–'}</span>
                <Flame className={`w-5 h-5 ${
                  readinessColor === 'green' ? 'text-emerald-500'
                  : readinessColor === 'yellow' ? 'text-amber-500' : 'text-rose-500'
                }`} />
              </div>
              <p className={`text-xs font-medium ${
                readinessColor === 'green' ? 'text-emerald-600'
                : readinessColor === 'yellow' ? 'text-amber-600' : 'text-rose-600'
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
          <Card className="border-0 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-amber-950/30 shadow-md shadow-amber-500/10">
            <CardContent className="py-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25 flex-shrink-0">
                <Flame className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-orange-900 dark:text-orange-200">{streak} week{streak !== 1 ? 's' : ''} on target 🔥</p>
                <p className="text-xs text-orange-600 dark:text-orange-400">Keep it going — you're on fire!</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bodyweight */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                Bodyweight
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-primary hover:text-primary/80" onClick={() => setShowWeightLog(v => !v)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Log
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {showWeightLog && (
              <div className="flex gap-2 mb-3">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder={`Weight (${weightUnit})`}
                  value={newWeight}
                  onChange={e => setNewWeight(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogWeight()}
                  className="flex-1 rounded-xl"
                  autoFocus
                />
                <Button size="sm" className="rounded-xl" onClick={handleLogWeight} disabled={loggingWeight}>
                  {loggingWeight ? '…' : 'Save'}
                </Button>
              </div>
            )}
            {latestWeight && (
              <div className="flex items-end gap-2 mb-3">
                <span className="text-3xl font-bold tracking-tight">
                  {displayWeight(latestWeight.weight)}
                </span>
                <span className="text-muted-foreground mb-1">{weightUnit}</span>
                <span className="text-xs text-muted-foreground mb-1 ml-1">
                  {format(new Date(latestWeight.date + 'T12:00:00'), 'MMM d')}
                </span>
                {weightDelta !== null && (
                  <span className={`text-sm font-medium mb-1 ${
                    weightDelta > 0 ? 'text-rose-500' : weightDelta < 0 ? 'text-emerald-600' : 'text-muted-foreground'
                  }`}>
                    {weightDelta > 0 ? '+' : ''}
                    {units === 'imperial'
                      ? `${Math.round(weightDelta * 2.20462 * 10) / 10} lbs`
                      : `${weightDelta} kg`}
                  </span>
                )}
              </div>
            )}
            {weightChart.length > 1 ? (
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={weightChart}>
                  <XAxis dataKey="date" hide />
                  <YAxis domain={['auto', 'auto']} hide />
                  <Tooltip
                    formatter={(v: any) => [`${v} ${weightUnit}`, 'Weight']}
                    contentStyle={{
                      background: 'var(--card)',
                      border: '0.5px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--foreground)',
                      fontSize: '12px',
                    }}
                  />
                  <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : !latestWeight ? (
              <p className="text-sm text-muted-foreground text-center py-3">Tap Log to track your weight</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Daily targets */}
        {(cals || protein) && (
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Target className="w-3.5 h-3.5 text-primary" />
                </div>
                Daily Targets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cals && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Calories</span>
                  <span className="font-semibold">{cals} <span className="text-xs text-muted-foreground font-normal">kcal</span></span>
                </div>
              )}
              {protein && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Protein</span>
                  <span className="font-semibold">{protein} <span className="text-xs text-muted-foreground font-normal">g</span></span>
                </div>
              )}
              <p className="text-xs text-muted-foreground capitalize">Goal: {profile.primaryGoal?.replace(/_/g, ' ')}</p>
            </CardContent>
          </Card>
        )}

        {/* Recent activity */}
        {workoutHistory.length > 0 && (
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm">Recent Activity</CardTitle>
                <button onClick={() => navigate('/progress')} className="text-xs text-primary font-semibold hover:text-primary/80 transition-colors">View all</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {workoutHistory.slice(0, 3).map((log, i) => {
                  const sets = (log.sets || []).length;
                  const vol  = Math.round((log.sets || []).reduce((s: number, x: any) => s + x.weight * x.reps, 0) / 1000 * 10) / 10;
                  return (
                    <div key={i} className="flex justify-between items-center text-sm py-2.5 border-b border-border/50 last:border-0">
                      <div>
                        <p className="font-medium">{log.dayName}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(log.completedAt), 'EEE, MMM d')}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">{sets} sets</p>
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
