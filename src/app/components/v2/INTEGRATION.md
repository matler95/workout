# Wiring `ExerciseSwapSheet` into `ActiveWorkout.tsx`

Didn't wire this into `ActiveWorkout.tsx` directly yet — flagging why rather
than forcing it in.

`ActiveWorkout.tsx` currently runs entirely on the **v1** exercise shape
(`exerciseQueue: any[]`, sourced from the old `src/data/exercises.ts`), not
the new v2 `Exercise` type this sheet is built against. The two schemas
aren't interchangeable (different muscle representation, no
`substitutionGroupId`, etc.), so plugging `ExerciseSwapSheet` in today would
mean either a shim/adapter layer between the schemas, or hacking the sheet
to accept the v1 shape and losing the precomputed-substitution-group
benefit that's the whole point of §4 in the build plan. Neither is worth
doing before the app's active-workout data actually comes from the v2 DB
(Phase 6 of the roadmap).

## Where it hooks in, once `ActiveWorkout` is on v2 data

The file already has the right shape of state for this — same pattern as
`handleDoLater` / `handleSkipEntirely`:

```tsx
const currentExercise = exerciseQueue[0]; // becomes a v2 Exercise once migrated
const [showSwapSheet, setShowSwapSheet] = useState(false);

// Add a "Swap" affordance next to the existing Do Later / Skip controls
<button onClick={() => setShowSwapSheet(true)}>Swap</button>

<ExerciseSwapSheet
  open={showSwapSheet}
  onOpenChange={setShowSwapSheet}
  exercise={currentExercise}
  availableEquipment={currentlyAvailableEquipment} // see below
  db={exerciseDatabaseV2}
  onConfirm={(newExercise, scope) => {
    if (scope === 'session') {
      // in-memory only — replace head of exerciseQueue, same pattern as
      // handleDoLater's setExerciseQueue call, plan definition untouched
      setExerciseQueue(([_, ...rest]) => [newExercise, ...rest]);
    } else {
      // 'plan' — persist into workout_plans.exercises for this day going
      // forward, in addition to the in-session swap above
      updateWorkoutPlanExercise(planId, dayId, currentExercise.id, newExercise.id);
    }
  }}
/>
```

**`currentlyAvailableEquipment`** — don't reuse the full onboarding
equipment set here. The point of this feature is "what's free *right now*",
so this needs its own lightweight state: a quick multi-select the user
taps when they open the sheet ("which of your usual equipment is
occupied?"), defaulting to their full onboarding set minus nothing. Keep
this ephemeral (component state, not persisted) — it resets every time the
sheet opens.

**`updateWorkoutPlanExercise`** doesn't exist yet — it's a small Supabase
write against `workout_plans.exercises` (JSONB), swapping one exercise id
for another within the matching day. Straightforward once the v2 schema is
in Supabase (Phase 6).
