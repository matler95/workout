import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Badge } from '../components/ui/badge';
import { TrendingUp, Activity, Calendar, Flame, Info } from 'lucide-react';
import { format, subDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { profileApi, workoutApi, progressApi, type VolumeEntry } from '../../utils/api';
import { ProgressionInsights } from '../components/ProgressionInsights';
import {
  computeAllSuggestions,
  type WorkoutLog as EngineWorkoutLog,
} from '../../../utils/progressiveOverload';

// ─── Local types (match what the API returns) ──────────────────────────────────

interface SetLog {
  exerciseId: string;
  exerciseName: string;
  set: number;
  weight: number;
  reps: number;
  e1rm?: number | null;
  timestamp: string;
}

interface WorkoutLog {
  id?: string;
  dayName: string;
  completedAt: string;
  sets: SetLog[];
  perceivedEffort?: number;
}

// FIX #17: explicit mapper instead of `as unknown as EngineWorkoutLog[]`.
// The engine only needs { dayName, completedAt, sets[{exerciseId, exerciseName, weight, reps}], perceivedEffort }.
function toEngineHistory(logs: WorkoutLog[]): EngineWorkoutLog[] {
  return logs.map(log => ({
    dayName:         log.dayName,
    completedAt:     log.completedAt,
    perceivedEffort: log.perceivedEffort,
    sets: (log.sets || []).map(s => ({
      exerciseId:   s.exerciseId,
      exerciseName: s.exerciseName,
      weight:       s.weight,
      reps:         s.reps,
    })),
  }));
}

export function Progress() {
  const [bodyweightData, setBodyweightData]   = useState<{ date: string; weight: number }[]>([]);
  const [workoutHistory, setWorkoutHistory]   = useState<WorkoutLog[]>([]);
  const [dbVolumeData, setDbVolumeData]       = useState<VolumeEntry[]>([]);
  const [profile, setProfile]                 = useState<any>(null);
  const [loading, setLoading]                 = useState(true);
  const [selectedExercise, setSelectedExercise] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [bw, history, vol, prof] = await Promise.all([
        progressApi.getBodyweight(90).catch(() => []),
        workoutApi.getHistory(100).catch(() => []),
        progressApi.getWeeklyVolume().catch(() => []),
        profileApi.get().catch(() => null),
      ]);
      setBodyweightData(bw);
      setWorkoutHistory(history as WorkoutLog[]);
      setDbVolumeData(vol);
      setProfile(prof);
    } catch (e) {
      console.error('Failed to load progress:', e);
    } finally {
      setLoading(false);
    }
  };

  // ── Strength chart data ────────────────────────────────────────────────────

  const getStrengthData = () => {
    const map: Record<string, { date: string; weight: number; reps: number; e1rm: number }[]> = {};
    for (const log of [...workoutHistory].reverse()) {
      const date = format(parseISO(log.completedAt), 'MMM d');
      const byExercise: Record<string, SetLog[]> = {};
      for (const s of (log.sets || [])) {
        if (!byExercise[s.exerciseName]) byExercise[s.exerciseName] = [];
        byExercise[s.exerciseName].push(s);
      }
      for (const [name, sets] of Object.entries(byExercise)) {
        const best  = sets.reduce((max, s) => s.weight > max.weight ? s : max, sets[0]);
        const e1rm  = best.e1rm ?? Math.round(best.weight * (1 + best.reps / 30));
        if (!map[name]) map[name] = [];
        map[name].push({ date, weight: best.weight, reps: best.reps, e1rm });
      }
    }
    return map;
  };

  // ── Volume from DB ─────────────────────────────────────────────────────────

  const getVolumeData = () => {
    const muscleVolume: Record<string, number> = {};
    for (const row of dbVolumeData) {
      const muscles = inferMuscleGroup(row.exercise_name.toLowerCase());
      for (const m of muscles) muscleVolume[m] = (muscleVolume[m] || 0) + row.total_reps;
    }
    const order  = ['Chest', 'Back', 'Quads', 'Hamstrings', 'Shoulders', 'Biceps', 'Triceps', 'Core'];
    const maxVol = Math.max(...Object.values(muscleVolume), 1);
    return order.map(m => ({
      muscle: m,
      reps:   muscleVolume[m] || 0,
      sets:   dbVolumeData
        .filter(r => inferMuscleGroup(r.exercise_name.toLowerCase()).includes(m))
        .reduce((s, r) => s + r.total_sets, 0),
      pct: Math.round(((muscleVolume[m] || 0) / maxVol) * 100),
    }));
  };

  const inferMuscleGroup = (name: string): string[] => {
    if (name.includes('bench') || name.includes('chest') || name.includes('push-up') || name.includes('pushup') || name.includes('dip') || name.includes('fly')) return ['Chest', 'Triceps'];
    if (name.includes('row') || name.includes('pull') || name.includes('lat') || name.includes('deadlift')) return ['Back', 'Biceps'];
    if (name.includes('squat') || name.includes('leg press') || name.includes('lunge')) return ['Quads', 'Hamstrings'];
    if (name.includes('romanian') || name.includes('hamstring') || name.includes('leg curl')) return ['Hamstrings'];
    if (name.includes('press') || name.includes('delt') || name.includes('shoulder') || name.includes('overhead')) return ['Shoulders', 'Triceps'];
    if (name.includes('curl') || name.includes('bicep')) return ['Biceps'];
    if (name.includes('tricep') || name.includes('extension') || name.includes('pushdown') || name.includes('kickback')) return ['Triceps'];
    if (name.includes('plank') || name.includes('crunch') || name.includes('ab') || name.includes('core') || name.includes('hanging')) return ['Core'];
    return [];
  };

  // ── Streaks ────────────────────────────────────────────────────────────────

  const getStreakInfo = () => {
    if (workoutHistory.length === 0) return { current: 0, longest: 0, consistency: 0 };
    const plannedPerWeek = profile?.trainingDays || 3;
    const weeks: Record<string, number> = {};
    for (const log of workoutHistory) {
      const key = format(startOfWeek(parseISO(log.completedAt), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      weeks[key] = (weeks[key] || 0) + 1;
    }
    const keys = Object.keys(weeks).sort();
    let longest = 0, streak = 0, current = 0;
    for (const k of keys) {
      if (weeks[k] >= plannedPerWeek) { streak++; longest = Math.max(longest, streak); }
      else streak = 0;
    }
    for (const k of [...keys].reverse()) {
      if (weeks[k] >= plannedPerWeek) current++;
      else break;
    }
    const last30     = subDays(new Date(), 30);
    const done30     = workoutHistory.filter(l => new Date(l.completedAt) >= last30).length;
    const expected30 = Math.round((plannedPerWeek / 7) * 30);
    return { current, longest, consistency: Math.min(100, Math.round((done30 / expected30) * 100)) };
  };

  const getHeatmapData = () =>
    Array.from({ length: 84 }, (_, i) => {
      const d = subDays(new Date(), 83 - i);
      return {
        date: d,
        count: workoutHistory.filter(l => isSameDay(parseISO(l.completedAt), d)).length,
        label: format(d, 'MMM d'),
      };
    });

  const getWeeklyBarData = () =>
    Array.from({ length: 12 }, (_, i) => {
      const weekStart = startOfWeek(subDays(new Date(), (11 - i) * 7), { weekStartsOn: 1 });
      const weekEnd   = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
      return {
        week:     format(weekStart, 'MMM d'),
        workouts: workoutHistory.filter(l => { const d = parseISO(l.completedAt); return d >= weekStart && d < weekEnd; }).length,
        target:   profile?.trainingDays || 3,
      };
    });

  // ── Derived ────────────────────────────────────────────────────────────────

  const weightChartData = bodyweightData
    .slice(-30)
    .map(e => ({ date: format(parseISO(e.date), 'MMM d'), weight: e.weight }));

  const strengthData   = getStrengthData();
  const exerciseNames  = Object.keys(strengthData);
  const activeExercise = selectedExercise || exerciseNames[0] || '';
  const volumeData     = getVolumeData();
  const streakInfo     = getStreakInfo();
  const heatmap        = getHeatmapData();
  const weeklyBars     = getWeeklyBarData();

  const bmi = profile
    ? Math.round((profile.weight / Math.pow(profile.height / 100, 2)) * 10) / 10
    : null;
  const estBodyFat = profile && bmi
    ? profile.gender === 'male'
      ? Math.round(1.2 * bmi + 0.23 * profile.age - 16.2)
      : Math.round(1.2 * bmi + 0.23 * profile.age - 5.4)
    : null;
  const leanMass = profile && estBodyFat
    ? Math.round(profile.weight * (1 - estBodyFat / 100) * 10) / 10
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Progress</h1>

        <Tabs defaultValue="body" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="body">Body</TabsTrigger>
            <TabsTrigger value="strength">Strength</TabsTrigger>
            <TabsTrigger value="volume">Volume</TabsTrigger>
            <TabsTrigger value="streaks">Streaks</TabsTrigger>
          </TabsList>

          {/* ── Body ──────────────────────────────────────────────────────── */}
          <TabsContent value="body" className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: bmi ?? '–',                  label: 'BMI',           sub: bmi ? (bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese') : null },
                { value: estBodyFat ? `${estBodyFat}%` : '–', label: 'Est. Body Fat', sub: 'approx.' },
                { value: leanMass ?? '–',              label: 'Lean kg',       sub: 'estimated' },
              ].map(({ value, label, sub }) => (
                <Card key={label}>
                  <CardContent className="pt-4 pb-4 text-center">
                    <div className="text-2xl font-bold">{value}</div>
                    <div className="text-xs text-gray-500 mt-1">{label}</div>
                    {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* FIX #16: body composition disclaimer */}
            {(estBodyFat !== null || bmi !== null) && (
              <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-500">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
                <p>
                  Body fat % and lean mass are rough estimates using the Deurenberg equation applied
                  to BMI. Accuracy varies significantly by individual — use these as directional
                  trends only, not precise measurements.
                </p>
              </div>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Bodyweight
                </CardTitle>
              </CardHeader>
              <CardContent>
                {weightChartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={weightChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                      <Tooltip />
                      <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-8 text-center text-sm text-gray-500">
                    {weightChartData.length === 1
                      ? `Current: ${weightChartData[0].weight} kg — log more to see a trend`
                      : 'No bodyweight data yet. Log from the dashboard.'}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Strength ──────────────────────────────────────────────────── */}
          <TabsContent value="strength" className="space-y-4">
            {/* FIX #17: use explicit mapper instead of `as unknown as EngineWorkoutLog[]` */}
            <ProgressionInsights history={toEngineHistory(workoutHistory)} />

            {exerciseNames.length > 0 && (
              <>
                <div className="flex gap-2 flex-wrap pt-2">
                  {exerciseNames.map(name => (
                    <button
                      key={name}
                      onClick={() => setSelectedExercise(name)}
                      className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                        activeExercise === name
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>

                {activeExercise && strengthData[activeExercise] && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{activeExercise}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={strengthData[activeExercise]}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} unit="kg" domain={['auto', 'auto']} />
                          <Tooltip formatter={(v: any, n: string) => [`${Math.round(v)} kg`, n === 'e1rm' ? 'Est. 1RM' : 'Top set']} />
                          <Line type="monotone" dataKey="weight" stroke="#94a3b8" strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="4 2" name="weight" />
                          <Line type="monotone" dataKey="e1rm"   stroke="#6366f1" strokeWidth={2}   dot={{ r: 3 }} name="e1rm" />
                        </LineChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-gray-400 text-center mt-1">— e1RM &nbsp;&nbsp; - - top set weight</p>
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-2">
                  {exerciseNames.map(name => {
                    const data  = strengthData[name];
                    const first = data[0], last = data[data.length - 1];
                    const diff  = Math.round((last.weight - first.weight) * 10) / 10;
                    return (
                      <Card key={name} className="cursor-pointer hover:border-indigo-300 transition-colors"
                        onClick={() => setSelectedExercise(name)}>
                        <CardContent className="py-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{name}</p>
                            <p className="text-xs text-gray-500">{data.length} session{data.length !== 1 ? 's' : ''}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{last.weight} kg</p>
                            {data.length > 1 && (
                              <p className={`text-xs ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                                {diff > 0 ? '+' : ''}{diff} kg
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Volume ────────────────────────────────────────────────────── */}
          <TabsContent value="volume" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Muscle Volume This Week
                </CardTitle>
                <p className="text-xs text-gray-500">Total reps per muscle group from the current week</p>
              </CardHeader>
              <CardContent>
                {volumeData.every(d => d.reps === 0) ? (
                  <p className="text-sm text-gray-500 py-4 text-center">Complete workouts this week to see volume data</p>
                ) : (
                  <div className="space-y-3">
                    {volumeData.map(({ muscle, reps, sets, pct }) => (
                      <div key={muscle}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{muscle}</span>
                          <span className="text-gray-500">{sets} sets · {reps} reps</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {workoutHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Recent Workouts</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {workoutHistory.slice(0, 5).map((log, i) => {
                      const vol = (log.sets || []).reduce((s, x) => s + x.weight * x.reps, 0);
                      return (
                        <div key={i} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                          <div>
                            <p className="font-medium">{log.dayName}</p>
                            <p className="text-xs text-gray-500">{format(parseISO(log.completedAt), 'EEE, MMM d')}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{(log.sets || []).length} sets</p>
                            <p className="text-xs text-gray-500">{Math.round(vol / 1000 * 10) / 10}t vol</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Streaks ───────────────────────────────────────────────────── */}
          <TabsContent value="streaks" className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: streakInfo.current,              label: 'Weeks on target', sub: 'consecutive', icon: <Flame className="w-5 h-5 text-orange-500" /> },
                { value: streakInfo.longest,              label: 'Best streak',    sub: 'weeks' },
                { value: `${streakInfo.consistency}%`,   label: 'Consistency',    sub: 'last 30 days' },
              ].map(({ value, label, sub, icon }) => (
                <Card key={label}>
                  <CardContent className="pt-4 pb-4 text-center">
                    {icon ? (
                      <div className="flex items-center justify-center gap-1 mb-1">
                        {icon}<span className="text-2xl font-bold">{value}</span>
                      </div>
                    ) : (
                      <div className="text-2xl font-bold">{value}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">{label}</div>
                    <div className="text-xs text-gray-400">{sub}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* FIX #15: brief note explaining what "weeks on target" means */}
            <p className="text-xs text-gray-400 px-1">
              A week counts as "on target" when you complete at least {profile?.trainingDays ?? 3} workouts in that calendar week.
            </p>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Activity — Last 12 Weeks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(12, 1fr)', minWidth: 280 }}>
                    {Array.from({ length: 12 }, (_, w) => (
                      <div key={w} className="flex flex-col gap-1">
                        {heatmap.slice(w * 7, w * 7 + 7).map((day, d) => (
                          <div
                            key={d}
                            title={`${day.label}: ${day.count} workout${day.count !== 1 ? 's' : ''}`}
                            className={`w-full aspect-square rounded-sm ${
                              day.count === 0 ? 'bg-gray-100' : day.count === 1 ? 'bg-indigo-200' : 'bg-indigo-500'
                            }`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
                    <span>Less</span>
                    <div className="w-3 h-3 rounded-sm bg-gray-100" />
                    <div className="w-3 h-3 rounded-sm bg-indigo-200" />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={2} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <ReferenceLine y={profile?.trainingDays || 3} stroke="#6366f1" strokeDasharray="4 2"
                      label={{ value: 'target', position: 'right', fontSize: 10 }} />
                    <Bar dataKey="workouts" fill="#6366f1" radius={[3, 3, 0, 0]} />
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
