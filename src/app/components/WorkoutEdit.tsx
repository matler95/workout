import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { workoutApi } from '../../utils/api';
import { toast } from 'sonner';
import { ChevronLeft, Save, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../../utils/supabase-client';

interface EditableSet {
  id: string;
  exerciseName: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  dirty: boolean;
}

export function WorkoutEdit() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate      = useNavigate();

  const [session, setSession]   = useState<any>(null);
  const [sets, setSets]         = useState<EditableSet[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  // FIX #2: Track the original set IDs on load so we can diff and delete
  // removed entries. Previously originalSetIds was never populated, meaning
  // the delete branch was dead code and removed sets persisted in the DB.
  const originalSetIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (sessionId) loadSession(sessionId);
  }, [sessionId]);

  const loadSession = async (id: string) => {
    try {
      const { data: sessionData, error: sessErr } = await supabase
        .from('workout_sessions')
        .select('id, day_name, completed_at, perceived_effort, feedback')
        .eq('id', id)
        .single();
      if (sessErr) throw sessErr;

      const { data: setsData, error: setsErr } = await supabase
        .from('workout_sets')
        .select('id, exercise_name, set_number, weight_kg, reps')
        .eq('session_id', id)
        .order('exercise_name')
        .order('set_number');
      if (setsErr) throw setsErr;

      setSession(sessionData);

      const loadedSets: EditableSet[] = (setsData || []).map(s => ({
        id:           s.id,
        exerciseName: s.exercise_name,
        setNumber:    s.set_number,
        weightKg:     parseFloat(s.weight_kg),
        reps:         s.reps,
        dirty:        false,
      }));

      setSets(loadedSets);

      // Capture all original IDs so handleSave can compute what was deleted
      originalSetIds.current = new Set(loadedSets.map(s => s.id));
    } catch (e) {
      toast.error('Failed to load session');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  };

  const updateSet = (id: string, field: 'weightKg' | 'reps', value: string) => {
    setSets(prev => prev.map(s =>
      s.id === id
        ? { ...s, [field]: field === 'weightKg' ? parseFloat(value) || 0 : parseInt(value) || 0, dirty: true }
        : s
    ));
  };

  const deleteSet = (id: string) => {
    setSets(prev => prev.filter(s => s.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Update changed sets
      const dirtyIds = sets.filter(s => s.dirty);
      await Promise.all(
        dirtyIds.map(s =>
          supabase
            .from('workout_sets')
            .update({ weight_kg: s.weightKg, reps: s.reps })
            .eq('id', s.id)
        )
      );

      // 2. FIX #2: Delete sets that were removed from the UI.
      // Diff the original IDs against the current IDs to find what was deleted.
      const currentIds = new Set(sets.map(s => s.id));
      const deletedIds = [...originalSetIds.current].filter(id => !currentIds.has(id));

      if (deletedIds.length > 0) {
        const { error: delErr } = await supabase
          .from('workout_sets')
          .delete()
          .in('id', deletedIds);
        if (delErr) throw delErr;
      }

      toast.success('Workout updated');
      navigate(-1);
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-muted border-t-primary" />
    </div>
  );

  // Group sets by exercise
  const byExercise = sets.reduce<Record<string, EditableSet[]>>((acc, s) => {
    if (!acc[s.exerciseName]) acc[s.exerciseName] = [];
    acc[s.exerciseName].push(s);
    return acc;
  }, {});

  const hasDirty    = sets.some(s => s.dirty);
  const hasDeleted  = sets.length < originalSetIds.current.size;
  const hasChanges  = hasDirty || hasDeleted;

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 pt-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight">{session?.day_name}</h1>
            {session?.completed_at && (
              <p className="text-xs text-muted-foreground">
                {format(parseISO(session.completed_at), 'EEEE, MMM d · HH:mm')}
              </p>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving || !hasChanges} size="sm" className="rounded-xl">
            <Save className="w-4 h-4 mr-1.5" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>

        {!hasChanges && (
          <p className="text-xs text-muted-foreground px-1">
            Edit any weight or rep count below, or tap the trash icon to remove a set — changes are saved when you tap Save.
          </p>
        )}

        {hasDeleted && !saving && (
          <p className="text-xs text-amber-600 dark:text-amber-400 px-1">
            {originalSetIds.current.size - sets.length} set{originalSetIds.current.size - sets.length !== 1 ? 's' : ''} will be deleted on save.
          </p>
        )}

        {/* Sets grouped by exercise */}
        {Object.entries(byExercise).map(([exerciseName, exSets]) => (
          <Card key={exerciseName}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{exerciseName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {exSets.map(s => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-10 flex-shrink-0">
                    Set {s.setNumber}
                  </span>
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={s.weightKg === 0 ? '' : s.weightKg}
                      onChange={e => updateSet(s.id, 'weightKg', e.target.value)}
                      className="w-20 text-center h-8 text-sm"
                      placeholder="0"
                    />
                    <span className="text-xs text-muted-foreground flex-shrink-0">kg ×</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={s.reps}
                      onChange={e => updateSet(s.id, 'reps', e.target.value)}
                      className="w-16 text-center h-8 text-sm"
                    />
                    <span className="text-xs text-muted-foreground flex-shrink-0">reps</span>
                  </div>
                  {/* e1RM preview */}
                  {s.weightKg > 0 && s.reps > 0 && (
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      ~{Math.round(s.weightKg * (1 + s.reps / 30))} kg 1RM
                    </span>
                  )}
                  <button
                    onClick={() => deleteSet(s.id)}
                    className="text-muted-foreground/40 hover:text-red-500 transition-colors flex-shrink-0"
                    title="Remove set"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {sets.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No sets found for this session.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
