import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { Toaster } from './components/ui/sonner';

import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Onboarding } from './pages/Onboarding';
import { WorkoutBuilder } from './pages/WorkoutBuilder';
import { Dashboard } from './pages/Dashboard';
import { Plan } from './pages/Plan';
import { Progress } from './pages/Progress';
import { Library } from './pages/Library';
import { Profile } from './pages/Profile';
import { ActiveWorkout } from './pages/ActiveWorkout';
import { WorkoutEdit } from './components/WorkoutEdit';
import { BottomNav } from './components/BottomNav';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-muted border-t-primary mx-auto" />
          <p className="mt-4 text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const NO_NAV_PATHS = new Set([
  '/login',
  '/signup',
  '/onboarding',
  '/workout-builder',
  '/active-workout',
  '/workout-edit',
]);

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-muted border-t-primary mx-auto" />
          <p className="mt-4 text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Hide bottom nav for full-screen flows and any /workout-edit/:id path
  const showBottomNav =
    user &&
    !NO_NAV_PATHS.has(location.pathname) &&
    !location.pathname.startsWith('/workout-edit');

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-muted border-t-primary mx-auto" />
          <p className="mt-4 text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />

        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
        <Route path="/workout-builder" element={<ProtectedRoute><WorkoutBuilder /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/plan" element={<ProtectedRoute><Plan /></ProtectedRoute>} />
        <Route path="/progress" element={<ProtectedRoute><Progress /></ProtectedRoute>} />
        <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/active-workout" element={<ProtectedRoute><ActiveWorkout /></ProtectedRoute>} />
        <Route path="/workout-edit/:sessionId" element={<ProtectedRoute><WorkoutEdit /></ProtectedRoute>} />

        <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
      </Routes>

      {showBottomNav && <BottomNav />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
