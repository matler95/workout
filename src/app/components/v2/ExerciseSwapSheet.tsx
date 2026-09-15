import React, { useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '../ui/sheet';
import { Badge } from '../ui/badge';
import { Repeat, Lock } from 'lucide-react';
import type { Exercise, EquipmentItem } from '../../../data/v2/types';
import { getSubstitutes } from '../../../data/v2/substitutes';

export type SwapScope = 'session' | 'plan';

interface ExerciseSwapSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: Exercise;
  /** Equipment the user currently has access to — pass the full onboarding
   *  equipment set by default; when the user taps "equipment's taken" this
   *  should shrink to exclude whatever they've flagged as unavailable right
   *  now (that toggle lives in the parent — this component just renders
   *  whatever list it's given). */
  availableEquipment: EquipmentItem[];
  db: Exercise[];
  /** Called once the user picks both an alternative AND a scope. The
   *  caller decides what "session" vs "plan" persistence actually means
   *  (in-memory active-workout state vs writing into workout_plans). */
  onConfirm: (newExercise: Exercise, scope: SwapScope) => void;
}

export function ExerciseSwapSheet({
  open,
  onOpenChange,
  exercise,
  availableEquipment,
  db,
  onConfirm,
}: ExerciseSwapSheetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const options = useMemo(
    () => getSubstitutes(exercise, availableEquipment, db),
    [exercise, availableEquipment, db]
  );

  const selected = options.find((o) => o.exercise.id === selectedId) ?? null;

  function handleConfirm(scope: SwapScope) {
    if (!selected) return;
    onConfirm(selected.exercise, scope);
    setSelectedId(null);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Repeat className="w-4 h-4" />
            Swap {exercise.name}
          </SheetTitle>
          <SheetDescription>
            Same primary muscles, so your session stays on target either way.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 py-3">
          {options.length === 0 && (
            <p className="text-sm text-muted-foreground px-1">
              No alternatives in the library for this exercise yet.
            </p>
          )}

          {options.map(({ exercise: alt, equipmentAvailable }) => {
            const isSelected = alt.id === selectedId;
            return (
              <button
                key={alt.id}
                type="button"
                disabled={!equipmentAvailable}
                onClick={() => setSelectedId(alt.id)}
                className={[
                  'w-full text-left rounded-lg p-3 border transition-colors',
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50',
                  !equipmentAvailable && 'opacity-50 cursor-not-allowed',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{alt.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {alt.muscles
                        .filter((m) => m.role === 'primary')
                        .map((m) => (
                          <Badge key={m.muscle} variant="secondary" className="text-xs">
                            {m.muscle.replace('-', ' ')}
                          </Badge>
                        ))}
                    </div>
                  </div>
                  {!equipmentAvailable && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      <Lock className="w-3 h-3" />
                      No equipment
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-col">
          <button
            type="button"
            disabled={!selected}
            onClick={() => handleConfirm('session')}
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            Just this session
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => handleConfirm('plan')}
            className="w-full py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
          >
            Update my workout plan
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
