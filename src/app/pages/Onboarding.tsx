import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Progress } from '../components/ui/progress';
import { Slider } from '../components/ui/slider';
import { Textarea } from '../components/ui/textarea';
import { profileApi, progressApi } from '../../utils/api';
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

// ─── Validation ────────────────────────────────────────────────────────────────

// FIX #2 (expanded): client-side range validation for all numeric onboarding inputs.
// These ranges are intentionally generous — they're a sanity check, not medical criteria.
//   Age:            13–100  (DB allows 10–120; we tighten slightly for realistic users)
//   Height:        100–250 cm (DB allows 50–300)
//   Weight:         30–300 kg  (DB allows 20–500)
//   Training days:   1–7   (DB allows 1–7; UI previously restricted to 2 — fix #3)
//   Session length: 15–180 min (DB minimum is 15)

function validateDemographics(data: OnboardingData): string | null {
  const age    = parseInt(data.age);
  const height = parseFloat(data.height);
  const weight = parseFloat(data.weight);

  if (!data.age    || isNaN(age))    return 'Please enter your age.';
  if (age    < 13  || age    > 100)  return 'Age must be between 13 and 100.';
  if (!data.height || isNaN(height)) return 'Please enter your height.';
  if (height < 100 || height > 250)  return 'Height must be between 100 and 250 cm.';
  if (!data.weight || isNaN(weight)) return 'Please enter your weight.';
  if (weight < 30  || weight > 300)  return 'Weight must be between 30 and 300 kg.';

  return null;
}

function validateAvailability(data: OnboardingData): string | null {
  // FIX #3: training days now allows 1 (min was previously 2 in the UI slider,
  // but the DB always accepted 1–7). This validation confirms the value is in range.
  if (data.trainingDays < 1 || data.trainingDays > 7)
    return 'Training days must be between 1 and 7.';
  if (data.sessionLength < 15 || data.sessionLength > 180)
    return 'Session length must be between 15 and 180 minutes.';
  return null;
}

export function Onboarding() {
  const [step, setStep]       = useState(1);
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
    // FIX #2: validate demographics on step 4 before advancing
    if (step === 4) {
      const err = validateDemographics(data);
      if (err) { toast.error(err); return; }
    }
    // FIX #3 / #2: validate availability on step 6
    if (step === 6) {
      const err = validateAvailability(data);
      if (err) { toast.error(err); return; }
    }
    if (step < totalSteps) setStep(step + 1);
  };

  const handleBack = () => { if (step > 1) setStep(step - 1); };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await profileApi.saveOnboarding(data as any);

      // Log initial bodyweight from onboarding
      const weight = parseFloat(data.weight);
      if (weight && weight >= 20 && weight <= 500) {
        const today = new Date().toISOString().split('T')[0];
        progressApi.logBodyweight(weight, today).catch(() => {
          // Non-critical — don't block onboarding if this fails
        });
      }

      toast.success("Profile created! Let's build your workout plan");
      navigate('/workout-builder');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:  return data.name.trim() !== '';
      case 2:  return data.primaryGoal !== '';
      case 3:  return data.experienceLevel !== '';
      case 4:  return data.gender !== '' && data.age !== '' && data.height !== '' && data.weight !== '';
      case 5:  return data.equipment !== '';
      case 6:  return true;
      case 7:  return data.workoutStyle !== '';
      case 8:  return data.absPreference !== '';
      case 9:  return data.activityLevel !== '' && data.jobActivity !== '';
      case 10: return true;
      default: return false;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-violet-600" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_50%)]" />

      <Card className="w-full max-w-2xl relative z-10 border-0 shadow-2xl shadow-black/10">
        <CardHeader>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <span>Step {step} of {totalSteps}</span>
              <span>{Math.round((step / totalSteps) * 100)}%</span>
            </div>
            <Progress value={(step / totalSteps) * 100} className="h-2" />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">

          {/* Step 1 — Name */}
          {step === 1 && (
            <div className="space-y-4">
              <CardTitle>What's your name?</CardTitle>
              <CardDescription>Let's personalise your experience</CardDescription>
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={data.name}
                  onChange={e => setData({ ...data, name: e.target.value })}
                  placeholder="John Doe"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Step 2 — Goal */}
          {step === 2 && (
            <div className="space-y-4">
              <CardTitle>What's your primary goal?</CardTitle>
              <RadioGroup value={data.primaryGoal} onValueChange={v => setData({ ...data, primaryGoal: v })}>
                {[
                  { value: 'build_muscle',        label: 'Build Muscle' },
                  { value: 'lose_fat',             label: 'Lose Fat' },
                  { value: 'increase_strength',    label: 'Increase Strength' },
                  { value: 'general_fitness',      label: 'General Fitness' },
                  { value: 'athletic_performance', label: 'Athletic Performance' },
                ].map(o => (
                  <div key={o.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={o.value} id={o.value} />
                    <Label htmlFor={o.value}>{o.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Step 3 — Experience */}
          {step === 3 && (
            <div className="space-y-4">
              <CardTitle>What's your experience level?</CardTitle>
              <RadioGroup value={data.experienceLevel} onValueChange={v => setData({ ...data, experienceLevel: v })}>
                {[
                  { value: 'beginner',     label: 'Beginner — Less than 6 months' },
                  { value: 'intermediate', label: 'Intermediate — 6 months to 2 years' },
                  { value: 'advanced',     label: 'Advanced — 2+ years' },
                ].map(o => (
                  <div key={o.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={o.value} id={o.value} />
                    <Label htmlFor={o.value}>{o.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Step 4 — Demographics */}
          {step === 4 && (
            <div className="space-y-4">
              <CardTitle>Tell us about yourself</CardTitle>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <RadioGroup value={data.gender} onValueChange={v => setData({ ...data, gender: v })}>
                    <div className="flex gap-4">
                      {[
                        { value: 'male',   label: 'Male' },
                        { value: 'female', label: 'Female' },
                        { value: 'other',  label: 'Other' },
                      ].map(o => (
                        <div key={o.value} className="flex items-center space-x-2">
                          <RadioGroupItem value={o.value} id={o.value} />
                          <Label htmlFor={o.value}>{o.label}</Label>
                        </div>
                      ))}
                    </div>
                  </RadioGroup>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {/* FIX #2: tightened to realistic ranges (13–100, 100–250, 30–300) */}
                  <div className="space-y-2">
                    <Label htmlFor="age">Age</Label>
                    <Input
                      id="age"
                      type="number"
                      min={13}
                      max={100}
                      value={data.age}
                      onChange={e => setData({ ...data, age: e.target.value })}
                      placeholder="25"
                    />
                    <p className="text-xs text-muted-foreground">13–100</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height">Height (cm)</Label>
                    <Input
                      id="height"
                      type="number"
                      min={100}
                      max={250}
                      value={data.height}
                      onChange={e => setData({ ...data, height: e.target.value })}
                      placeholder="175"
                    />
                    <p className="text-xs text-muted-foreground">100–250 cm</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weight">Weight (kg)</Label>
                    <Input
                      id="weight"
                      type="number"
                      min={30}
                      max={300}
                      value={data.weight}
                      onChange={e => setData({ ...data, weight: e.target.value })}
                      placeholder="70"
                    />
                    <p className="text-xs text-muted-foreground">30–300 kg</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5 — Equipment */}
          {step === 5 && (
            <div className="space-y-4">
              <CardTitle>What equipment do you have access to?</CardTitle>
              <RadioGroup value={data.equipment} onValueChange={v => setData({ ...data, equipment: v })}>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="full_gym" id="full_gym" className="mt-0.5" />
                  <div>
                    <Label htmlFor="full_gym">Full Gym Access</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Barbells, cables, machines, dumbbells</p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="limited" id="limited" className="mt-0.5" />
                  <div>
                    <Label htmlFor="limited">Home / Limited Equipment</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Dumbbells, pull-up bar, resistance bands</p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="bodyweight" id="bodyweight" className="mt-0.5" />
                  <div>
                    <Label htmlFor="bodyweight">Bodyweight Only</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">No equipment needed</p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Step 6 — Availability */}
          {step === 6 && (
            <div className="space-y-6">
              <CardTitle>Training Availability</CardTitle>
              <div className="space-y-4">
                <div className="space-y-2">
                  {/* FIX #3: min changed from 2 to 1 — some users train only once a week */}
                  <Label>Training days per week: {data.trainingDays}</Label>
                  <Slider
                    value={[data.trainingDays]}
                    onValueChange={([v]) => setData({ ...data, trainingDays: v })}
                    min={1} max={7} step={1}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1 day</span><span>7 days</span>
                  </div>
                  {data.trainingDays === 1 && (
                    <p className="text-xs text-amber-600 mt-1">
                      One session per week is a great start — full-body training works best at this frequency.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Session length (minutes): {data.sessionLength}</Label>
                  <Slider
                    value={[data.sessionLength]}
                    onValueChange={([v]) => setData({ ...data, sessionLength: v })}
                    min={15} max={120} step={15}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>15 min</span><span>120 min</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 7 — Workout style */}
          {step === 7 && (
            <div className="space-y-4">
              <CardTitle>Preferred Workout Style</CardTitle>
              <RadioGroup value={data.workoutStyle} onValueChange={v => setData({ ...data, workoutStyle: v })}>
                {[
                  { value: 'full_body',    label: 'Full Body',         sub: '3×/week — trains all muscles every session' },
                  { value: 'upper_lower',  label: 'Upper / Lower',     sub: '4×/week — alternates upper and lower days' },
                  { value: 'ppl',          label: 'Push / Pull / Legs',sub: '6×/week — dedicated push, pull, and leg days' },
                  { value: 'bro_split',    label: 'Bro Split',         sub: '5–6×/week — one muscle group per day' },
                ].map(o => (
                  <div key={o.value} className="flex items-start space-x-2">
                    <RadioGroupItem value={o.value} id={o.value} className="mt-0.5" />
                    <div>
                      <Label htmlFor={o.value}>{o.label}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{o.sub}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
              {data.trainingDays <= 2 && data.workoutStyle !== '' && data.workoutStyle !== 'full_body' && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                  Full body training is usually most effective with {data.trainingDays} day{data.trainingDays > 1 ? 's' : ''}/week.
                </p>
              )}
            </div>
          )}

          {/* Step 8 — Abs */}
          {step === 8 && (
            <div className="space-y-4">
              <CardTitle>Ab Training Preference</CardTitle>
              <RadioGroup value={data.absPreference} onValueChange={v => setData({ ...data, absPreference: v })}>
                {[
                  { value: 'all_days',      label: 'Add abs to all workout days' },
                  { value: 'specific_days', label: "Add abs to specific days (I'll choose in the builder)" },
                  { value: 'none',          label: 'No dedicated ab work' },
                ].map(o => (
                  <div key={o.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={o.value} id={o.value} />
                    <Label htmlFor={o.value}>{o.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Step 9 — Recovery */}
          {step === 9 && (
            <div className="space-y-6">
              <CardTitle>Recovery & Lifestyle</CardTitle>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Average sleep (hours): {data.avgSleep}</Label>
                  <Slider
                    value={[data.avgSleep]}
                    onValueChange={([v]) => setData({ ...data, avgSleep: v })}
                    min={4} max={10} step={0.5}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>4h</span><span>10h</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Activity outside the gym</Label>
                  <RadioGroup value={data.activityLevel} onValueChange={v => setData({ ...data, activityLevel: v })}>
                    {[
                      { value: 'sedentary',         label: 'Sedentary — mostly sitting' },
                      { value: 'lightly_active',    label: 'Lightly active — light walking' },
                      { value: 'moderately_active', label: 'Moderately active — regular movement' },
                      { value: 'very_active',       label: 'Very active — physical job or sport' },
                    ].map(o => (
                      <div key={o.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={o.value} id={o.value} />
                        <Label htmlFor={o.value}>{o.label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label>Stress level (1 = low, 10 = high): {data.stressLevel}</Label>
                  <Slider
                    value={[data.stressLevel]}
                    onValueChange={([v]) => setData({ ...data, stressLevel: v })}
                    min={1} max={10} step={1}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Low stress</span><span>High stress</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Job activity</Label>
                  <RadioGroup value={data.jobActivity} onValueChange={v => setData({ ...data, jobActivity: v })}>
                    {[
                      { value: 'desk',     label: 'Desk job' },
                      { value: 'standing', label: 'Standing / moderate movement' },
                      { value: 'physical', label: 'Physical labour' },
                    ].map(o => (
                      <div key={o.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={o.value} id={`job-${o.value}`} />
                        <Label htmlFor={`job-${o.value}`}>{o.label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label>Cardio sessions per week: {data.cardioSessions}</Label>
                  <Slider
                    value={[data.cardioSessions]}
                    onValueChange={([v]) => setData({ ...data, cardioSessions: v })}
                    min={0} max={7} step={1}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0</span><span>7</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 10 — Injuries */}
          {step === 10 && (
            <div className="space-y-4">
              <CardTitle>Movement & History</CardTitle>
              <CardDescription>Any injuries or limitations we should know about?</CardDescription>
              <div className="space-y-2">
                <Label htmlFor="injuries">Injuries or limitations (optional)</Label>
                <Textarea
                  id="injuries"
                  value={data.injuries}
                  onChange={e => setData({ ...data, injuries: e.target.value })}
                  placeholder="e.g., lower back pain, shoulder impingement, knee issues..."
                  rows={4}
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={handleBack} disabled={step === 1} className="rounded-xl">
              <ChevronLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            {step < totalSteps ? (
              <Button onClick={handleNext} disabled={!canProceed()} className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-500/20">
                Next <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading} className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-500/20">
                {loading ? 'Saving...' : 'Complete Setup'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
