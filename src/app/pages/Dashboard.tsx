import React, { useState, useEffect, useRef } from 'react';
import { getNextWorkout, isRestDay } from '../../utils/getNextWorkout';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Input } from '../components/ui/input';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { profileApi, workoutApi, progressApi, planApi } from '../../utils/api';
import { Calendar, TrendingUp, Target, Flame, Dumbbell, Plus, Play, AlertTriangle } from 'lucide-react';
import { format, parseISO, startOfWeek, subDays, differenceInCalendarDays } from 'date-fns';
import { toast } from 'sonner';
import { SmartInsights } from '../components/SmartInsights';
import { CrashRecoveryBanner, SyncedConfirmation } from '../components/CrashRecoveryBanner';
import { suggestDeload, calculateRecoveryScore, checkFatigueWarnings } from '../../utils/smartAlgorithms';
import { getRecentVolume } from '../../utils/apiAdditions';
import { goToActiveWorkout } from '../../utils/activeWorkoutNav';

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [profile, setProfile]               = useState<any>(null);
  const [workoutPlan, setWorkoutPlan]       = useState<any>(null);
  const [planLoadFailed, setPlanLoadFailed] = useState(false);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [bodyweightData, setBodyweightData] = useState<{ date: string; weight: number }[]>([]);
  const [showWeightLog, setShowWeightLog]   = useState(false);
  const [newWeight, setNewWeight]           = useState('');
  const [loggingWeight, setLoggingWeight]   = useState(false);
  const [loading, setLoading]               = useState(true);
  const [volumeData, setVolumeData]         = useState<any[]>([]);
  const [deloadSuggestion, setDeloadSuggestion] = useState<any>(null);
  const [recoveryScore, setRecoveryScore]       = useState<any>(null);
  const [fatigueWarnings, setFatigueWarnings]   = useState<any[]>([]);
  const [showSynced, setShowSynced]             = useState(false);

  // FIX #3: Prevent concurrent loadData calls.
  // Returning from ActiveWorkout fires BOTH location.key change AND
  // visibilitychange simultaneously → two races of 10 Supabase queries each.
  // The loadingRef guard makes the second call a no-op while the first is in flight.
  const loadingRef = useRef(false);

  const loadData = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      // FIX #15: Track plan load separately so we can distinguish
      // "no plan yet" from "plan failed to load due to network error".
      let planResult: any = null;
      let planFailed = false;
      try {
        planResult = await planApi.get();
      } catch {
        planFailed = true;
      }

      const [prof, history, bw, vol] = await Promise.all([
        profileApi.get().catch(() => null),
        workoutApi.getHistory(200).catch(() => []),
        progressApi.getBodyweight(30).catch(() => []),
        // FIX #7: fetch last 4 weeks so suggestDeload sees cumulative fatigue
        getRecentVolume(4).catch(() => []),
      ]);

      setProfile(prof);
      setWorkoutPlan(planResult);
      setPlanLoadFailed(planFailed);
      setWorkoutHistory(history);
      setBodyweightData(bw);
      setVolumeData(vol);

      if (prof && history.length >= 4 && vol.length > 0) {
        setDeloadSuggestion(suggestDeload(vol, history, prof));
        setRecoveryScore(calculateRecoveryScore(prof, history));
        // FIX (feedback round 3, #9): this used to grab Object.keys(workouts)[0]
        // — literally "whichever day happens to be first in the plan object" —
        // instead of the actual next day in rotation. If that happened to be
        // the day you just finished, the fatigue check compared today's
        // just-completed session against itself and warned "already trained
        // today," which is trivially true and useless. Reuse the same
        // rotation logic the dashboard already uses to show "Next workout."
        const nextDay = getNextWorkout(planResult, history, prof?.trainingDays)?.day ?? null;
        if (nextDay && planResult?.workouts) {
          const exs = (planResult.workouts[nextDay] || []).map((ex: any) => ({
            id: ex.id, name: ex.name,
            primaryMuscles: ex.primaryMuscles || [],
            secondaryMuscles: ex.secondaryMuscles || [],
          }));
          setFatigueWarnings(checkFatigueWarnings(exs, prof, history));
        }
      }
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  useEffect(() => { loadData(); }, [location.key]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const handleLogWeight = async () => {
    const weight = parseFloat(newWeight);
    if (!weight || weight <= 0) { toast.error('Enter a valid weight'); return; }
    if (weight < 20 || weight > 300) { toast.error('Enter a weight between 20 and 300 kg'); return; }
    setLoggingWeight(true);
    try {
      await progressApi.logBodyweight(weight, format(new Date(), 'yyyy-MM-dd'));
      toast.success('Weight logged!');
      setNewWeight('');
      setShowWeightLog(false);
      setBodyweightData(await progressApi.getBodyweight(30));
    } catch { toast.error('Failed to log weight'); }
    finally { setLoggingWeight(false); }
  };

  const getWeeklyProgress = () => {
    // FIX (feedback round 3, #1): this used to be a rolling 7-day window,
    // which let sessions from the *previous* calendar week still count
    // toward "This week" — e.g. a Tuesday with zero sessions this week
    // could still show 2/3 because of Thu/Fri/Sat sessions from last week.
    // The card is explicitly labeled "This week" and the streak logic
    // elsewhere already anchors to a Mon–Sun calendar week, so this now
    // matches that: only sessions since this Monday count.
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const done = workoutHistory.filter(l => new Date(l.completedAt) >= weekStart).length;
    const planned = profile?.trainingDays || 3;
    return { completed: done, planned, pct: Math.min(100, Math.round((done / planned) * 100)) };
  };

  const getLastWorkout = () => {
    if (!workoutHistory || workoutHistory.length === 0) return null;
    const last = workoutHistory[0];
    const sets = (last.sets || []).length;
    const volume = Math.round((last.sets || []).reduce((s: number, x: any) => s + x.weight * x.reps, 0) / 1000 * 10) / 10;
    return { dayName: last.dayName, completedAt: last.completedAt, sets, volume };
  };

  const getTimeAgo = (isoDate: string) => {
    const then = new Date(isoDate);
    const ms = Date.now() - then.getTime();
    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(ms / 3600000);
    // FIX (feedback round 3, #2): raw hours/24 undercounts whenever "now"
    // is earlier in the day than the logged timestamp — e.g. a Saturday
    // evening session read on Tuesday morning was < 48h ago and rounded
    // down to "Yesterday" even though it was 2 calendar days back.
    // differenceInCalendarDays compares dates, not elapsed hours.
    const days = differenceInCalendarDays(new Date(), then);
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24 && days === 0) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  };

  const getCalorieTarget = () => {
    if (!profile?.weight || !profile?.height || !profile?.age) return null;
    const { weight, height, age, gender, primaryGoal, activityLevel, trainingDays, cardioSessions } = profile;
    const bmr = gender === 'male'
      ? 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
      : 447.593 + 9.247 * weight + 3.098 * height - 4.330 * age;
    const mult = ({ sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725 } as any)[activityLevel] || 1.4;
    const bonus = Math.max(0, ((trainingDays || 0) + (cardioSessions || 0)) - 3) * 0.01;
    let tdee = bmr * (mult + bonus);
    if (primaryGoal === 'build_muscle') tdee += Math.round(bmr * 0.10);
    if (primaryGoal === 'lose_fat')     tdee -= Math.round(bmr * 0.15);
    return Math.round(tdee);
  };

  // FIX #4: Streak was breaking at the start of every week because i===0
  // incremented only if count >= planned, and broke otherwise — meaning a
  // user with a 10-week streak would see it reset to 0 every Monday until
  // they completed enough sessions in the new week.
  //
  // Fix: the current (in-progress) week is never allowed to break the streak.
  // We check from i===1 (last completed week) backwards. The current week
  // bonus is added only if it's already on target, but a partial current week
  // does not terminate the streak.
  const getStreak = () => {
    if (!workoutHistory.length) return 0;
    const planned = profile?.trainingDays || 3;

    const weekCounts = new Map<string, number>();
    for (const log of workoutHistory) {
      const ws = format(startOfWeek(parseISO(log.completedAt), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      weekCounts.set(ws, (weekCounts.get(ws) || 0) + 1);
    }

    // Count consecutive completed weeks starting from last fully-elapsed week
    let streak = 0;
    for (let i = 1; i <= 52; i++) {
      const ws = format(startOfWeek(subDays(new Date(), i * 7), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const count = weekCounts.get(ws) || 0;
      if (count >= planned) streak++;
      else break;
    }

    // Bonus: also count current week if already on target
    const currentWs = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if ((weekCounts.get(currentWs) || 0) >= planned) streak++;

    return streak;
  };

  const weekProg    = getWeeklyProgress();
  const nextWorkout = getNextWorkout(workoutPlan, workoutHistory, profile?.trainingDays);
  // All actual training days from the plan, in plan order, rest days excluded —
  // used to render one shortcut button per workout on the dashboard.
  const trainingDayList = workoutPlan
    ? Object.keys(workoutPlan.workouts).filter(d => !isRestDay(workoutPlan, d))
    : [];
  const cals        = getCalorieTarget();
  const protein     = profile ? Math.round(profile.weight * 2.2) : null;
  const streak      = getStreak();

  const sortedBw    = [...bodyweightData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const latestWeight = sortedBw[sortedBw.length - 1] ?? null;
  const weightDelta  = sortedBw.length >= 2
    ? Math.round((sortedBw[sortedBw.length - 1].weight - sortedBw[0].weight) * 10) / 10
    : null;
  const weightChart = sortedBw.map(e => ({ date: format(new Date(e.date + 'T12:00:00'), 'MMM d'), weight: e.weight }));

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-muted border-t-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading your dashboard...</p>
      </div>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Dumbbell className="w-7 h-7 text-white" />
          </div>
          <p className="text-muted-foreground mb-4">Set up your profile to get started.</p>
          <Button onClick={() => navigate('/onboarding')}>Start Onboarding</Button>
        </CardContent>
      </Card>
    </div>
  );

  // FIX #15: Show different messages for "no plan" vs "plan failed to load"
  if (!workoutPlan) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardContent className="pt-8 pb-8 text-center">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
            planLoadFailed
              ? 'bg-gradient-to-br from-red-400 to-rose-500'
              : 'bg-gradient-to-br from-amber-400 to-orange-500'
          }`}>
            {planLoadFailed
              ? <AlertTriangle className="w-7 h-7 text-white" />
              : <Target className="w-7 h-7 text-white" />
            }
          </div>
          <p className="text-muted-foreground mb-4">
            {planLoadFailed
              ? 'Could not load your workout plan. Check your connection and try again.'
              : "You haven't built a workout plan yet."}
          </p>
          {planLoadFailed
            ? <Button onClick={loadData}>Retry</Button>
            : <Button onClick={() => navigate('/workout-builder')}>Build Plan</Button>
          }
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-bold tracking-tight">Hey, {profile.name?.split(' ')[0]} 👋</h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {format(new Date(), 'EEEE, MMM d')}
          </p>
        </div>

        <Card className="border-0 shadow-soft bg-emerald-50/50 dark:bg-emerald-900/20 overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Ready for</p>
                <h2 className="text-2xl font-bold tracking-tight">{nextWorkout?.isToday ? "Today's Workout" : "Next Workout"}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {nextWorkout ? `${nextWorkout.day} · ${(workoutPlan.workouts[nextWorkout.day] || []).length} exercises` : 'No workout scheduled'}
                </p>
                {nextWorkout?.availableOn && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Recommended rest day — next session opens up {format(parseISO(nextWorkout.availableOn), 'EEEE')}
                  </p>
                )}
              </div>
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-800/50 flex items-center justify-center flex-shrink-0">
                <Dumbbell className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>

            {/* FIX (feedback round 4, #2): the single "Start workout" button
                only ever launched whatever getNextWorkout() suggested, with
                no way to jump straight to a different day in the plan
                without going through /plan first. Now every training day
                from the plan gets its own shortcut button, so any workout is
                one tap away, while the suggested day is still called out
                clearly (filled/primary + a "Suggested" badge) so it's
                obvious what today is supposed to be. */}
            {trainingDayList.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {trainingDayList.map(day => {
                  const isSuggested = day === nextWorkout?.day;
                  const count = (workoutPlan.workouts[day] || []).length;
                  return (
                    <Button
                      key={day}
                      variant={isSuggested ? 'primary' : 'outline'}
                      className={`relative flex-col items-start h-auto py-3 px-3.5 rounded-2xl text-left whitespace-normal ${
                        isSuggested ? '' : 'bg-white/60 dark:bg-transparent'
                      }`}
                      onClick={() => goToActiveWorkout(navigate, day)}
                    >
                      {isSuggested && (
                        <span className="absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-wide bg-white/25 rounded-full px-1.5 py-0.5">
                          {nextWorkout?.isToday ? 'Today' : 'Suggested'}
                        </span>
                      )}
                      <span className="font-semibold text-sm truncate w-full pr-10">{day}</span>
                      <span className={`text-xs mt-0.5 flex items-center gap-1 ${isSuggested ? 'text-white/80' : 'text-muted-foreground'}`}>
                        {count} exercises <Play className="w-2.5 h-2.5" />
                      </span>
                    </Button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <CrashRecoveryBanner onSynced={() => { setShowSynced(true); loadData(); }} />
        {showSynced && <SyncedConfirmation />}

        <SmartInsights
          sessionCount={workoutHistory.length}
          deloadSuggestion={deloadSuggestion}
          recoveryScore={recoveryScore}
          fatigueWarnings={fatigueWarnings}
          onViewProgress={() => navigate('/progress')}
          onGeneratePlan={() => navigate('/workout-builder')}
        />

        <div className="grid grid-cols-2 gap-3">
          <Card className="border-0 shadow-md">
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
          {(() => {
            const lastWorkout = getLastWorkout();
            return lastWorkout ? (
              <Card className="border-0 shadow-md">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">Last Workout</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold">{lastWorkout.dayName}</span>
                      <span className="text-xs text-muted-foreground">{getTimeAgo(lastWorkout.completedAt)}</span>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Sets</p>
                        <p className="font-semibold">{lastWorkout.sets}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Volume</p>
                        <p className="font-semibold">{lastWorkout.volume}t</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-0 shadow-md">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">Last Workout</p>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">No workouts yet</p>
                    <p className="text-xs text-muted-foreground">Complete your first session to see stats.</p>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {streak > 0 && (
          <Card className="border-0 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-amber-950/30 shadow-md">
            <CardContent className="py-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                <Flame className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-orange-900 dark:text-orange-200">{streak} week{streak !== 1 ? 's' : ''} on target 🔥</p>
                <p className="text-xs text-orange-600 dark:text-orange-400">Keep it going!</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                Bodyweight
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-primary" onClick={() => setShowWeightLog(v => !v)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Log
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {showWeightLog && (
              <div className="flex gap-2 mb-3">
                <Input type="number" inputMode="decimal" placeholder="Weight (kg)" value={newWeight}
                  onChange={e => setNewWeight(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogWeight()}
                  className="flex-1 rounded-xl" autoFocus />
                <Button size="sm" className="rounded-xl" onClick={handleLogWeight} disabled={loggingWeight}>
                  {loggingWeight ? '…' : 'Save'}
                </Button>
              </div>
            )}
            {latestWeight && (
              <div className="flex items-end gap-2 mb-3">
                <span className="text-3xl font-bold tracking-tight">{latestWeight.weight}</span>
                <span className="text-muted-foreground mb-1">kg</span>
                <span className="text-xs text-muted-foreground mb-1 ml-1">{format(new Date(latestWeight.date + 'T12:00:00'), 'MMM d')}</span>
                {weightDelta !== null && (
                  <span className={`text-sm font-medium mb-1 ${weightDelta > 0 ? 'text-rose-500' : weightDelta < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
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
                  <Tooltip formatter={(v: any) => [`${v} kg`, 'Weight']}
                    contentStyle={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '8px', color: 'var(--foreground)', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : !latestWeight ? (
              <p className="text-sm text-muted-foreground text-center py-3">Tap Log to track your weight</p>
            ) : null}
          </CardContent>
        </Card>

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
              {cals && <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Calories</span><span className="font-semibold">{cals} <span className="text-xs text-muted-foreground font-normal">kcal</span></span></div>}
              {protein && <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Protein</span><span className="font-semibold">{protein} <span className="text-xs text-muted-foreground font-normal">g</span></span></div>}
              <p className="text-xs text-muted-foreground capitalize">Goal: {profile.primaryGoal?.replace(/_/g, ' ')}</p>
            </CardContent>
          </Card>
        )}

        {workoutHistory.length > 0 && (
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm">Recent Activity</CardTitle>
                <button onClick={() => navigate('/progress')} className="text-xs text-primary font-semibold">View all</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {workoutHistory.slice(0, 3).map((log, i) => {
                  const sets = (log.sets || []).length;
                  const vol = Math.round((log.sets || []).reduce((s: number, x: any) => s + x.weight * x.reps, 0) / 1000 * 10) / 10;
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
