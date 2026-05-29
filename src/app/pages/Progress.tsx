import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiCall } from '../../utils/supabase-client';
import { TrendingUp, Activity, Calendar, Flame } from 'lucide-react';

export function Progress() {
  const [bodyweightData, setBodyweightData] = useState<any[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [weightRes, historyRes] = await Promise.all([
        apiCall('/progress/bodyweight'),
        apiCall('/workouts/history'),
      ]);
      setBodyweightData(weightRes.entries || []);
      setWorkoutHistory(historyRes.history || []);
    } catch (error: any) {
      console.error('Failed to load progress:', error);
    }
  };

  const weightChartData = bodyweightData.slice(0, 30).reverse().map((entry: any, idx) => ({
    date: `Day ${idx + 1}`,
    weight: entry,
  }));

  const getStreakData = () => {
    const weeks = 12;
    const data = Array.from({ length: weeks }, (_, i) => ({
      week: `W${weeks - i}`,
      workouts: Math.floor(Math.random() * 5),
    }));
    return data;
  };

  const streakData = getStreakData();

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

          <TabsContent value="body" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Bodyweight Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {weightChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={weightChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-600 py-8 text-center">
                    No bodyweight data yet. Start tracking!
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="grid sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">BMI</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">22.5</div>
                  <p className="text-xs text-gray-600">Normal range</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">Est. Body Fat</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">15%</div>
                  <p className="text-xs text-gray-600">Approximate</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">Lean Mass</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">59.5 kg</div>
                  <p className="text-xs text-gray-600">Estimated</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="strength" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Strength Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  Track your progress by exercise as you complete workouts.
                </p>
                <div className="mt-4 space-y-3">
                  {['Bench Press', 'Squat', 'Deadlift'].map((exercise) => (
                    <div key={exercise} className="p-3 border rounded-lg">
                      <div className="font-medium">{exercise}</div>
                      <div className="text-sm text-gray-600 mt-1">No data yet</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="volume" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Weekly Volume
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  Muscle group activation based on completed workouts.
                </p>
                <div className="mt-4 space-y-2">
                  {['Chest', 'Back', 'Shoulders', 'Arms', 'Legs'].map((muscle) => (
                    <div key={muscle}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{muscle}</span>
                        <span className="text-gray-600">0 sets</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600" style={{ width: '0%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="streaks" className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">Current Streak</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Flame className="w-8 h-8 text-orange-500" />
                    <div className="text-3xl font-bold">0</div>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">weeks</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">Longest Streak</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">0</div>
                  <p className="text-xs text-gray-600 mt-1">weeks</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-600">Consistency</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">0%</div>
                  <p className="text-xs text-gray-600 mt-1">this month</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Activity Heatmap
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={streakData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="workouts" fill="#6366f1" />
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
