import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Checkbox } from '../components/ui/checkbox';
import { Progress } from '../components/ui/progress';
import { Slider } from '../components/ui/slider';
import { apiCall } from '../../utils/supabase-client';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface OnboardingData {
  name: string;
  primaryGoal: string;
  experienceLevel: string;
  gender: string;
  age: string;
  height: string;
  weight: string;
  equipment: string;
  customEquipment: string[];
  trainingDays: number;
  sessionLength: number;
  workoutStyle: string;
  absPreference: string;
  avgSleep: number;
  activityLevel: string;
  stressLevel: number;
  jobActivity: string;
  cardioSessions: number;
  injuries: string;
}

export function Onboarding() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [data, setData] = useState<OnboardingData>({
    name: '',
    primaryGoal: '',
    experienceLevel: '',
    gender: '',
    age: '',
    height: '',
    weight: '',
    equipment: '',
    customEquipment: [],
    trainingDays: 3,
    sessionLength: 60,
    workoutStyle: '',
    absPreference: '',
    avgSleep: 7,
    activityLevel: '',
    stressLevel: 5,
    jobActivity: '',
    cardioSessions: 0,
    injuries: '',
  });

  const totalSteps = 10;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await apiCall('/profile/onboarding', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      toast.success('Profile created! Let\'s build your workout plan');
      navigate('/workout-builder');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return data.name.trim() !== '';
      case 2: return data.primaryGoal !== '';
      case 3: return data.experienceLevel !== '';
      case 4: return data.gender !== '' && data.age !== '' && data.height !== '' && data.weight !== '';
      case 5: return data.equipment !== '';
      case 6: return true;
      case 7: return data.workoutStyle !== '';
      case 8: return data.absPreference !== '';
      case 9: return data.activityLevel !== '' && data.jobActivity !== '';
      case 10: return true;
      default: return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm text-gray-600">
              <span>Step {step} of {totalSteps}</span>
              <span>{Math.round((step / totalSteps) * 100)}%</span>
            </div>
            <Progress value={(step / totalSteps) * 100} className="h-2" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <CardTitle>What's your name?</CardTitle>
              <CardDescription>Let's personalize your experience</CardDescription>
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                  placeholder="John Doe"
                  autoFocus
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <CardTitle>What's your primary goal?</CardTitle>
              <RadioGroup value={data.primaryGoal} onValueChange={(v) => setData({ ...data, primaryGoal: v })}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="build_muscle" id="build_muscle" />
                  <Label htmlFor="build_muscle">Build Muscle</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="lose_fat" id="lose_fat" />
                  <Label htmlFor="lose_fat">Lose Fat</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="increase_strength" id="increase_strength" />
                  <Label htmlFor="increase_strength">Increase Strength</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="general_fitness" id="general_fitness" />
                  <Label htmlFor="general_fitness">General Fitness</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="athletic_performance" id="athletic_performance" />
                  <Label htmlFor="athletic_performance">Athletic Performance</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <CardTitle>What's your experience level?</CardTitle>
              <RadioGroup value={data.experienceLevel} onValueChange={(v) => setData({ ...data, experienceLevel: v })}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="beginner" id="beginner" />
                  <Label htmlFor="beginner">Beginner - Less than 6 months</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="intermediate" id="intermediate" />
                  <Label htmlFor="intermediate">Intermediate - 6 months to 2 years</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="advanced" id="advanced" />
                  <Label htmlFor="advanced">Advanced - 2+ years</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <CardTitle>Tell us about yourself</CardTitle>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <RadioGroup value={data.gender} onValueChange={(v) => setData({ ...data, gender: v })}>
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="male" id="male" />
                        <Label htmlFor="male">Male</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="female" id="female" />
                        <Label htmlFor="female">Female</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="other" id="other" />
                        <Label htmlFor="other">Other</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="age">Age</Label>
                    <Input
                      id="age"
                      type="number"
                      value={data.age}
                      onChange={(e) => setData({ ...data, age: e.target.value })}
                      placeholder="25"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height">Height (cm)</Label>
                    <Input
                      id="height"
                      type="number"
                      value={data.height}
                      onChange={(e) => setData({ ...data, height: e.target.value })}
                      placeholder="175"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weight">Weight (kg)</Label>
                    <Input
                      id="weight"
                      type="number"
                      value={data.weight}
                      onChange={(e) => setData({ ...data, weight: e.target.value })}
                      placeholder="70"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <CardTitle>What equipment do you have access to?</CardTitle>
              <RadioGroup value={data.equipment} onValueChange={(v) => setData({ ...data, equipment: v })}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="full_gym" id="full_gym" />
                  <Label htmlFor="full_gym">Full Gym Access</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="bodyweight" id="bodyweight" />
                  <Label htmlFor="bodyweight">Bodyweight Only</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="limited" id="limited" />
                  <Label htmlFor="limited">Limited Equipment</Label>
                </div>
              </RadioGroup>
              {data.equipment === 'limited' && (
                <div className="mt-4 space-y-2 pl-6">
                  <Label>Select your available equipment:</Label>
                  {['Dumbbells', 'Barbell', 'Pull-up bar', 'Resistance bands', 'Bench'].map((item) => (
                    <div key={item} className="flex items-center space-x-2">
                      <Checkbox
                        id={item}
                        checked={data.customEquipment.includes(item)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setData({ ...data, customEquipment: [...data.customEquipment, item] });
                          } else {
                            setData({ ...data, customEquipment: data.customEquipment.filter((e) => e !== item) });
                          }
                        }}
                      />
                      <Label htmlFor={item}>{item}</Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6">
              <CardTitle>Training Availability</CardTitle>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Training days per week: {data.trainingDays}</Label>
                  <Slider
                    value={[data.trainingDays]}
                    onValueChange={([v]) => setData({ ...data, trainingDays: v })}
                    min={2}
                    max={6}
                    step={1}
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>2 days</span>
                    <span>6 days</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Session length (minutes): {data.sessionLength}</Label>
                  <Slider
                    value={[data.sessionLength]}
                    onValueChange={([v]) => setData({ ...data, sessionLength: v })}
                    min={30}
                    max={120}
                    step={15}
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>30 min</span>
                    <span>120 min</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <CardTitle>Preferred Workout Style</CardTitle>
              <RadioGroup value={data.workoutStyle} onValueChange={(v) => setData({ ...data, workoutStyle: v })}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="full_body" id="full_body" />
                  <Label htmlFor="full_body">Full Body (3x/week)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="upper_lower" id="upper_lower" />
                  <Label htmlFor="upper_lower">Upper/Lower Split (4x/week)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ppl" id="ppl" />
                  <Label htmlFor="ppl">Push/Pull/Legs (6x/week)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="bro_split" id="bro_split" />
                  <Label htmlFor="bro_split">Bro Split (5-6x/week)</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-4">
              <CardTitle>Ab Training Preference</CardTitle>
              <RadioGroup value={data.absPreference} onValueChange={(v) => setData({ ...data, absPreference: v })}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all_days" id="all_days" />
                  <Label htmlFor="all_days">Add abs to all workout days</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="specific_days" id="specific_days" />
                  <Label htmlFor="specific_days">Add abs to specific days (I'll choose later)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="none" />
                  <Label htmlFor="none">No dedicated ab work</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {step === 9 && (
            <div className="space-y-6">
              <CardTitle>Recovery & Lifestyle</CardTitle>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Average sleep (hours): {data.avgSleep}</Label>
                  <Slider
                    value={[data.avgSleep]}
                    onValueChange={([v]) => setData({ ...data, avgSleep: v })}
                    min={4}
                    max={10}
                    step={0.5}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Activity outside gym</Label>
                  <RadioGroup value={data.activityLevel} onValueChange={(v) => setData({ ...data, activityLevel: v })}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="sedentary" id="sedentary" />
                      <Label htmlFor="sedentary">Sedentary</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="lightly_active" id="lightly_active" />
                      <Label htmlFor="lightly_active">Lightly Active</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="moderately_active" id="moderately_active" />
                      <Label htmlFor="moderately_active">Moderately Active</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="very_active" id="very_active" />
                      <Label htmlFor="very_active">Very Active</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label>Stress level (1-10): {data.stressLevel}</Label>
                  <Slider
                    value={[data.stressLevel]}
                    onValueChange={([v]) => setData({ ...data, stressLevel: v })}
                    min={1}
                    max={10}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Job activity level</Label>
                  <RadioGroup value={data.jobActivity} onValueChange={(v) => setData({ ...data, jobActivity: v })}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="desk" id="desk" />
                      <Label htmlFor="desk">Desk job</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="standing" id="standing" />
                      <Label htmlFor="standing">Standing/moderate movement</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="physical" id="physical" />
                      <Label htmlFor="physical">Physical labor</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label>Cardio sessions per week: {data.cardioSessions}</Label>
                  <Slider
                    value={[data.cardioSessions]}
                    onValueChange={([v]) => setData({ ...data, cardioSessions: v })}
                    min={0}
                    max={7}
                    step={1}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 10 && (
            <div className="space-y-4">
              <CardTitle>Movement & History</CardTitle>
              <CardDescription>Any injuries or limitations we should know about?</CardDescription>
              <div className="space-y-2">
                <Label htmlFor="injuries">Injuries or limitations (optional)</Label>
                <textarea
                  id="injuries"
                  value={data.injuries}
                  onChange={(e) => setData({ ...data, injuries: e.target.value })}
                  placeholder="e.g., lower back pain, shoulder impingement, knee issues..."
                  className="w-full min-h-[120px] px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === 1}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            {step < totalSteps ? (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? 'Saving...' : 'Complete Setup'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
