import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { apiCall } from '../../utils/supabase-client';
import { toast } from 'sonner';
import { User, Settings, Globe, Moon, Bell, Trash2, LogOut } from 'lucide-react';

export function Profile() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [units, setUnits] = useState('metric');
  const [theme, setTheme] = useState('light');
  const [language, setLanguage] = useState('english');
  const [notifications, setNotifications] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { profile } = await apiCall('/profile');
      setProfile(profile);
    } catch (error: any) {
      console.error('Failed to load profile:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
      navigate('/login');
    } catch (error: any) {
      toast.error('Failed to sign out');
    }
  };

  const handleDataReset = () => {
    if (confirm('Are you sure you want to reset all your data? This cannot be undone.')) {
      toast.success('Data reset (not implemented in prototype)');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Profile & Settings</h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              User Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-sm text-gray-600">Name</div>
              <div className="font-medium">{profile?.name || 'Loading...'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Email</div>
              <div className="font-medium">{user?.email}</div>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-2">
              <div>
                <div className="text-sm text-gray-600">Age</div>
                <div className="font-medium">{profile?.age}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Height</div>
                <div className="font-medium">{profile?.height} cm</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Weight</div>
                <div className="font-medium">{profile?.weight} kg</div>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/onboarding')} className="w-full mt-4">
              Update Profile Goals
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Units</Label>
              <RadioGroup value={units} onValueChange={setUnits}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="metric" id="metric" />
                  <Label htmlFor="metric">Metric (kg, cm)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="imperial" id="imperial" />
                  <Label htmlFor="imperial">Imperial (lbs, ft)</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Theme</Label>
              <RadioGroup value={theme} onValueChange={setTheme}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="light" id="light" />
                  <Label htmlFor="light">Light</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="dark" id="dark" />
                  <Label htmlFor="dark">Dark</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="auto" id="auto" />
                  <Label htmlFor="auto">Auto</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Language
              </Label>
              <RadioGroup value={language} onValueChange={setLanguage}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="english" id="english" />
                  <Label htmlFor="english">English</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="polish" id="polish" />
                  <Label htmlFor="polish">Polski</Label>
                </div>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Workout Reminders</div>
                <div className="text-sm text-gray-600">Get notified before scheduled workouts</div>
              </div>
              <Switch checked={notifications} onCheckedChange={setNotifications} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Progress Updates</div>
                <div className="text-sm text-gray-600">Weekly summary of your progress</div>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Danger Zone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="destructive" onClick={handleDataReset} className="w-full">
              Reset All Data
            </Button>
            <Button variant="outline" onClick={handleSignOut} className="w-full">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
