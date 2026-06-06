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
  height: string;   // always cm
  weight: string;   // always kg
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

function validateDemographics(data: OnboardingData): string | null {
  const age    = parseInt(data.age);
  const height = parseFloat(data.height);
  const weight = parseFloat(data.weight);
  if (!data.age    || isNaN(age))    return 'Please enter your age.';
  if (age < 13     || age > 100)     return 'Age must be between 13 and 100.';
  if (!data.height || isNaN(height)) return 'Please enter your height.';
  if (height < 100 || height > 250)  return 'Height must be between 100 and 250 cm.';
  if (!data.weight || isNaN(weight)) return 'Please enter your weight.';
  if (weight < 30  || weight > 300)  return 'Weight must be between 30 and 300 kg.';
  return null;
}

function validateAvailability(data: OnboardingData): string | null {
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
    name: '', primaryGoal: '', experienceLevel: '',
    gender: '', age: '', height: '', weight: '',
    equipment: '', customEquipment: [],
    trainingDays: 3, sessionLength: 60,
    workoutStyle: '', absPreference: '',
    avgSleep: 7, activityLevel: '', stressLevel: 5,
    jobActivity: '', cardioSessions: 0, injuries: '',
  });

  const totalSteps = 10;

  const handleNext = () => {
    if (step === 4) { const err = validateDemographics(data); if (err) { toast.error(err); return; } }
    if (step === 6) { const err = validateAvailability(data); if (err) { toast.error(err); return; } }
    if (step < totalSteps) setStep(step + 1);
  };

  const handleBack = () => { if (step > 1) setStep(step - 1); };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await profileApi.saveOnboarding(data as any);
      const weight = parseFloat(data.weight);
      if (weight >= 20 && weight <= 300) {
        progressApi.logBodyweight(weight, new Date().toISOString().split('T')[0]).catch(() => {});
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

  const card = (title: string, desc?: string, children?: React.ReactNode) => (
    <div className="space-y-4">
      <CardTitle>{title}</CardTitle>
      {desc && <CardDescription>{desc}</CardDescription>}
      {children}
    </div>
  );

  const optionGrid = (
    field: keyof OnboardingData,
    options: { value: string; label: string; sub?: string }[],
    cols = 2
  ) => (
    <div className={`grid grid-cols-${cols} gap-3`}>
      {options.map(o => {
        const selected = data[field] === o.value;
        return (
          <button key={o.value} type="button"
            onClick={() => setData({ ...data, [field]: o.value })}
            className={`text-left p-3 rounded-2xl border ${selected ? 'bg-emerald-50 border-emerald-200 shadow-glow-emerald' : 'bg-card border-border'}`}>
            <div className="font-medium">{o.label}</div>
            {o.sub && <div className="text-xs text-muted-foreground mt-1">{o.sub}</div>}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-violet-600" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_50%)]" />

      <Card className="w-full max-w-2xl relative z-10 border-0 shadow-2xl shadow-black/10">
        <CardHeader>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <span>Step {step} of {totalSteps}</span>
              <span>{Math.round((step / totalSteps) * 100)}%</span>
            </div>
            <Progress value={(step / totalSteps) * 100} className="h-2" />
            <div className="flex items-center gap-2 mt-2">
              {Array.from({ length: totalSteps }, (_, i) => i + 1).map(n => (
                <div key={n} className={`w-2.5 h-2.5 rounded-full ${n === step ? 'bg-emerald-600' : 'bg-muted'}`} />
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {step === 1 && card('What\'s your name?', 'Let\'s personalise your experience',
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={data.name} onChange={e => setData({...data, name: e.target.value})} placeholder="John Doe" autoFocus />
            </div>
          )}

          {step === 2 && card('What\'s your primary goal?', undefined,
            optionGrid('primaryGoal', [
              { value: 'build_muscle',        label: 'Build Muscle' },
              { value: 'lose_fat',             label: 'Lose Fat' },
              { value: 'increase_strength',    label: 'Increase Strength' },
              { value: 'general_fitness',      label: 'General Fitness' },
              { value: 'athletic_performance', label: 'Athletic Performance' },
            ])
          )}

          {step === 3 && card('What\'s your experience level?', undefined,
            optionGrid('experienceLevel', [
              { value: 'beginner',     label: 'Beginner',     sub: 'Less than 6 months' },
              { value: 'intermediate', label: 'Intermediate', sub: '6 months to 2 years' },
              { value: 'advanced',     label: 'Advanced',     sub: '2+ years' },
            ], 1)
          )}

          {step === 4 && card('Tell us about yourself', undefined,
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Gender</Label>
                <RadioGroup value={data.gender} onValueChange={v => setData({...data, gender: v})}>
                  <div className="flex gap-4">
                    {[{value:'male',label:'Male'},{value:'female',label:'Female'},{value:'other',label:'Other'}].map(o => (
                      <div key={o.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={o.value} id={o.value} />
                        <Label htmlFor={o.value}>{o.label}</Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <Input id="age" type="number" inputMode="numeric" min={13} max={100}
                    value={data.age} onChange={e => setData({...data, age: e.target.value})} placeholder="25" />
                  <p className="text-xs text-muted-foreground">13–100</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input id="height" type="number" inputMode="decimal" min={100} max={250}
                    value={data.height} onChange={e => setData({...data, height: e.target.value})} placeholder="175" />
                  <p className="text-xs text-muted-foreground">100–250 cm</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input id="weight" type="number" inputMode="decimal" min={30} max={300}
                    value={data.weight} onChange={e => setData({...data, weight: e.target.value})} placeholder="70" />
                  <p className="text-xs text-muted-foreground">30–300 kg</p>
                </div>
              </div>
            </div>
          )}

          {step === 5 && card('What equipment do you have?', undefined,
            optionGrid('equipment', [
              { value: 'full_gym',    label: 'Full Gym',              sub: 'Barbells, cables, machines, dumbbells' },
              { value: 'limited',     label: 'Home / Limited',        sub: 'Dumbbells, pull-up bar, bands' },
              { value: 'bodyweight',  label: 'Bodyweight Only',       sub: 'No equipment needed' },
            ], 1)
          )}

          {step === 6 && (
            <div className="space-y-6">
              <CardTitle>Training Availability</CardTitle>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Training days per week: {data.trainingDays}</Label>
                  <Slider value={[data.trainingDays]} onValueChange={([v]) => setData({...data, trainingDays: v})} min={1} max={7} step={1} />
                  <div className="flex justify-between text-xs text-muted-foreground"><span>1 day</span><span>7 days</span></div>
                  {data.trainingDays === 1 && (
                    <p className="text-xs text-amber-600">One session per week is a great start — full-body training works best at this frequency.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Session length (minutes): {data.sessionLength}</Label>
                  <Slider value={[data.sessionLength]} onValueChange={([v]) => setData({...data, sessionLength: v})} min={15} max={120} step={15} />
                  <div className="flex justify-between text-xs text-muted-foreground"><span>15 min</span><span>120 min</span></div>
                </div>
              </div>
            </div>
          )}

          {step === 7 && card('Preferred Workout Style', undefined,
            <div className="space-y-3">
              {optionGrid('workoutStyle', [
                { value: 'full_body',   label: 'Full Body',          sub: '3×/week — all muscles every session' },
                { value: 'upper_lower', label: 'Upper / Lower',      sub: '4×/week — alternates upper and lower' },
                { value: 'ppl',         label: 'Push / Pull / Legs', sub: '6×/week — dedicated push, pull, leg days' },
                { value: 'bro_split',   label: 'Bro Split',          sub: '5–6×/week — one muscle group per day' },
              ])}
              {data.trainingDays <= 2 && data.workoutStyle !== '' && data.workoutStyle !== 'full_body' && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                  Full body training is usually most effective with {data.trainingDays} day{data.trainingDays>1?'s':''}/week.
                </p>
              )}
            </div>
          )}

          {step === 8 && card('Ab Training Preference', undefined,
            <RadioGroup value={data.absPreference} onValueChange={v => setData({...data, absPreference: v})}>
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
          )}

          {step === 9 && (
            <div className="space-y-6">
              <CardTitle>Recovery & Lifestyle</CardTitle>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Average sleep (hours): {data.avgSleep}</Label>
                  <Slider value={[data.avgSleep]} onValueChange={([v]) => setData({...data, avgSleep: v})} min={4} max={10} step={0.5} />
                  <div className="flex justify-between text-xs text-muted-foreground"><span>4h</span><span>10h</span></div>
                </div>
                <div className="space-y-2">
                  <Label>Activity outside the gym</Label>
                  <RadioGroup value={data.activityLevel} onValueChange={v => setData({...data, activityLevel: v})}>
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
                  <Slider value={[data.stressLevel]} onValueChange={([v]) => setData({...data, stressLevel: v})} min={1} max={10} step={1} />
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Low</span><span>High</span></div>
                </div>
                <div className="space-y-2">
                  <Label>Job activity</Label>
                  <RadioGroup value={data.jobActivity} onValueChange={v => setData({...data, jobActivity: v})}>
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
                  <Slider value={[data.cardioSessions]} onValueChange={([v]) => setData({...data, cardioSessions: v})} min={0} max={7} step={1} />
                  <div className="flex justify-between text-xs text-muted-foreground"><span>0</span><span>7</span></div>
                </div>
              </div>
            </div>
          )}

          {step === 10 && card('Movement & History', 'Any injuries or limitations we should know about?',
            <div className="space-y-2">
              <Label htmlFor="injuries">Injuries or limitations (optional)</Label>
              <Textarea id="injuries" value={data.injuries}
                onChange={e => setData({...data, injuries: e.target.value})}
                placeholder="e.g., lower back pain, shoulder impingement, knee issues..." rows={4} />
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={handleBack} disabled={step === 1} className="rounded-xl">
              <ChevronLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            {step < totalSteps ? (
              <Button onClick={handleNext} disabled={!canProceed()}
                className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700">
                Next <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading}
                className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700">
                {loading ? 'Saving...' : 'Complete Setup'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
