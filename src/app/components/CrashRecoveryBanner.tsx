/**
 * CrashRecoveryBanner
 *
 * Shown on the Dashboard when the app detects a workout session that was
 * completed but never synced (e.g. network was offline, app was killed mid-save).
 * Offers a single "Sync now" action that flushes the offline queue.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { WifiOff, RefreshCw, CheckCircle } from 'lucide-react';
import { getPendingWorkouts, flushPendingWorkouts } from '../../utils/offlineQueue';

interface CrashRecoveryBannerProps {
  onSynced?: () => void;
}

export function CrashRecoveryBanner({ onSynced }: CrashRecoveryBannerProps) {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]           = useState(false);
  const [synced, setSynced]             = useState(false);

  useEffect(() => {
    setPendingCount(getPendingWorkouts().length);
  }, []);

  if (pendingCount === 0 || synced) return null;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const count = await flushPendingWorkouts();
      if (count > 0) {
        setSynced(true);
        setPendingCount(0);
        onSynced?.();
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="border-0 shadow-md bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30">
      <CardContent className="pt-4 pb-4">
        <div className="flex gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <WifiOff className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm mb-1">
              {pendingCount === 1
                ? '1 workout not yet saved'
                : `${pendingCount} workouts not yet saved`}
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              {pendingCount === 1
                ? 'A workout was completed while offline. Sync it now.'
                : `${pendingCount} workouts were completed while offline. Sync them now.`}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8 rounded-lg"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Synced confirmation — briefly shown after a successful flush
 */
export function SyncedConfirmation() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg animate-in fade-in slide-in-from-bottom-2">
      <CheckCircle className="w-4 h-4" />
      Workout synced successfully
    </div>
  );
}
