import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { apiCall } from '../../utils/supabase-client';
import { Badge } from '../components/ui/badge';
import { TrendingUp, Activity, Calendar, Flame, Dumbbell } from 'lucide-react';
import { format, subDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { ProgressionInsights } from '../components/ProgressionInsights';

interface SetLog {
  exerciseId: string;
  exerciseName: string;
  set: number;
  weight: number;
  reps: number;
  timestamp: string;
}

interface WorkoutLog {
  dayName: string;
  completedAt: string;
  sets: SetLog[];
  feedback?: string;
  perceivedEffort?: number;
}

export function Progress() {
  const [bodyweightData, setBodyweightData] = useState<{ date: string; weight: number }[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutLog[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [weightRes, historyRes, profileRes] = await Promise.all([
        apiCall('/progress/bodyweight'),
        apiCall('/workouts/history'),
        apiCall('/profile'),
      ]);
      setBodyweightData(weightRes.entries || []);
      const sorted = [...(historyRes.history || [])].sort(
        (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      );
      setWorkoutHistory(sorted);
      setProfile(profileRes.profile);
    } catch (e) {
      console.error('Failed to load progress:', e);
    } finally {
      setLoading(false);
    }
  };

  // ── Strength data ──────────────────────────────────────────────────────────
  const getStrengthData = () => {
    const exerciseMap: { [name: string]: { date: string; weight: number; reps: number; volume: number }[] } = {};

    for (const log of [...workoutHistory].reverse()) {
      const date = format(parseISO(log.completedAt), 'MMM d');
      const byExercise: { [id: string]: SetLog[] } = {};
      for (const s of (log.sets || [])) {
        if (!byExercise[s.exerciseName]) byExercise[s.exerciseName] = [];
        byExercise[s.exerciseName].push(s);
      }
      for (const [name, sets] of Object.entries(byExercise)) {
        const best = sets.reduce((max, s) => s.weight > max.weight ? s : max, sets[0]);
        const vol = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
        if (!exerciseMap[name]) exerciseMap[name] = [];
        exerciseMap[name].push({ date, weight: best.weight, reps: best.reps, volume: vol });
      }
    }
    return exerciseMap;
  };

  // ── Volume data ────────────────────────────────────────────────────────────
  const getVolumeData = () => {
    const muscleVolume: { [muscle: string]: number } = {};
    const oneWeekAgo = subDays(new Date(), 7);

    for (const log of workoutHistory) {
      if (new Date(log.completedAt) < oneWeekAgo) continue;
      for (const s of (log.sets || [])) {
        // We don't have muscle info in sets directly, use exercise name heuristics
        // The exercise data has primaryMuscles, but we only store exerciseName in sets
        // We'll bucket by exerciseId/name patterns
        const name = s.exerciseName?.toLowerCase() || '';
        const muscles = inferMuscles(name);
        for (const m of muscles) {
          muscleVolume[m] = (muscleVolume[m] || 0) + s.reps;
        }
      }
    }

    const muscleOrder = ['Chest', 'Back', 'Quads', 'Hamstrings', 'Shoulders', 'Biceps', 'Triceps', 'Core'];
    const maxVol = Math.max(...Object.values(muscleVolume), 1);
    return muscleOrder.map(m => ({
      muscle: m,
      sets: muscleVolume[m] || 0,
      pct: Math.round(((muscleVolume[m] || 0) / maxVol) * 100),
    }));
  };

  const inferMuscles = (name: string): string[] => {
    if (name.includes('bench') || name.includes('chest') || name.includes('push-up') || name.includes('pushup') || name.includes('dip') || name.includes('fly')) return ['Chest', 'Triceps'];
    if (name.includes('row') || name.includes('pull') || name.includes('lat') || name.includes('deadlift')) return ['Back', 'Biceps'];
    if (name.includes('squat') || name.includes('leg press') || name.includes('lunge')) return ['Quads', 'Hamstrings'];
    if (name.includes('romanian') || name.includes('hamstring') || name.includes('curl')) return ['Hamstrings'];
    if (name.includes('press') || name.includes('delt') || name.includes('shoulder')) return ['Shoulders', 'Triceps'];
    if (name.includes('curl') || name.includes('bicep')) return ['Biceps'];
    if (name.includes('tricep') || name.includes('extension') || name.includes('pushdown')) return ['Triceps'];
    if (name.includes('plank') || name.includes('crunch') || name.includes('ab') || name.includes('core')) return ['Core'];
    return [];
  };

  // ── Streak & heatmap data ──────────────────────────────────────────────────
  const getStreakInfo = () => {
    if (workoutHistory.length === 0) return { current: 0, longest: 0, consistency: 0 };

    const plannedPerWeek = profile?.trainingDays || 3;
    const weeks: { [weekKey: string]: number } = {};

    for (const log of workoutHistory) {
      const d = parseISO(log.completedAt);
      const weekStart = startOfWeek(d, { weekStartsOn: 1 });
      const key = format(weekStart, 'yyyy-MM-dd');
      weeks[key] = (weeks[key] || 0) + 1;
    }

    const weekKeys = Object.keys(weeks).sort();
    let currentStreak = 0;
    let longestStreak = 0;
    let streak = 0;

    const nowWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

    for (const key of weekKeys) {
      if (weeks[key] >= plannedPerWeek) {
        streak++;
        longestStreak = Math.max(longestStreak, streak);
      } else {
        streak = 0;
      }
    }

    // Current streak: count back from now
    const sortedDesc = [...weekKeys].reverse();
    for (const key of sortedDesc) {
      if (weeks[key] >= plannedPerWeek) currentStreak++;
      else break;
    }

    // Last 30 days consistency
    const last30 = subDays(new Date(), 30);
    const workoutsLast30 = workoutHistory.filter(l => new Date(l.completedAt) >= last30).length;
    const expectedLast30 = Math.round((plannedPerWeek / 7) * 30);
    const consistency = Math.min(100, Math.round((workoutsLast30 / expectedLast30) * 100));

    return { current: currentStreak, longest: longestStreak, consistency };
  };

  const getHeatmapData = () => {
    // Last 12 weeks, 7 days each = 84 squares
    const days: { date: Date; count: number; label: string }[] = [];
    for (let i = 83; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const count = workoutHistory.filter(l => isSameDay(parseISO(l.completedAt), d)).length;
      days.push({ date: d, count, label: format(d, 'MMM d') });
    }
    return days;
  };

  const getWeeklyBarData = () => {
    const weeks: { week: string; workouts: number; target: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = startOfWeek(subDays(new Date(), i * 7), { weekStartsOn: 1 });
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const count = workoutHistory.filter(l => {
        const d = parseISO(l.completedAt);
        return d >= weekStart && d < weekEnd;
      }).length;
      weeks.push({
        week: format(weekStart, 'MMM d'),
        workouts: count,
        target: profile?.trainingDays || 3,
      });
    }
    return weeks;
  };

  const weightChartData = [...bodyweightData]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-30)
    .map(e => ({ date: format(parseISO(e.date), 'MMM d'), weight: e.weight }));

  const strengthData = getStrengthData();
  const exerciseNames = Object.keys(strengthData);
  const [selectedExercise, setSelectedExercise] = useState('');
  const activeExercise = selectedExercise || exerciseNames[0] || '';

  const volumeData = getVolumeData();
  const streakInfo = getStreakInfo();
  const heatmap = getHeatmapData();
  const weeklyBars = getWeeklyBarData();

  const bmi = profile ? Math.round((profile.weight / Math.pow(profile.height / 100, 2)) * 10) / 10 : null;
  const estBodyFat = profile
    ? profile.gender === 'male'
      ? Math.round(1.2 * bmi! + 0.23 * profile.age - 16.2)
      : Math.round(1.2 * bmi! + 0.23 * profile.age - 5.4)
    : null;
  const leanMass = profile && estBodyFat ? Math.round(profile.weight * (1 - estBodyFat / 100) * 10) / 10 : null;

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

          {/* ── Body Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="body" className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <div className="text-2xl font-bold">{bmi ?? '–'}</div>
                  <div className="text-xs text-gray-500 mt-1">BMI</div>
                  {bmi && (
                    <Badge variant={bmi < 18.5 ? 'destructive' : bmi < 25 ? 'secondary' : 'outline'} className="text-xs mt-1">
                      {bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'}
                    </Badge>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <div className="text-2xl font-bold">{estBodyFat ? `${estBodyFat}%` : '–'}</div>
                  <div className="text-xs text-gray-500 mt-1">Est. Body Fat</div>
                  <div className="text-xs text-gray-400 mt-1">approx.</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <div className="text-2xl font-bold">{leanMass ? `${leanMass}` : '–'}</div>
                  <div className="text-xs text-gray-500 mt-1">Lean kg</div>
                  <div className="text-xs text-gray-400 mt-1">estimated</div>
                </CardContent>
              </Card>
            </div>

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
                      ? `Current: ${weightChartData[0].weight} kg — log more entries to see a trend`
                      : 'No bodyweight data yet. Log your weight from the dashboard.'}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Strength Tab ──────────────────────────────────────────────── */}
          <TabsContent value="strength" className="space-y-4">
            {exerciseNames.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-gray-500">
                  <Dumbbell className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p>Complete workouts to see strength progress here.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Exercise selector */}
                <div className="flex gap-2 flex-wrap">
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
                      <CardTitle className="text-base">{activeExercise} — Top Set Weight</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={strengthData[activeExercise]}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} unit="kg" domain={['auto', 'auto']} />
                          <Tooltip formatter={(v: any) => [`${v}kg`, 'Weight']} />
                          <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Summary cards for all exercises */}
                <div className="space-y-2">
                  {exerciseNames.map(name => {
                    const data = strengthData[name];
                    const first = data[0];
                    const last = data[data.length - 1];
                    const diff = last.weight - first.weight;
                    return (
                      <Card key={name} className="cursor-pointer hover:border-indigo-300 transition-colors"
                        onClick={() => setSelectedExercise(name)}>
                        <CardContent className="py-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{name}</p>
                            <p className="text-xs text-gray-500">{data.length} session{data.length !== 1 ? 's' : ''} logged</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{last.weight}kg</p>
                            {data.length > 1 && (
                              <p className={`text-xs ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                                {diff > 0 ? '+' : ''}{diff}kg
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

            {/* Progression insights powered by progressive overload engine */}
            <ProgressionInsights />
          </TabsContent>

          {/* ── Volume Tab ────────────────────────────────────────────────── */}
          <TabsContent value="volume" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Muscle Volume This Week
                </CardTitle>
                <p className="text-xs text-gray-500">Based on total reps per muscle group</p>
              </CardHeader>
              <CardContent>
                {volumeData.every(d => d.sets === 0) ? (
                  <p className="text-sm text-gray-500 py-4 text-center">Complete workouts this week to see volume data</p>
                ) : (
                  <div className="space-y-3">
                    {volumeData.map(({ muscle, sets, pct }) => (
                      <div key={muscle}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{muscle}</span>
                          <span className="text-gray-500">{sets} reps</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {workoutHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Recent Workouts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {workoutHistory.slice(0, 5).map((log, i) => {
                      const totalVol = (log.sets || []).reduce((s, x) => s + x.weight * x.reps, 0);
                      return (
                        <div key={i} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                          <div>
                            <p className="font-medium">{log.dayName}</p>
                            <p className="text-xs text-gray-500">{format(parseISO(log.completedAt), 'EEE, MMM d')}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{(log.sets || []).length} sets</p>
                            <p className="text-xs text-gray-500">{Math.round(totalVol / 1000)}k kg vol</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Streaks Tab ───────────────────────────────────────────────── */}
          <TabsContent value="streaks" className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Flame className="w-5 h-5 text-orange-500" />
                    <span className="text-2xl font-bold">{streakInfo.current}</span>
                  </div>
                  <div className="text-xs text-gray-500">Current streak</div>
                  <div className="text-xs text-gray-400">weeks</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <div className="text-2xl font-bold">{streakInfo.longest}</div>
                  <div className="text-xs text-gray-500 mt-1">Best streak</div>
                  <div className="text-xs text-gray-400">weeks</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <div className="text-2xl font-bold">{streakInfo.consistency}%</div>
                  <div className="text-xs text-gray-500 mt-1">Consistency</div>
                  <div className="text-xs text-gray-400">last 30 days</div>
                </CardContent>
              </Card>
            </div>

            {/* Activity heatmap */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Activity — Last 12 Weeks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(12, 1fr)', minWidth: 280 }}>
                    {Array.from({ length: 12 }, (_, weekIdx) => (
                      <div key={weekIdx} className="flex flex-col gap-1">
                        {heatmap.slice(weekIdx * 7, weekIdx * 7 + 7).map((day, dayIdx) => (
                          <div
                            key={dayIdx}
                            title={`${day.label}: ${day.count} workout${day.count !== 1 ? 's' : ''}`}
                            className={`w-full aspect-square rounded-sm transition-colors ${
                              day.count === 0 ? 'bg-gray-100' :
                              day.count === 1 ? 'bg-indigo-200' :
                              'bg-indigo-500'
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

            {/* Weekly bar chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Workouts per Week</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={weeklyBars} barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={2} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <ReferenceLine y={profile?.trainingDays || 3} stroke="#6366f1" strokeDasharray="4 2" label={{ value: 'target', position: 'right', fontSize: 10 }} />
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
