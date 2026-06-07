import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { OptionGroup } from '../components/ui/OptionButton';
import { profileApi } from '../../utils/api';
import { toast } from 'sonner';
import { User, Settings, Globe, Moon, Bell, Trash2, LogOut, ChevronRight } from 'lucide-react';

type Theme    = 'light' | 'dark' | 'auto';
type Language = 'english' | 'polish';

export function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { theme: activeTheme, setTheme: applyTheme } = useTheme();
  const [theme, setTheme]       = useState<Theme>('light');
  const [language, setLanguage] = useState<Language>('english');
  const [notifWorkout, setNotifWorkout]   = useState(true);
  const [notifProgress, setNotifProgress] = useState(false);
  const [savingPrefs, setSavingPrefs]     = useState(false);
  const [deletingData, setDeletingData]   = useState(false);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const p = await profileApi.get();
      setProfile(p);
      if (p) {
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

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    try {
      await profileApi.updatePreferences({ units: 'metric', theme, language });
      toast.success('Preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleSignOut = async () => {
    try { await signOut(); navigate('/login'); }
    catch { toast.error('Failed to sign out'); }
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

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-muted border-t-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading profile...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold tracking-tight pt-2">Profile & Settings</h1>

        {/* Account */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="w-4 h-4" /> Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center shadow-soft">
                <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-emerald-600 font-bold text-xl">
                  {(profile?.name || 'U').split(' ')[0][0] || 'U'}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">{profile?.name ? 'Welcome back,' : 'Hello'}</div>
                <div className="text-lg font-semibold">{profile?.name || 'User'}</div>
                <div className="text-xs text-muted-foreground mt-1 capitalize">
                  {profile?.primaryGoal?.replace(/_/g, ' ') || 'Set your goal'}
                </div>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium text-sm truncate max-w-[140px]">{user?.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Days / Week', value: profile?.trainingDays || '—' },
                { label: 'Session (min)', value: profile?.sessionLength || '—' },
                { label: 'Experience', value: profile?.experienceLevel || '—' },
              ].map(({ label, value }) => (
                <div key={label} className="p-3 bg-card rounded-2xl text-center shadow-subtle">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-lg font-semibold capitalize">{value}</div>
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" className="w-full" onClick={() => navigate('/onboarding')}>
              Update profile & goals <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="w-4 h-4" /> Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Theme */}
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Moon className="w-3.5 h-3.5" /> Theme
              </p>
              <OptionGroup
                value={theme}
                onChange={(v) => { setTheme(v); applyTheme(v); }}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark',  label: 'Dark' },
                  { value: 'auto',  label: 'Auto' },
                ]}
                cols={2}
              />
            </div>

            {/* Language */}
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Globe className="w-3.5 h-3.5" /> Language
              </p>
              <OptionGroup
                value={language}
                onChange={setLanguage}
                options={[
                  { value: 'english', label: 'English' },
                  { value: 'polish',  label: 'Polski' },
                ]}
                cols={2}
              />
            </div>

            <Button onClick={handleSavePreferences} disabled={savingPrefs} size="sm" className="w-full">
              {savingPrefs ? 'Saving…' : 'Save preferences'}
            </Button>
          </CardContent>
        </Card>

        {/* Notifications */}
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
                <p className="text-xs text-muted-foreground">Before scheduled workouts</p>
              </div>
              <Switch checked={notifWorkout} onCheckedChange={setNotifWorkout} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Weekly progress summary</p>
                <p className="text-xs text-muted-foreground">Every Monday morning</p>
              </div>
              <Switch checked={notifProgress} onCheckedChange={setNotifProgress} />
            </div>
            <p className="text-xs text-muted-foreground">
              Notifications require the app to be installed as a PWA.
            </p>
          </CardContent>
        </Card>

        {/* Danger zone */}
        <Card className="border-0 shadow-md border-l-4 border-l-rose-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-rose-600">
              <Trash2 className="w-4 h-4" /> Danger zone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-rose-50 dark:bg-rose-950/30 rounded-xl p-3 text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
              <strong>Reset workout data</strong> deletes all workout logs, bodyweight entries,
              your workout plan, and progress history. Your account and profile stay active.
              This cannot be undone.
            </div>
            <Button variant="destructive" className="w-full" onClick={handleDeleteData} disabled={deletingData}>
              {deletingData ? 'Deleting…' : 'Delete all workout data'}
            </Button>
            <Button variant="outline" className="w-full" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" /> Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
