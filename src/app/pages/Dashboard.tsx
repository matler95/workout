import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiCall } from '../../utils/supabase-client';
import { Calendar, TrendingUp, Target, Flame, Dumbbell } from 'lucide-react';
import { format } from 'date-fns';

export function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [workoutPlan, setWorkoutPlan] = useState<any>(null);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [bodyweightData, setBodyweightData] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

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
      setWorkoutHistory(historyRes.history || []);
      setBodyweightData(weightRes.entries || []);
    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const getWeeklyProgress = () => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());

    const thisWeekWorkouts = workoutHistory.filter((log) => {
      const logDate = new Date(log.completedAt);
      return logDate >= weekStart;
    });

    const plannedDays = profile?.trainingDays || 3;
    return {
      completed: thisWeekWorkouts.length,
      planned: plannedDays,
      percentage: (thisWeekWorkouts.length / plannedDays) * 100,
    };
  };

  const getReadinessScore = () => {
    if (!profile) return 0;

    const sleepScore = (profile.avgSleep / 8) * 40;
    const stressScore = ((10 - profile.stressLevel) / 10) * 30;
    const activityScore = 30;

    return Math.round(sleepScore + stressScore + activityScore);
  };

  const getNextWorkout = () => {
    if (!workoutPlan?.workouts) return null;

    const workoutDays = Object.keys(workoutPlan.workouts);
    const lastWorkout = workoutHistory[0];

    if (!lastWorkout) {
      return { day: workoutDays[0], isToday: true };
    }

    const lastDayIndex = workoutDays.indexOf(lastWorkout.dayName);
    const nextDayIndex = (lastDayIndex + 1) % workoutDays.length;

    return { day: workoutDays[nextDayIndex], isToday: false };
  };

  const getCalorieTarget = () => {
    if (!profile) return 2000;

    const { weight, age, gender, primaryGoal, activityLevel } = profile;
    let bmr = gender === 'male' ? 88.362 + (13.397 * weight) + (4.799 * 175) - (5.677 * age)
                                : 447.593 + (9.247 * weight) + (3.098 * 165) - (4.330 * age);

    const activityMultiplier = {
      sedentary: 1.2,
      lightly_active: 1.375,
      moderately_active: 1.55,
      very_active: 1.725,
    }[activityLevel] || 1.5;

    let tdee = bmr * activityMultiplier;

    if (primaryGoal === 'build_muscle') tdee += 300;
    if (primaryGoal === 'lose_fat') tdee -= 500;

    return Math.round(tdee);
  };

  const getProteinTarget = () => {
    if (!profile) return 150;
    return Math.round(profile.weight * 2.2);
  };

  const weeklyProgress = profile ? getWeeklyProgress() : { completed: 0, planned: 3, percentage: 0 };
  const readinessScore = getReadinessScore();
  const nextWorkout = getNextWorkout();
  const calorieTarget = getCalorieTarget();
  const proteinTarget = getProteinTarget();

  const weightChartData = bodyweightData.slice(0, 7).reverse().map((entry: any, idx) => ({
    name: `Day ${idx + 1}`,
    weight: entry,
  }));

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Complete Your Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              You haven't completed onboarding yet. Let's set up your profile!
            </p>
            <Button onClick={() => navigate('/onboarding')} className="w-full">
              Start Onboarding
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!workoutPlan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Create Your Workout Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              You haven't created a workout plan yet. Let's build one!
            </p>
            <Button onClick={() => navigate('/workout-builder')} className="w-full">
              Build Workout Plan
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {profile.name}!</h1>
          <p className="text-gray-600 flex items-center gap-2 mt-1">
            <Calendar className="w-4 h-4" />
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">This Week</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold">{weeklyProgress.completed}/{weeklyProgress.planned}</span>
                  <span className="text-sm text-gray-600">workouts</span>
                </div>
                <Progress value={weeklyProgress.percentage} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Readiness Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-4xl font-bold">{readinessScore}</span>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  readinessScore >= 80 ? 'bg-green-100' : readinessScore >= 60 ? 'bg-yellow-100' : 'bg-red-100'
                }`}>
                  <Flame className={`w-8 h-8 ${
                    readinessScore >= 80 ? 'text-green-600' : readinessScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                  }`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Daily Targets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Calories</span>
                  <span className="font-medium">{calorieTarget} kcal</span>
                </div>
                <Progress value={0} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Protein</span>
                  <span className="font-medium">{proteinTarget}g</span>
                </div>
                <Progress value={0} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Current Weight
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{profile.weight} kg</div>
              <p className="text-xs text-gray-600 mt-1">Target: {profile.primaryGoal.replace('_', ' ')}</p>
            </CardContent>
          </Card>
        </div>

        {bodyweightData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Weight Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={weightChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Dumbbell className="w-5 h-5" />
              Next Workout
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nextWorkout ? (
              <div className="space-y-3">
                <div>
                  <div className="text-xl font-bold">{nextWorkout.day}</div>
                  <p className="text-sm text-gray-600">
                    {nextWorkout.isToday ? 'Ready to train today!' : 'Coming up next'}
                  </p>
                </div>
                <Button
                  onClick={() => navigate('/active-workout', { state: { dayName: nextWorkout.day } })}
                  className="w-full"
                >
                  Start Workout
                </Button>
              </div>
            ) : (
              <p className="text-sm text-gray-600">No upcoming workout</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
