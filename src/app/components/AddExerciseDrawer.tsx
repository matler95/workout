/**
 * AddExerciseDrawer — Phase 3.2/3.3
 *
 * A bottom-sheet drawer that lets the user search for an exercise and add it
 * to the active workout mid-session. Opens from the MoreVertical menu in
 * ActiveWorkout. On selection it fires onAdd(exercise, equipmentType) so the
 * parent can create an ExercisePlan and push the exercise into exerciseQueue.
 *
 * Equipment picker is built-in: movements with multiple equipment options
 * show a second step before confirming.
 */

import React, { useState, useEffect, useRef } from 'react';
import { exerciseDatabase, type Exercise } from '../../data/exercises';
import {
  getMovementId,
} from '../../data/exercises';
import {
  getMovementDisplayName,
  getEquipmentOptionsForMovement,
  getVariantsForMovement,
  movementHasMultipleEquipmentOptions,
  groupExercisesByMovement,
  getDefaultVariant,
} from '../../utils/exerciseGrouping';
import { formatEquipmentLabel } from '../../utils/exerciseWeightMode';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, X, Dumbbell, ChevronLeft } from 'lucide-react';

export interface AddExerciseResult {
  exercise: Exercise;
  equipmentType: string;
}

interface AddExerciseDrawerProps {
  open: boolean;
  onClose: () => void;
  onAdd: (result: AddExerciseResult) => void;
  /** IDs already in the queue — used to mark them as added */
  existingExerciseIds: Set<string>;
  /** Optional: bodyweight-only mode (respects user profile) */
  bodweightOnly?: boolean;
}

export function AddExerciseDrawer({
  open,
  onClose,
  onAdd,
  existingExerciseIds,
  bodweightOnly = false,
}: AddExerciseDrawerProps) {
  const [query, setQuery]                       = useState('');
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const inputRef                                = useRef<HTMLInputElement>(null);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedMovement(null);
      // Small delay so the sheet animation completes before auto-focusing
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  // Build deduplicated movement list
  const allExercises = exerciseDatabase.filter(ex => {
    if (bodweightOnly && ex.equipment !== 'bodyweight') return false;
    return true;
  });

  const grouped = groupExercisesByMovement(allExercises);

  const filtered = (() => {
    const q = query.toLowerCase().trim();
    const results: Array<{ movementId: string; representative: Exercise }> = [];

    for (const [mid, variants] of grouped.entries()) {
      const rep = getDefaultVariant(mid) ?? variants[0];
      const displayName = getMovementDisplayName(mid);
      if (
        !q ||
        displayName.toLowerCase().includes(q) ||
        rep.primaryMuscles.some(m => m.toLowerCase().includes(q)) ||
        variants.some(v => v.name.toLowerCase().includes(q))
      ) {
        results.push({ movementId: mid, representative: rep });
      }
    }

    // Sort: already-added movements last, then alphabetically
    return results.sort((a, b) => {
      const aAdded = existingExerciseIds.has(a.representative.id);
      const bAdded = existingExerciseIds.has(b.representative.id);
      if (aAdded && !bAdded) return 1;
      if (!aAdded && bAdded) return -1;
      return getMovementDisplayName(a.movementId).localeCompare(
        getMovementDisplayName(b.movementId),
      );
    });
  })();

  const handleMovementTap = (movementId: string, representative: Exercise) => {
    if (movementHasMultipleEquipmentOptions(movementId)) {
      setSelectedMovement(movementId);
    } else {
      // Single variant — select immediately
      onAdd({ exercise: representative, equipmentType: representative.equipmentType });
      onClose();
    }
  };

  const handleEquipmentSelect = (movementId: string, equipmentType: string) => {
    const variants = getVariantsForMovement(movementId);
    const variant  = variants.find(v => v.equipmentType === equipmentType) ?? variants[0];
    onAdd({ exercise: variant, equipmentType });
    onClose();
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-2xl shadow-2xl max-h-[88dvh] flex flex-col">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
          {selectedMovement ? (
            <button
              onClick={() => setSelectedMovement(null)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <h2 className="text-base font-semibold">Add Exercise</h2>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content — either search list or equipment picker */}
        {selectedMovement ? (
          <EquipmentStep
            movementId={selectedMovement}
            onSelect={equipmentType => handleEquipmentSelect(selectedMovement, equipmentType)}
          />
        ) : (
          <SearchStep
            inputRef={inputRef}
            query={query}
            onQueryChange={setQuery}
            results={filtered}
            existingExerciseIds={existingExerciseIds}
            onSelect={handleMovementTap}
          />
        )}
      </div>
    </>
  );
}

// ─── Search step ──────────────────────────────────────────────────────────────

function SearchStep({
  inputRef,
  query,
  onQueryChange,
  results,
  existingExerciseIds,
  onSelect,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  onQueryChange: (q: string) => void;
  results: Array<{ movementId: string; representative: Exercise }>;
  existingExerciseIds: Set<string>;
  onSelect: (movementId: string, representative: Exercise) => void;
}) {
  return (
    <>
      {/* Search box */}
      <div className="px-4 pb-3 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search exercises or muscles..."
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            className="pl-10 h-10 rounded-xl text-sm"
          />
        </div>
      </div>

      {/* Exercise list */}
      <div className="overflow-y-auto flex-1 px-0 pb-safe">
        {results.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No exercises found
          </div>
        ) : (
          results.map(({ movementId, representative }) => {
            const displayName     = getMovementDisplayName(movementId);
            const hasMultiEquip   = movementHasMultipleEquipmentOptions(movementId);
            const alreadyAdded    = existingExerciseIds.has(representative.id);
            const equipmentCount  = getEquipmentOptionsForMovement(movementId).length;

            return (
              <button
                key={movementId}
                onClick={() => !alreadyAdded && onSelect(movementId, representative)}
                disabled={alreadyAdded}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 text-left transition-colors ${
                  alreadyAdded
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-muted/60 active:bg-muted'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                  <Dumbbell className="w-4 h-4 text-muted-foreground" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {representative.primaryMuscles.map(m => m.replace(/_/g, ' ')).join(', ')}
                    {hasMultiEquip && (
                      <span className="ml-1.5 text-primary/70">· {equipmentCount} options</span>
                    )}
                  </p>
                </div>

                {alreadyAdded && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">Added</span>
                )}
                {!alreadyAdded && hasMultiEquip && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">›</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

// ─── Equipment step ───────────────────────────────────────────────────────────

function EquipmentStep({
  movementId,
  onSelect,
}: {
  movementId: string;
  onSelect: (equipmentType: string) => void;
}) {
  const displayName = getMovementDisplayName(movementId);
  const options     = getEquipmentOptionsForMovement(movementId);
  const variants    = getVariantsForMovement(movementId);

  return (
    <div className="overflow-y-auto flex-1 px-4 pb-safe">
      <p className="text-sm text-muted-foreground mb-4">
        Choose equipment for <span className="font-medium text-foreground">{displayName}</span>
      </p>
      <div className="flex flex-col gap-2">
        {options.map(equip => {
          const variant = variants.find(v => v.equipmentType === equip);
          if (!variant) return null;
          return (
            <button
              key={equip}
              onClick={() => onSelect(equip)}
              className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                <Dumbbell className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{formatEquipmentLabel(equip)}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{variant.name}</p>
              </div>
              <span className="text-muted-foreground text-sm flex-shrink-0">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
