import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TrendingUp, Activity, Calendar, Flame, Info, AlertTriangle, Pencil } from 'lucide-react';
import { format, subDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { useNavigate } from 'react-router';
import { profileApi, workoutApi, progressApi, type VolumeEntry } from '../../utils/api';
import { inferMuscleGroup } from '../../utils/inferMuscleGroup';
import { NextSession } from '../components/NextSession';
import { type WorkoutLog as EngineWorkoutLog } from '../../../utils/progressiveOverload';
import { isVolumeExcessive, isVolumeInsufficient, VOLUME_LANDMARKS } from '../../utils/volumeTracking';
import { getWorkoutsPerWeek, type WorkoutsPerWeekEntry } from '../../utils/apiAdditions';

interface SetLog {
  exerciseId: string; exerciseName: string;
  set: number; weight: number; reps: number;
  e1rm?: number | null; timestamp: string;
}
interface WorkoutLog {
  id?: string; dayName: string; completedAt: string;
  sets: SetLog[]; perceivedEffort?: number;
  rpeCorrections?: Record<string, number>;
  feedback?: string;
}

function toEngineHistory(logs: WorkoutLog[]): EngineWorkoutLog[] {
  return logs.map(log => ({
    dayName: log.dayName, completedAt: log.completedAt,
    perceivedEffort: log.perceivedEffort, rpeCorrections: log.rpeCorrections,
    sets: (log.sets || []).map(s => ({
      exerciseId: s.exerciseId, exerciseName: s.exerciseName,
      weight: s.weight, reps: s.reps,
    })),
  }));
}

export function Progress() {
  const [bodyweightData, setBodyweightData] = useState<{ date: string; weight: number }[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutLog[]>([]);
  const [dbVolumeData, setDbVolumeData]     = useState<VolumeEntry[]>([]);
  const [weeklyData, setWeeklyData]         = useState<WorkoutsPerWeekEntry[]>([]);
  const [profile, setProfile]               = useState<any>(null);
  const [loading, setLoading]               = useState(true);
  const [selectedExercise, setSelectedExercise] = useState('');
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [bw, history, vol, prof, weekly] = await Promise.all([
        progressApi.getBodyweight(90).catch(() => []),
        workoutApi.getHistory(200).catch(() => []),
        progressApi.getWeeklyVolume().catch(() => []),
        profileApi.get().catch(() => null),
        getWorkoutsPerWeek(52).catch(() => []),
      ]);
      setBodyweightData(bw);
      setWorkoutHistory(history as WorkoutLog[]);
      setDbVolumeData(vol);
      setProfile(prof);
      setWeeklyData(weekly);
    } catch (e) {
      console.error('Failed to load progress:', e);
    } finally {
      setLoading(false);
    }
  };

  const engineHistory = useMemo(() => toEngineHistory(workoutHistory), [workoutHistory]);

  const getStrengthData = () => {
    const map: Record<string, { date: string; weight: number; reps: number; e1rm: number }[]> = {};
    for (const log of [...workoutHistory].reverse()) {
      const date = format(parseISO(log.completedAt), 'MMM d');
      const byEx: Record<string, SetLog[]> = {};
      for (const s of (log.sets || [])) {
        if (!byEx[s.exerciseName]) byEx[s.exerciseName] = [];
        byEx[s.exerciseName].push(s);
      }
      for (const [name, sets] of Object.entries(byEx)) {
        const best = sets.reduce((max, s) => s.weight > max.weight ? s : max, sets[0]);
        const e1rm = best.e1rm ?? Math.round(best.weight * (1 + best.reps / 30));
        if (!map[name]) map[name] = [];
        map[name].push({ date, weight: best.weight, reps: best.reps, e1rm });
      }
    }
    return map;
  };

  const getVolumeData = () => {
    const muscleVol: Record<string, number> = {};
    for (const row of dbVolumeData) {
      const muscles = inferMuscleGroup(row.exercise_id, row.exercise_name);
      for (const m of muscles) muscleVol[m] = (muscleVol[m] || 0) + row.total_reps;
    }
    const order  = ['Chest','Back','Quads','Hamstrings','Shoulders','Biceps','Triceps','Core'];
    const maxVol = Math.max(...Object.values(muscleVol), 1);
    return order.map(m => ({
      muscle: m,
      reps:   muscleVol[m] || 0,
      sets:   dbVolumeData.filter(r => inferMuscleGroup(r.exercise_id, r.exercise_name).includes(m))
                          .reduce((s, r) => s + r.total_sets, 0),
      pct: Math.round(((muscleVol[m] || 0) / maxVol) * 100),
    }));
  };

  // Step F: streak calculation uses DB view instead of in-JS computation
  const getStreakInfo = () => {
    if (weeklyData.length === 0) return { current: 0, longest: 0, consistency: 0 };
    const planned = profile?.trainingDays || 3;

    let longest = 0, streak = 0, current = 0;
    const sorted = [...weeklyData].sort((a, b) => a.week_start.localeCompare(b.week_start));
    for (const w of sorted) {
      if (w.workout_count >= planned) { streak++; longest = Math.max(longest, streak); }
      else streak = 0;
    }
    for (const w of [...sorted].reverse()) {
      if (w.workout_count >= planned) current++;
      else break;
    }

    const last30    = subDays(new Date(), 30);
    const done30    = workoutHistory.filter(l => new Date(l.completedAt) >= last30).length;
    const expected30 = Math.round((planned / 7) * 30);
    return { current, longest, consistency: Math.min(100, Math.round((done30 / expected30) * 100)) };
  };

  const getHeatmapData = () =>
    Array.from({ length: 84 }, (_, i) => {
      const d = subDays(new Date(), 83 - i);
      return { date: d, count: workoutHistory.filter(l => isSameDay(parseISO(l.completedAt), d)).length, label: format(d, 'MMM d') };
    });

  const getWeeklyBarData = () =>
    weeklyData.slice(-12).map(w => ({
      week: format(parseISO(w.week_start), 'MMM d'),
      workouts: w.workout_count,
      target: profile?.trainingDays || 3,
    }));

  const weightChartData = bodyweightData.slice(-30).map(e => ({ date: format(parseISO(e.date), 'MMM d'), weight: e.weight }));
  const strengthData    = getStrengthData();
  const exerciseNames   = Object.keys(strengthData);
  const activeExercise  = selectedExercise || exerciseNames[0] || '';
  const volumeData      = getVolumeData();
  const streakInfo      = getStreakInfo();
  const heatmap         = getHeatmapData();
  const weeklyBars      = getWeeklyBarData();

  const bmi = profile ? Math.round((profile.weight / Math.pow(profile.height / 100, 2)) * 10) / 10 : null;
  const estBodyFat = profile && bmi
    ? profile.gender === 'male'
      ? Math.round(1.2 * bmi + 0.23 * profile.age - 16.2)
      : Math.round(1.2 * bmi + 0.23 * profile.age - 5.4)
    : null;
  const leanMass = profile && estBodyFat
    ? Math.round(profile.weight * (1 - estBodyFat / 100) * 10) / 10
    : null;

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-muted border-t-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading progress...</p>
      </div>
    </div>
  );

  const tooltipStyle = {
    contentStyle: { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px' },
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-page">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold tracking-tight pt-2">Progress</h1>

        <Tabs defaultValue="body" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="body">Body</TabsTrigger>
            <TabsTrigger value="strength">Strength</TabsTrigger>
            <TabsTrigger value="volume">Volume</TabsTrigger>
            <TabsTrigger value="streaks">Streaks</TabsTrigger>
          </TabsList>

          {/* ── Body ───────────────────────────────────────────────────── */}
          <TabsContent value="body" className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: bmi ?? '–', label: 'BMI', sub: bmi ? (bmi<18.5?'Underweight':bmi<25?'Normal':bmi<30?'Overweight':'Obese') : null },
                { value: estBodyFat ? `${estBodyFat}%` : '–', label: 'Est. Body Fat', sub: 'approx.' },
                { value: leanMass ?? '–', label: 'Lean kg', sub: 'estimated' },
              ].map(({ value, label, sub }) => (
                <Card key={label}>
                  <CardContent className="pt-4 pb-4 text-center">
                    <div className="text-2xl font-bold">{value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{label}</div>
                    {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
                  </CardContent>
                </Card>
              ))}
            </div>
            {(estBodyFat !== null || bmi !== null) && (
              <div className="flex items-start gap-2 bg-muted/50 border border-border rounded-lg p-3 text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <p>Body fat % and lean mass are rough estimates using the Deurenberg equation. Use as directional trends only.</p>
              </div>
            )}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Bodyweight</CardTitle></CardHeader>
              <CardContent>
                {weightChartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={weightChartData}>
                      <CartesianGrid strokeDasharray="3 3" style={{ stroke: 'var(--border)' }} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} domain={['auto','auto']} unit=" kg" />
                      <Tooltip {...tooltipStyle} formatter={(v:any) => [`${v} kg`, 'Weight']} />
                      <Line type="monotone" dataKey="weight" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {weightChartData.length === 1 ? `Current: ${weightChartData[0].weight} kg — log more to see a trend` : 'No bodyweight data yet. Log from the dashboard.'}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Strength ───────────────────────────────────────────────── */}
          <TabsContent value="strength" className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 px-0.5">Next session</h2>
              <NextSession history={engineHistory} />
            </div>
            {exerciseNames.length > 0 && (
              <div className="space-y-4 pt-2">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-0.5">Strength history</h2>
                <div className="flex gap-2 flex-wrap">
                  {exerciseNames.map(name => (
                    <button key={name} onClick={() => setSelectedExercise(name)}
                      className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${activeExercise===name?'bg-primary text-primary-foreground':'bg-muted text-muted-foreground hover:bg-muted/80 border border-border/50'}`}>
                      {name}
                    </button>
                  ))}
                </div>
                {activeExercise && strengthData[activeExercise] && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">{activeExercise}</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={strengthData[activeExercise]}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} unit="kg" domain={['auto','auto']} />
                          <Tooltip {...tooltipStyle} formatter={(v:any,n:string) => [`${Math.round(v)} kg`, n==='e1rm'?'Est. 1RM':'Top set']} />
                          <Line type="monotone" dataKey="weight" stroke="#94a3b8" strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="4 2" name="weight" />
                          <Line type="monotone" dataKey="e1rm" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} name="e1rm" />
                        </LineChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-muted-foreground text-center mt-1">— e1RM &nbsp; - - top set weight</p>
                    </CardContent>
                  </Card>
                )}
                <div className="space-y-2">
                  {exerciseNames.map(name => {
                    const data = strengthData[name];
                    const first = data[0], last = data[data.length-1];
                    const diff = Math.round((last.weight - first.weight) * 10) / 10;
                    return (
                      <Card key={name} className="cursor-pointer hover:border-primary transition-colors" onClick={() => setSelectedExercise(name)}>
                        <CardContent className="py-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{name}</p>
                            <p className="text-xs text-muted-foreground">{data.length} session{data.length!==1?'s':''}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{last.weight} kg</p>
                            {data.length > 1 && (
                              <p className={`text-xs ${diff>0?'text-green-600 dark:text-green-400':diff<0?'text-red-500 dark:text-red-400':'text-muted-foreground'}`}>
                                {diff>0?'+':''}{diff} kg
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Volume ─────────────────────────────────────────────────── */}
          <TabsContent value="volume" className="space-y-4">
            {(() => {
              const excessive    = volumeData.filter(d => isVolumeExcessive(d.muscle, d.sets));
              const insufficient = volumeData.filter(d => d.sets > 0 && isVolumeInsufficient(d.muscle, d.sets));
              if (excessive.length > 0) return (
                <Card className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50">
                  <CardContent className="pt-4">
                    <div className="flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-sm text-red-900 dark:text-red-200 mb-1">High volume — consider a deload</p>
                        <p className="text-xs text-red-700 dark:text-red-300">{excessive.map(d=>`${d.muscle} (${d.sets} sets)`).join(', ')} above MRV</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
              if (insufficient.length > 0 && volumeData.some(d=>d.sets>0)) return (
                <Card className="bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800/50">
                  <CardContent className="pt-4">
                    <div className="flex gap-3">
                      <Info className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-sm text-yellow-900 dark:text-yellow-200 mb-1">Some muscle groups below minimum volume</p>
                        <p className="text-xs text-yellow-700 dark:text-yellow-300">{insufficient.map(d=>`${d.muscle} (${d.sets} sets)`).join(', ')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
              return null;
            })()}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4" /> Muscle Volume This Week</CardTitle>
                <p className="text-xs text-muted-foreground">Total reps per muscle group</p>
              </CardHeader>
              <CardContent>
                {volumeData.every(d=>d.reps===0) ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Complete workouts this week to see volume data</p>
                ) : (
                  <div className="space-y-3">
                    {volumeData.map(({ muscle, reps, sets, pct }) => (
                      <div key={muscle}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{muscle}</span>
                          <span className="text-muted-foreground">{sets} sets · {reps} reps</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step E: show workout notes */}
            {workoutHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Recent Workouts</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {workoutHistory.slice(0, 5).map((log, i) => {
                      const vol = (log.sets||[]).reduce((s,x)=>s+x.weight*x.reps,0);
                      return (
                        <div key={i} className="py-2 border-b last:border-0">
                          <div className="flex justify-between items-center text-sm">
                            <div>
                              <p className="font-medium">{log.dayName}</p>
                              <p className="text-xs text-muted-foreground">{format(parseISO(log.completedAt),'EEE, MMM d')}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="font-medium">{(log.sets||[]).length} sets</p>
                                <p className="text-xs text-muted-foreground">{Math.round(vol/1000*10)/10}t vol</p>
                              </div>
                              {log.id && (
                                <button
                                  onClick={() => navigate(`/workout-edit/${log.id}`)}
                                  className="text-muted-foreground/40 hover:text-primary transition-colors p-1"
                                  title="Edit workout"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Step E: notes */}
                          {log.feedback && log.feedback.trim() && log.feedback !== '(partial workout)' && (
                            <p className="text-xs text-muted-foreground italic mt-1 leading-relaxed">"{log.feedback}"</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Streaks ─────────────────────────────────────────────────── */}
          <TabsContent value="streaks" className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: streakInfo.current, label: 'Weeks on target', sub: 'consecutive', icon: <Flame className="w-5 h-5 text-orange-500" /> },
                { value: streakInfo.longest, label: 'Best streak', sub: 'weeks' },
                { value: `${streakInfo.consistency}%`, label: 'Consistency', sub: 'last 30 days' },
              ].map(({ value, label, sub, icon }: any) => (
                <Card key={label}>
                  <CardContent className="pt-4 pb-4 text-center">
                    {icon ? (
                      <div className="flex items-center justify-center gap-1 mb-1">{icon}<span className="text-2xl font-bold">{value}</span></div>
                    ) : (
                      <div className="text-2xl font-bold">{value}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">{label}</div>
                    <div className="text-xs text-muted-foreground">{sub}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground px-1">A week counts as "on target" when you complete at least {profile?.trainingDays ?? 3} workouts.</p>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4" /> Activity — Last 12 Weeks</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="grid gap-1" style={{ gridTemplateColumns:'repeat(12,1fr)', minWidth:280 }}>
                    {Array.from({length:12},(_,w) => (
                      <div key={w} className="flex flex-col gap-1">
                        {heatmap.slice(w*7,w*7+7).map((day,d) => (
                          <div key={d} title={`${day.label}: ${day.count} workout${day.count!==1?'s':''}`}
                            className={`w-full aspect-square rounded-sm ${day.count===0?'bg-muted':day.count===1?'bg-indigo-200 dark:bg-indigo-800':'bg-indigo-500'}`} />
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                    <span>Less</span>
                    <div className="w-3 h-3 rounded-sm bg-muted" />
                    <div className="w-3 h-3 rounded-sm bg-indigo-200 dark:bg-indigo-800" />
                    <div className="w-3 h-3 rounded-sm bg-indigo-500" />
                    <span>More</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Workouts per Week</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={weeklyBars} barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                    <XAxis dataKey="week" tick={{ fontSize:10, fill:'var(--muted-foreground)' }} interval={2} />
                    <YAxis tick={{ fontSize:11, fill:'var(--muted-foreground)' }} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <ReferenceLine y={profile?.trainingDays||3} stroke="#10B981" strokeDasharray="4 2" label={{ value:'target', position:'right', fontSize:10 }} />
                    <Bar dataKey="workouts" fill="#10B981" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
