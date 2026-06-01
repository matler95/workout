import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Label } from '../components/ui/label';
import { profileApi } from '../../utils/api';
import { toast } from 'sonner';
import { User, Settings, Globe, Moon, Bell, Trash2, LogOut, ChevronRight } from 'lucide-react';

type Units    = 'metric' | 'imperial';
type Theme    = 'light' | 'dark' | 'auto';
type Language = 'english' | 'polish';

export function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Preferences — initialised from profile once loaded
  const [units, setUnits]         = useState<Units>('metric');
  const { theme: activeTheme, setTheme: applyTheme } = useTheme();
  const [theme, setTheme]         = useState<Theme>('light');
  const [language, setLanguage]   = useState<Language>('english');
  const [notifWorkout, setNotifWorkout] = useState(true);
  const [notifProgress, setNotifProgress] = useState(false);

  // Saving states
  const [savingPrefs, setSavingPrefs]   = useState(false);
  const [deletingData, setDeletingData] = useState(false);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const p = await profileApi.get();
      setProfile(p);
      if (p) {
        setUnits(p.units || 'metric');
        const savedTheme = p.theme || 'light';
        setTheme(savedTheme);
        applyTheme(savedTheme);
        setLanguage(p.language || 'english');
      }
    } catch {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  // Save preferences whenever any of them change (debounce via button)
  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    try {
      await profileApi.updatePreferences({ units, theme, language });
      toast.success('Preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  const handleDeleteData = async () => {
    if (!window.confirm(
      'This will permanently delete all your workout logs, progress data, and workout plan. Your account stays active. This cannot be undone.'
    )) return;

    setDeletingData(true);
    try {
      await profileApi.deleteAllData();
      toast.success('All workout data deleted');
      navigate('/workout-builder');
    } catch {
      toast.error('Failed to delete data');
    } finally {
      setDeletingData(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold tracking-tight pt-2">Profile & Settings</h1>

        {/* ── User info ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="w-4 h-4" /> Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500">Name</p>
                <p className="font-medium">{profile?.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="font-medium text-sm truncate">{user?.email}</p>
              </div>
            </div>

            {profile && (
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div>
                  <p className="text-xs text-gray-500">Age</p>
                  <p className="font-medium">{profile.age ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Height</p>
                  <p className="font-medium">{profile.height ? `${profile.height} cm` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Weight</p>
                  <p className="font-medium">{profile.weight ? `${profile.weight} kg` : '—'}</p>
                </div>
              </div>
            )}

            {profile && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <p className="text-xs text-gray-500">Goal</p>
                  <p className="font-medium capitalize">{profile.primaryGoal?.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Experience</p>
                  <p className="font-medium capitalize">{profile.experienceLevel}</p>
                </div>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => navigate('/onboarding')}
            >
              Update profile & goals <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* ── Preferences ───────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="w-4 h-4" /> Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Units */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Units</p>
              <RadioGroup
                value={units}
                onValueChange={v => setUnits(v as Units)}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="metric" id="metric" />
                  <Label htmlFor="metric">Metric (kg, cm)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="imperial" id="imperial" />
                  <Label htmlFor="imperial">Imperial (lbs, ft)</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Theme */}
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Moon className="w-3.5 h-3.5" /> Theme
              </p>
              <RadioGroup
                value={theme}
                onValueChange={v => {
                  setTheme(v as Theme);
                  applyTheme(v as Theme);
                }}
                className="flex gap-4"
              >
                {(['light', 'dark', 'auto'] as Theme[]).map(t => (
                  <div key={t} className="flex items-center gap-2">
                    <RadioGroupItem value={t} id={`theme-${t}`} />
                    <Label htmlFor={`theme-${t}`} className="capitalize">{t}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Globe className="w-3.5 h-3.5" /> Language
              </p>
              <RadioGroup
                value={language}
                onValueChange={v => setLanguage(v as Language)}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="english" id="lang-en" />
                  <Label htmlFor="lang-en">English</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="polish" id="lang-pl" />
                  <Label htmlFor="lang-pl">Polski</Label>
                </div>
              </RadioGroup>
            </div>

            <Button
              onClick={handleSavePreferences}
              disabled={savingPrefs}
              size="sm"
              className="w-full"
            >
              {savingPrefs ? 'Saving…' : 'Save preferences'}
            </Button>
          </CardContent>
        </Card>

        {/* ── Notifications ─────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="w-4 h-4" /> Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Workout reminders</p>
                <p className="text-xs text-gray-500">Before scheduled workouts</p>
              </div>
              <Switch checked={notifWorkout} onCheckedChange={setNotifWorkout} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Weekly progress summary</p>
                <p className="text-xs text-gray-500">Every Monday morning</p>
              </div>
              <Switch checked={notifProgress} onCheckedChange={setNotifProgress} />
            </div>
            <p className="text-xs text-gray-400">
              Notification delivery requires the app to be installed as a PWA.
            </p>
          </CardContent>
        </Card>

        {/* ── Danger zone ───────────────────────────────────────────── */}
        <Card className="border-0 shadow-md border-l-4 border-l-rose-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-rose-600">
              <Trash2 className="w-4 h-4" /> Danger zone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-rose-50 rounded-xl p-3 text-xs text-rose-700 leading-relaxed">
              <strong>Reset workout data</strong> deletes all workout logs, bodyweight entries,
              your workout plan, and progress history. Your account and profile stay active.
              This cannot be undone.
            </div>
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleDeleteData}
              disabled={deletingData}
            >
              {deletingData ? 'Deleting…' : 'Delete all workout data'}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleSignOut}
            >
              <LogOut className="w-4 h-4 mr-2" /> Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
