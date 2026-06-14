Atlas PWA — Comprehensive Analysis & Implementation Plan

Executive Summary
Priority Assessment
Items #4 and #5 are foundational architectural changes that must be implemented first. They change the identity key for exercise history — currently exerciseId alone, proposed: exerciseId + equipmentType. Every downstream feature (progression engine, strength charts, set logging, workout display) reads from this identity key. Building items #6, #7, #1, or the nice-to-haves on top of the wrong key creates migration debt that compounds with every feature added.
Item #2 (exercise reordering/skipping) is already partially implemented via the exerciseQueue / handleDoLater / handleSkipEntirely system in ActiveWorkout.tsx. The user feedback suggests the UX discoverability is poor — the controls exist but users don't find them. This is a medium-lift UX fix, not a rebuild.
Item #1 (machine weight tracking) is a special case of item #5. Once the equipment-aware identity key exists, the weight mode classification can correctly assign machine → total weight instead of per-side. Items #1 and #5 must be solved together.
Critical Dependency Chain
#4 (Exercise Grouping) ──► #5 (Equipment-Aware Tracking) ──► #1 (Machine Weight)
                                        │
                    ┌───────────────────┼────────────────────┐
                    ▼                   ▼                     ▼
              #7 (Add exercises    Charts/History         Progression
               post-workout)       (identity key fix)     Engine keying
Items #3, #6, #8 are independent and can be parallelized after Phase 1.
Recommended Roadmap
PhaseFocusItems1Foundation: Exercise data model + equipment grouping#4, #52Core workout accuracy: machine weight + history identity#1, #5 (backend)3Active workout workflow improvements#2, #74UX polish: how-to collapse, design consistency#3, #65Nice-to-haves#8

Architecture Analysis
Current Architecture (as observed)
Exercise identity in workout_sets table:
exercise_id TEXT  (e.g. "barbellbenchpress-mediumgrip")
exercise_name TEXT
Weight mode classification lives in exerciseWeightMode.ts:
getWeightMode(exerciseName, equipment, tier) → WeightMode
WeightMode is barbell | smith | dumbbell | bodyweight. There is no machine variant — machines are currently classified as dumbbell (per-side), which is wrong.
Exercise database structure (exercises.ts):

Each exercise is a flat record with a unique id, equipmentType field, and equipment (broad: full_gym | bodyweight).
Many conceptually identical exercises exist as separate records differentiated only by equipment: barbellbenchpress, dumbbellbenchpress, smithmachinebenchpress, machinebenchpress.

History keying in computeAllSuggestions (progressiveOverload.ts):
typescriptconst key = s.exerciseId || s.exerciseName
This means "Bench Press with barbell" and "Bench Press with dumbbell" currently share history, which is incorrect.
Current exercise reordering: Fully implemented (exerciseQueue, handleDoLater, handleSkipEntirely, dropdown menu). The issue is discoverability — the MoreVertical button is small and not labeled.
Proposed Architecture
Step 1: Composite identity key
historyKey = exerciseId + "::" + selectedEquipmentType
Examples:

benchpress::barbell
benchpress::dumbbell
benchpress::smith
benchpress::machine

Step 2: Exercise grouping concept
Introduce a movementId (or groupId) that groups variants. This lives only in the frontend data layer; the database stores the composite key.
Step 3: Expanded WeightMode
Add machine to WeightMode:
typescriptexport type WeightMode = 'barbell' | 'smith' | 'dumbbell' | 'bodyweight' | 'machine'
Machine mode: total weight, step 5kg or 10kg, no "per-side" labeling.
Step 4: Database schema changes
The workout_sets table already stores exercise_id and exercise_name. We need to add equipment_type:
sqlALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS equipment_type TEXT;
The compound index:
sqlCREATE INDEX IF NOT EXISTS idx_sets_user_exercise_equipment
  ON workout_sets(user_id, exercise_id, equipment_type, completed_at DESC);
Step 5: Plan storage changes
workout_plans.exercises is stored as JSONB. Each exercise object needs selectedEquipmentType:
json{
  "id": "benchpress",
  "name": "Bench Press",
  "selectedEquipmentType": "barbell",
  ...
}
This is backward-compatible — existing plans without selectedEquipmentType fall back to the current equipmentType field.
Migration Strategy
Zero-downtime migration — no data deletion, only additive changes:

Database: Add equipment_type column with NULL default. Existing rows remain valid.
History key: Old key exerciseId is a subset of new key exerciseId::equipmentType. During transition, if equipment_type is null, fall back to exerciseId only (preserves existing progression data).
Plan JSONB: selectedEquipmentType is optional in the plan payload. Existing plans work without it.
Progressive overload engine: Key lookup updated to check composite key first, fall back to legacy key. This prevents users from losing their progression history during the transition.


Detailed Analysis Per Feedback Item

Item #4: Exercise Grouping with Equipment Selection
User problem: The exercise library contains Barbell Bench Press, Dumbbell Bench Press, Smith Machine Bench Press, and Machine Chest Press as completely separate items. Users must know to search for the right variant. Users who switch between barbell and dumbbell bench press get separate (correctly separate) history entries, but the workflow for switching is confusing — they must remove one exercise and add another.
Root cause: The exercise database was modeled as an equipment-specific flat list rather than a movement-grouped list with equipment as an attribute. This was likely inherited from the source dataset (yuhonas/free-exercise-db).
Technical design:
Step 1: Introduce a movementId concept in exercises.ts. This is a string that groups variants:
typescriptexport interface Exercise {
  id: string           // unique per variant
  movementId: string   // shared across variants (e.g. "bench-press")
  name: string         // movement name without equipment (e.g. "Bench Press")
  ...
}
Step 2: Build a grouping utility:
typescriptexport function groupExercisesByMovement(
  exercises: Exercise[]
): Map<string, { movement: Exercise; variants: Exercise[] }>
Step 3: The WorkoutBuilder library shows grouped exercises. Tapping a group reveals an equipment picker. The picker shows only equipment types available for that movement from the DB.
Step 4: When a user selects "Bench Press" → picks "Barbell", the plan stores:
json{
  "id": "bench-press",          // movementId
  "variantId": "barbellbenchpress-mediumgrip",
  "name": "Bench Press",
  "selectedEquipmentType": "barbell",
  ...
}
Step 5: For exercises with only one equipment variant (e.g. barbell-only movements), skip the picker and auto-select.
Generating movementId: Rather than manually editing all 400+ exercises in exercises.ts, write a derivation function:
typescriptfunction deriveMovementId(exercise: Exercise): string {
  // Strip equipment prefixes/suffixes from the name
  // "Barbell Bench Press" → "bench-press"
  // "Dumbbell Bench Press" → "bench-press"
  // "Smith Machine Bench Press" → "bench-press"
}
This can be computed at runtime from the existing data. A manual override map handles edge cases.
Edge cases:

User has an existing plan using old id format. Migration: if plan exercise has no movementId, treat id as variantId and derive movementId on the fly.
Equipment type not available for movement: shouldn't happen with derivation, but show an "Other" fallback.
Exercises with ambiguous names: "Alternating Renegade Row" — only one variant. Auto-select.

Acceptance criteria:

WorkoutBuilder shows exercises grouped by movement name
Tapping a movement with multiple equipment types shows a picker
Selected equipment is stored in the plan
Single-variant movements skip the picker
Existing plans continue to work


Item #5: Equipment-Aware Weight History
User problem: If a user does Bench Press with a barbell one week and dumbbells the next, they share the same progression history. The engine might suggest 80kg for dumbbell bench press because last week's barbell session was 80kg total. Weights are not comparable across equipment types.
Root cause: The history key is exerciseId only. The progression engine, charts, and suggestion calculations don't discriminate by equipment.
Technical design:
The composite key: ${movementId}::${selectedEquipmentType}
Changes required:
workout_sets table:
sqlALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS equipment_type TEXT DEFAULT NULL;
workoutApi.log() in api.ts: Each set payload gains equipmentType:
typescriptinterface WorkoutSet {
  exerciseId: string
  exerciseName: string
  equipmentType?: string  // NEW
  ...
}
computeAllSuggestions() in progressiveOverload.ts:
typescript// Old key
const key = s.exerciseId || s.exerciseName

// New key
const key = s.equipmentType
  ? `${s.exerciseId}::${s.equipmentType}`
  : s.exerciseId || s.exerciseName  // backward-compat fallback
ActiveWorkout.tsx exerciseKey() helper:
typescriptfunction exerciseKey(ex: { id?: string; name: string; selectedEquipmentType?: string }): string {
  const base = (ex.id && ex.id.trim() !== '') ? ex.id : ex.name
  return ex.selectedEquipmentType ? `${base}::${ex.selectedEquipmentType}` : base
}
Display during workout: "Bench Press (Barbell)" — format in ActiveWorkout.tsx:
typescriptconst displayName = ex.selectedEquipmentType
  ? `${ex.name} (${formatEquipmentLabel(ex.selectedEquipmentType)})`
  : ex.name
Strength tab in Progress: Charts grouped by movementId, with an equipment filter dropdown.
Edge cases:

Old sets with no equipment_type: History key falls back to exerciseId. Users don't lose their progression data — they just can't compare across equipment until new data accumulates.
Same exercise, different equipment in same session: Treated as separate exercises in history. This is correct.
User changes equipment for an exercise in the plan: New key, new history. The engine correctly starts fresh with insufficient_data. This is intentional — 80kg barbell bench ≠ 80kg dumbbell bench.

Acceptance criteria:

Sets logged with equipment_type column populated
History and progression suggestions keyed by exerciseId::equipmentType
Workout display shows "Exercise Name (Equipment)"
Old data continues to work via fallback key
Strength charts in Progress tab can filter by equipment type


Item #1: Machine Weight as Total, Not Per-Side
User problem: When logging a machine exercise (e.g. leg press, chest press machine, cable row), the app shows "kg/side" as the label and treats the entered weight as per-side. But machine weight stacks show total weight. Users enter "100" on leg press and it logs as "100 kg/side" which is confusing and incorrect.
Root cause: In exerciseWeightMode.ts, machine and cable equipmentType values are classified as dumbbell mode (per-side). There is no machine WeightMode.
Technical design:
Add machine to WeightMode:
typescriptexport type WeightMode = 'barbell' | 'smith' | 'dumbbell' | 'bodyweight' | 'machine'
Add machine keywords to classification:
typescriptconst MACHINE_KEYWORDS = [
  'machine', 'leg press', 'leg extension', 'leg curl', 'seated leg curl',
  'lying leg curl', 'chest press machine', 'shoulder press machine',
  'calf raise machine', 'lat pulldown', 'seated cable row', 'cable row',
  'cable crossover', 'cable fly', 'cable chest press', 'pec deck',
  'hack squat machine', 'smith machine', 'leverage'
]
Update getWeightMode() priority:
typescript// After smith check, before bodyweight check:
if (equipment === 'machine') return 'machine'
if (MACHINE_KEYWORDS.some(k => n.includes(k))) return 'machine'
Update getWeightModeConfig():
typescriptcase 'machine':
  return {
    inputLabel: 'kg total',
    hint: 'Total stack weight',
    barWeight: 0,
    weightOptional: false,
    step: 5,  // machines typically go in 5kg increments
  }
Update all display formatting in ActiveWorkout.tsx set log display:
typescriptif (weightMode === 'machine') return `${s.weight} kg × ${s.reps}`
Edge cases:

Cable exercises: cables use weight stacks, so also machine mode.
Smith machine: already has its own mode (smith). No change.
Existing history logged as dumbbell mode: Display the historical values as-is. The machine mode change only affects new logs. Old e1RM calculations remain valid (weight×reps formula doesn't care about per-side vs total).
Dual cable exercises (e.g. "Cable Crossover"): These ARE per-side by nature. However, for simplicity and consistency with user expectation, treat all cable machines as total weight. Document this decision.

Acceptance criteria:

Machine exercises show "kg total" as input label
Step size defaults to 5kg for machines
Display in set log shows "X kg" without "per-side" or "/side"
plateSuggestion() does not fire for machine mode
Existing machine history data is not modified


Item #2: Exercise Skipping and Reordering During Workout
User problem: Users don't know they can skip or reorder exercises. The controls exist but are hidden under a MoreVertical icon with no visual affordance.
Root cause: The feature was implemented correctly but the UX buries the controls. On mobile, users don't intuitively look for a kebab menu on each exercise card. The feature needs surface-level visibility.
Technical design:
The queue system (exerciseQueue, handleDoLater, handleSkipEntirely) is already correct. Changes are purely presentational:
Option A (recommended): Add visible inline action buttons below the exercise header:
[Do later ↓]  [Skip today ⏭]
Small, secondary-styled buttons visible in the exercise card header area, not hidden in a menu. Keep the dropdown as well for completeness.
Option B: Add a swipe-left gesture on the exercise card to reveal skip/later options (native iOS feel). Higher implementation complexity.
Recommendation: Option A. Visible buttons with clear labels. The dropdown can remain for additional options.
Additionally, the "Up next" panel should show the queue order and indicate that reordering has occurred (a "moved" badge already exists — good).
Changes to ActiveWorkout.tsx:

Add two small Button elements (variant="outline", size="sm") beneath the exercise name in the card header:

"Do later" (with ArrowDown icon) — disabled when exerciseQueue.length <= 1
"Skip" (with SkipForward icon)


Keep the DropdownMenu as a secondary path
Add a brief tooltip/label on first use (or a one-time hint banner)

Edge cases:

User taps "Do later" when only 1 exercise remains: Currently shows a toast. Change to a more helpful message: "This is your last exercise — complete or skip it."
User taps "Skip" on last exercise: Transitions to feedback screen correctly (existing behavior).
Both buttons should be disabled and styled appropriately when conditions aren't met.

Acceptance criteria:

"Do later" and "Skip" buttons are visible on the active exercise card without requiring menu interaction
Functionality is identical to existing implementation
Queue reordering updates "Up next" panel immediately
Disabled states are visually clear


Item #3: Design Inconsistencies
User problem: Various visual inconsistencies across screens create a lack of polish. Common categories in fitness PWAs: inconsistent spacing, mixed icon styles, inconsistent button heights, inconsistent card padding, color token misuse.
Root cause: Rapid iterative development without a design review pass. The codebase mixes custom Tailwind classes with shadcn/ui defaults and custom CSS variables.
Technical design:
This requires a UI audit pass. Based on code analysis, known inconsistencies:

Button variants: The codebase defines custom variants (primary, secondary) in button.tsx but shadcn imports in some places use the default default variant which maps differently. Audit all Button usages and standardize on the custom variants.
Card padding: CardContent has px-6 by default, but some cards use pt-4 pb-4 overrides while others use pt-6. Standardize CardContent to p-4 on mobile (the current px-6 is too wide for iPhone viewport).
Color consistency: text-primary in the codebase resolves to #4f46e5 (indigo) in light mode and #818cf8 in dark mode. But emerald green is the brand color used in buttons and accents. Audit and align.
Typography: Some screens use text-2xl font-bold for page titles, others use text-xl font-semibold. Standardize page-level typography.
Input height: Mix of h-9, h-10, h-11 for inputs and selects. Standardize to h-11 (44px — Apple's recommended touch target).
Icon stroke width: Mix of strokeWidth={1.8} and strokeWidth={2} and unlabeled default.

Scope: This is a horizontal change across all screens. It should be done as a dedicated pass with a clear audit checklist per screen, not component-by-component.
Acceptance criteria:

All page titles use the same text-2xl font-bold class
All primary action buttons use variant="primary" with consistent height
Touch targets minimum 44px on mobile
Card content padding consistent at p-4 on mobile
No raw color values (only CSS variables or Tailwind tokens)


Item #6: Collapsible "How to Perform" Section
User problem: The instructions section takes up significant vertical space in the active workout view. During a workout, users are focused on logging sets, not reading instructions. The section should be out of the way by default but accessible.
Root cause: The instructions card is always expanded, taking up screen real estate below the logging UI.
Technical design:
The instructions section in ActiveWorkout.tsx is currently:
tsx{currentExercise.instructions && (
  <Card>
    <CardContent className="pt-4 pb-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">How to perform</p>
      <p className="text-sm...">{currentExercise.instructions}</p>
    </CardContent>
  </Card>
)}
Replace with a collapsible using Collapsible from the existing shadcn/ui component:
tsxconst [instructionsOpen, setInstructionsOpen] = useState(false)
// ...
<Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen}>
  <CollapsibleTrigger asChild>
    <button className="flex items-center justify-between w-full px-4 py-3 text-sm...">
      <span>How to perform</span>
      <ChevronDown className={cn("w-4 h-4 transition-transform", instructionsOpen && "rotate-180")} />
    </button>
  </CollapsibleTrigger>
  <CollapsibleContent>
    <p className="px-4 pb-4 text-sm...">{currentExercise.instructions}</p>
  </CollapsibleContent>
</Collapsible>
The state should reset to false when navigating to a new exercise (when currentExercise changes).
Edge cases:

Exercise has no instructions: Don't render the section at all (existing behavior).
User opens instructions, logs a set, timer starts: Instructions should remain in whatever state the user left them.
Reset on exercise change: useEffect on currentExercise.id → set instructionsOpen(false).

Acceptance criteria:

Instructions collapsed by default
Tapping the header expands/collapses smoothly
Collapses when moving to next exercise
Expand/collapse has a chevron that animates rotation


Item #7: Add Exercises Post-Workout
User problem: During a workout, a user decides to add an exercise that wasn't in their plan (e.g. they feel like doing abs, or a friend suggests something). Currently, once the workout is started, the exercise list is fixed.
Root cause: exercises and exerciseQueue are loaded from the plan at workout start and not modifiable during the session.
Technical design:
This requires adding an "Add exercise" flow to the active workout exercise screen (not just feedback screen, as the user should be able to add mid-workout too).
Data model impact: None — completedSets already accepts any exerciseId/exerciseName combination. The sets are logged regardless of whether the exercise was in the original plan.
Implementation:

Add an "Add exercise" button at the bottom of the exercise screen (below the "Up next" card, or as a floating button).
Tapping it opens a bottom sheet / drawer containing a simplified exercise picker (search + filter by category). Use the existing exerciseDatabase.
Selecting an exercise:

If item #4 is implemented: Show equipment picker for that exercise.
Creates an ExercisePlan entry using estimateStartingWeight() (first session baseline) — no history for ad-hoc exercises by definition, so the engine will use profile-based estimation.
Appends to exerciseQueue.


The added exercise shows a visual indicator in the "Up next" panel (e.g. "Added by you" badge or different color).
On the feedback screen, skippedCount calculation should not count exercises the user added ad-hoc (they weren't skipped, they were added).

Edge cases:

User adds duplicate exercise (already in queue): Show a warning or allow (some users do two chest exercises). Recommendation: allow with a toast "Already in today's plan, adding another."
User adds exercise after completing all planned exercises: This means they're on the feedback screen. The "Add exercise" button should also appear there, which sends them back into exercise mode.
Exercise added mid-rest timer: The timer continues; user just queued the next exercise.
Added exercise has no history: Handled by estimateStartingWeight() fallback. Show first-session indicator.

Acceptance criteria:

"Add exercise" button visible during active workout and on feedback screen
Exercise picker opens in a drawer/sheet
Selected exercise appended to exerciseQueue
Added exercises tracked and logged as part of the session
Progression engine doesn't count ad-hoc exercises toward "skipped" count


Item #8: Timer Sound + Better Completion Animation
User problem: The rest timer completes silently, so users miss the notification when the phone is face-down or they're not looking at the screen. The current set completion toast is small and easy to miss.
Root cause: Web Audio API usage not implemented. The Celebration component in celebration.tsx exists but is only triggered at workout completion, not set completion.
Technical design:
Sound: Use the Web Audio API to generate a simple beep tone (no audio file needed, works offline):
typescriptfunction playTimerSound() {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.frequency.value = 880  // A5 - pleasant but attention-getting
  gain.gain.setValueAtTime(0.3, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
  oscillator.start(ctx.currentTime)
  oscillator.stop(ctx.currentTime + 0.5)
}
For background behavior: iOS restricts web audio when the app is in the background. The visibilitychange handler already exists in ActiveWorkout.tsx. We can use ServiceWorker + Notification API as a fallback. When the timer would expire while backgrounded, schedule a notification:
typescriptif (Notification.permission === 'granted') {
  const delay = restTimer * 1000
  setTimeout(() => {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification('Rest complete!', {
        body: 'Time to get back to it 💪',
        icon: '/icon.svg',
        badge: '/icon.svg',
        vibrate: [200, 100, 200]
      })
    })
  }, delay)
}
Sound toggle: Add a toggle in the timer UI (speaker icon) so users can opt out. Store preference in localStorage.
Better set completion animation: Instead of just a toast, create a subtle green flash / pulse on the "Complete Set" button area, paired with haptic feedback:
typescriptnavigator.vibrate?.(50)
The existing Celebration component is full-screen confetti — too heavy for per-set completion. Create a lighter SetCompletePulse component: a brief green ring that expands from the button and fades out.
Edge cases:

AudioContext requires user gesture to start on iOS: Initialize on first tap anywhere in the workout. Lazy initialize in a useRef.
Notification permission denied: Fall back to audio only, no notification.
User backgrounded the app before timer started (unlikely): The visibilitychange handler already calculates remaining time correctly.
Sound toggle state: Persist in localStorage, default to OFF (sound is opt-in, not opt-out, to avoid surprising users in public gyms).

Acceptance criteria:

Sound plays when rest timer reaches 0 (if enabled)
Sound toggle visible in rest timer UI
Sound works when app is in foreground
Push notification fires when app is minimized (if permissions granted)
Set completion has a visual pulse/flash distinct from the workout-end confetti
Default state: sound OFF


Implementation Roadmap

Phase 1: Foundation — Exercise Data Model + Equipment Grouping
Dependencies: None. Must be completed before all other phases.
Tasks:
1.1 Add movementId to Exercise interface in exercises.ts

Write a deriveMovementId(exercise: Exercise): string function that strips equipment prefixes from exercise names
Apply it to all 400+ exercises (automated transformation, not manual)
Complexity: Medium

1.2 Build movement grouping utility — src/utils/exerciseGrouping.ts

groupExercisesByMovement(): returns Map<movementId, Exercise[]>
getEquipmentOptionsForMovement(movementId): returns distinct equipmentType values
getDefaultVariantForMovement(movementId, preferredEquipment?): returns best matching variant
Complexity: Low

1.3 Add machine WeightMode to exerciseWeightMode.ts

Extend WeightMode type
Update getWeightMode() classification logic
Update getWeightModeConfig() with machine config (total weight, 5kg step)
Update formatWeight() for machine display
Update plateSuggestion() to return empty string for machine mode
Complexity: Low

1.4 Update WorkoutBuilder exercise picker (WorkoutBuilder.tsx)

Replace flat exercise list with grouped movement list
Add equipment picker drawer/popover for multi-variant movements
Auto-select for single-variant movements
Store selectedEquipmentType in the plan
Complexity: High

1.5 Update plan storage — ExerciseWithSets type gets selectedEquipmentType?: string

planApi.save() and planApi.get() pass through selectedEquipmentType in JSONB (already works — JSONB is schema-less for nested objects)
Complexity: Low

Risks:

deriveMovementId may produce incorrect groupings for ambiguous exercise names. Needs manual review of edge cases. Create a test file with expected outputs for 20 key exercises.
WorkoutBuilder is the most complex screen to change. The tab-based UI and exercise filtering logic touches many components.

Estimated complexity: High overall

Phase 2: Core Data Accuracy — Equipment-Aware Tracking + Machine Weight
Dependencies: Phase 1 complete
Tasks:
2.1 Database migration — data_migration/migration_equipment_type.sql
sql   ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS equipment_type TEXT DEFAULT NULL;
   CREATE INDEX IF NOT EXISTS idx_sets_user_exercise_equipment
     ON workout_sets(user_id, exercise_id, equipment_type, completed_at DESC);
Complexity: Low
2.2 Update WorkoutSet type in api.ts to include equipmentType?: string
Complexity: Low
2.3 Update workoutApi.log() to write equipment_type to DB
Complexity: Low
2.4 Update exerciseKey() in ActiveWorkout.tsx to produce composite key
typescript   function exerciseKey(ex): string {
     const base = (ex.id && ex.id.trim() !== '') ? ex.id : ex.name
     return ex.selectedEquipmentType ? `${base}::${ex.selectedEquipmentType}` : base
   }
Complexity: Low
2.5 Update computeAllSuggestions() in progressiveOverload.ts for composite key with backward-compat fallback
Complexity: Medium
2.6 Update ActiveWorkout.tsx display — show "Exercise Name (Equipment)" in card header
Complexity: Low
2.7 Update getStrengthData() in Progress.tsx — group by composite key, display movement name + equipment tab/filter
Complexity: Medium
2.8 Update buildChartMap() in ProgressionInsights.tsx and NextSession.tsx — composite key lookup
Complexity: Low
2.9 Test backward compatibility — verify users with existing history (no equipment_type) still see their progression data
Complexity: Medium (testing effort)
Risks:

The computeAllSuggestions() change is central. A bug here silently breaks progression suggestions for all users. Write unit tests before changing.
Progress.tsx getStrengthData() groups by exerciseId || exerciseName today. Changing this key will cause the strength chart to show empty data for old exercises until new data accumulates. Communicate this to users or handle gracefully with a "legacy data" display mode.

Estimated complexity: Medium

Phase 3: Active Workout Workflow
Dependencies: Phase 1 (for add-exercise equipment picker), Phase 2 (for correct logging)
Tasks:
3.1 Item #2: Surface exercise reordering UI in ActiveWorkout.tsx

Add visible "Do later" and "Skip" buttons to exercise card header
Keep existing dropdown for secondary access
Complexity: Low

3.2 Item #7: Add exercise during workout

Create AddExerciseDrawer component (search + equipment picker, reuses WorkoutBuilder logic)
Wire to exerciseQueue append + plans map update
Add button to active workout screen and feedback screen
Complexity: High

3.3 Item #7: Add exercise from feedback screen

"Add more exercises" button on feedback screen that re-enters exercise phase
Complexity: Medium

3.4 Fix feedback screen skippedCount — exclude ad-hoc-added exercises from skip count
Complexity: Low
Risks:

AddExerciseDrawer is a mini version of WorkoutBuilder. If Phase 1 is done cleanly, most of the logic can be reused. If not, there will be duplication.
Re-entering exercise mode from feedback is a state machine change. The currentPhase state transitions are currently one-directional (warmup → exercise → feedback). Adding a backward transition needs careful handling to avoid losing set data.

Estimated complexity: High (Item #7), Low (Item #2)

Phase 4: UX Polish
Dependencies: None (can be done in parallel with Phase 2/3)
Tasks:
4.1 Item #6: Collapsible instructions

Modify instructions card in ActiveWorkout.tsx
Add useState(false) for collapsed state
Reset on exercise change
Complexity: Low

4.2 Item #3: Design consistency audit

Audit all pages against the consistency checklist
Dashboard, Plan, Progress, Library, Profile, ActiveWorkout, WorkoutBuilder, Onboarding
Fix button variants, card padding, typography, touch target sizes, icon stroke widths
Complexity: Medium (many small changes, tedious but not technically complex)

4.3 Item #3: Input standardization

Standardize all form inputs to 44px height (h-11)
Standardize number inputs in ActiveWorkout to larger tap targets
Complexity: Low

Risks:

Design changes are high-volume and low-risk individually but can introduce visual regressions if done carelessly. Should include visual testing or careful manual review.

Estimated complexity: Low–Medium

Phase 5: Nice-to-Have Features
Dependencies: None
Tasks:
5.1 Item #8: Rest timer sound

Implement Web Audio API beep function
Add sound toggle to rest timer UI
Persist preference in localStorage
Complexity: Low

5.2 Item #8: Background timer notification

Request notification permission on workout start (if not already granted)
Schedule ServiceWorker notification when backgrounding
Cancel notification if timer skipped
Complexity: Medium

5.3 Item #8: Set completion animation

Create SetCompletePulse component — subtle green ring animation
Trigger on handleSetComplete() success
Complexity: Low

5.4 Haptic feedback

Add navigator.vibrate(50) to set completion
Add navigator.vibrate([200, 100, 200]) to timer completion
Complexity: Low

Risks:

iOS PWA has restricted ServiceWorker notification support in some versions. The feature degrades gracefully to foreground-only sound if notifications are unavailable.
AudioContext autoplay policy: must be lazily initialized after user gesture. If initialized at component mount, iOS will block it.

Estimated complexity: Low–Medium

Handoff For Coding Agent — Sequential Execution Checklist
The following tasks are ordered for sequential execution. Each task includes the file(s) to change, what to change, and the acceptance test.

PHASE 1 TASKS
Task 1.1 — Add movementId to Exercise interface

File: src/data/exercises.ts
Add movementId?: string field to the Exercise interface
Write function deriveMovementId(exercise: Exercise): string:

Lowercase the name
Strip leading equipment words: barbell, dumbbell, ez bar, ez-bar, smith machine, cable, machine, kettlebell, resistance band, band, seated, standing, lying, incline, decline, flat bench
Strip trailing descriptors: with bands, on bench, narrow grip, wide grip, medium grip, close grip, behind the back, to a bench
Trim whitespace and replace spaces with hyphens
Examples: "Barbell Bench Press - Medium Grip" → "bench-press", "Dumbbell Flyes" → "flyes", "Smith Machine Squat" → "squat"


Add a MOVEMENT_ID_OVERRIDES: Record<string, string> map for known edge cases (at minimum: all squat variants → "squat", all deadlift variants → "deadlift", all bench press variants → "bench-press", all row variants → "row")
Apply movementId = MOVEMENT_ID_OVERRIDES[exercise.id] ?? deriveMovementId(exercise) to every exercise entry
Do not manually edit 400+ exercises — generate the values computationally
Acceptance test: exerciseDatabase.filter(e => !e.movementId).length === 0

Task 1.2 — Create exercise grouping utilities

Create file: src/utils/exerciseGrouping.ts
Export groupExercisesByMovement(exercises: Exercise[]): Map<string, Exercise[]> — key is movementId, value is array of variants
Export getEquipmentOptionsForMovement(movementId: string): string[] — distinct equipmentType values for that movement, sorted alphabetically
Export getMovementDisplayName(movementId: string): string — returns the shortest non-prefixed name among variants (e.g. "Bench Press" not "Barbell Bench Press")
Export getDefaultVariant(movementId: string, preferredEquipment?: string): Exercise | undefined
Acceptance test: groupExercisesByMovement(exerciseDatabase).get("bench-press")?.length > 1 and all returned exercises have primaryMuscles including "chest"

Task 1.3 — Add machine WeightMode

File: src/utils/exerciseWeightMode.ts
Add 'machine' to WeightMode type
Add MACHINE_KEYWORDS array (include: 'machine', 'leg press', 'leg extension', 'leg curl', 'seated leg curl', 'lying leg curl', 'cable', 'lat pulldown', 'pulldown', 'pec deck', 'chest press machine', 'shoulder press machine', 'leverage')
In getWeightMode(), add after the smith check and before the bodyweight check:

  if (equipment === 'machine' || equipment === 'cable') return 'machine'
  if (MACHINE_KEYWORDS.some(k => n.includes(k))) return 'machine'

In getWeightModeConfig(), add case 'machine': inputLabel: 'kg total', hint: 'Total stack weight', barWeight: 0, weightOptional: false, step: 5
In formatWeight(), add if (mode === 'machine') return \${weight} kg``
In plateSuggestion(), add early return if (mode !== 'barbell') return '' (or update condition to include machine explicitly)
In ActiveWorkout.tsx set log display section, add machine case: if (weightMode === 'machine') return \${s.weight} kg × ${s.reps}``
Acceptance test: getWeightMode('Leg Press', 'machine', 'compound_db_machine') === 'machine' and getWeightModeConfig('machine').inputLabel === 'kg total'

Task 1.4 — Update WorkoutBuilder for grouped exercises with equipment picker

File: src/app/pages/WorkoutBuilder.tsx
Add imports: groupExercisesByMovement, getEquipmentOptionsForMovement, getMovementDisplayName from exerciseGrouping.ts
Update ExerciseWithSets interface: add selectedEquipmentType?: string and movementId?: string
Update getFilteredExercises(): instead of returning flat Exercise[], work with the grouped map. Return deduplicated by movementId for the "suggested" section. Keep full list for "rest" section but also deduped.
Add state: const [equipmentPickerMovement, setEquipmentPickerMovement] = useState<string | null>(null)
In ExerciseRow, when the user clicks "Add": if getEquipmentOptionsForMovement(ex.movementId).length > 1, call setEquipmentPickerMovement(ex.movementId) instead of directly calling addExercise(ex). If single variant, call addExercise(ex) directly.
Add EquipmentPickerDialog component (inline or separate file): renders a Dialog or Drawer with equipment buttons for the selected movement. On selection, calls addExercise(selectedVariant) with selectedEquipmentType set.
Update addExercise(): set withSets.selectedEquipmentType = exercise.equipmentType (the selected variant's equipment type) and withSets.movementId = exercise.movementId
In the selected exercises list (left panel), display exercise as getMovementDisplayName(ex.movementId) + " (" + formatEquipmentLabel(ex.selectedEquipmentType) + ")" when selectedEquipmentType is present

Task 1.5 — Update plan JSONB passthrough

File: src/utils/api.ts
In planApi.save(): no change needed (JSONB stores whatever is in the exercises array)
In planApi.get(): no change needed
Verify that selectedEquipmentType and movementId on exercise objects survive the JSONB round-trip. Write a brief test by logging a plan and reading it back.
Acceptance test: Save a plan with selectedEquipmentType: "barbell" on an exercise, retrieve the plan, verify field is present.


PHASE 2 TASKS
Task 2.1 — Database migration

Create file: data_migration/migration_equipment_type.sql

sql  ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS equipment_type TEXT DEFAULT NULL;
  CREATE INDEX IF NOT EXISTS idx_sets_user_exercise_equipment
    ON workout_sets(user_id, exercise_id, equipment_type, completed_at DESC);

Run in Supabase SQL Editor
Acceptance test: SELECT column_name FROM information_schema.columns WHERE table_name = 'workout_sets' AND column_name = 'equipment_type' returns one row.

Task 2.2 — Update WorkoutSet type

File: src/utils/api.ts
Add equipmentType?: string to WorkoutSet interface
In workoutApi.log() sets mapping, add equipment_type: s.equipmentType || null
In workoutApi.getHistory() sets mapping, add equipmentType: s.equipment_type || undefined
In WorkoutSession interface, ensure sets: WorkoutSet[] reflects the change

Task 2.3 — Update exerciseKey() in ActiveWorkout

File: src/app/pages/ActiveWorkout.tsx
Update exerciseKey() helper:

typescript  function exerciseKey(ex: { id?: string; name: string; selectedEquipmentType?: string }): string {
    const base = (ex.id && ex.id.trim() !== '') ? ex.id : ex.name
    return ex.selectedEquipmentType ? `${base}::${ex.selectedEquipmentType}` : base
  }

Update all SetLog entries to include equipmentType: currentExercise.selectedEquipmentType
Update the display: const displayName = ex.selectedEquipmentType ? \ex.name({ex.name} (
ex.name({formatEquipmentLabel(ex.selectedEquipmentType)})\` : ex.name— use this in theCardTitle`

Task 2.4 — Add formatEquipmentLabel() utility

File: src/utils/exerciseWeightMode.ts (or new src/utils/formatters.ts)
Export formatEquipmentLabel(equipmentType: string): string:

  'barbell' → 'Barbell'
  'dumbbell' → 'Dumbbell'
  'smith' → 'Smith Machine'
  'machine' → 'Machine'
  'cable' → 'Cable'
  'kettlebell' → 'Kettlebell'
  'band' → 'Resistance Band'
  'bodyweight' → 'Bodyweight'
  default → capitalize first letter
Task 2.5 — Update progressive overload engine for composite key

File: utils/progressiveOverload.ts
In computeAllSuggestions(), update the key derivation inside the sorted loop:

typescript  const key = (s.equipmentType && s.equipmentType.trim() !== '')
    ? `${(s.exerciseId || s.exerciseName)}::${s.equipmentType}`
    : s.exerciseId || s.exerciseName

No other changes to the engine logic — only the key string changes
Acceptance test: Two WorkoutLog objects — one with exerciseId: "bench" and equipmentType: "barbell", one with exerciseId: "bench" and equipmentType: "dumbbell" — should produce two separate keys in the result map.

Task 2.6 — Update Progress.tsx strength chart

File: src/app/pages/Progress.tsx
In getStrengthData(), update key derivation:

typescript  const key = (s.equipmentType && s.equipmentType.trim() !== '')
    ? `${(s.exerciseId || s.exerciseName)}::${s.equipmentType}`
    : s.exerciseId || s.exerciseName

Update displayName in the map value: when key is composite, extract the movement name part and append (EquipmentLabel)
Update exercise selector buttons to display formatted names
Acceptance test: After logging a barbell bench press session and a dumbbell bench press session, the strength chart shows two separate entries.

Task 2.7 — Update ProgressionInsights and NextSession composite key

File: src/app/components/ProgressionInsights.tsx and src/app/components/NextSession.tsx
In buildChartMap(), update key derivation (same pattern as Task 2.5)
These components receive history: WorkoutLog[] from parent — the key derivation change propagates automatically
No other changes needed


PHASE 3 TASKS
Task 3.1 — Surface exercise reorder/skip UI

File: src/app/pages/ActiveWorkout.tsx
In the exercise CardHeader, below the exercise name row, add:

tsx  <div className="flex gap-2 mt-2">
    <Button
      variant="outline"
      size="sm"
      onClick={handleDoLater}
      disabled={exerciseQueue.length <= 1}
      className="flex-1 text-xs h-8"
    >
      <ArrowDown className="w-3 h-3 mr-1" /> Do later
    </Button>
    <Button
      variant="outline"
      size="sm"
      onClick={handleSkipEntirely}
      className="flex-1 text-xs h-8 text-muted-foreground"
    >
      <SkipForward className="w-3 h-3 mr-1" /> Skip today
    </Button>
  </div>

Keep the DropdownMenu as-is (it doesn't hurt)
Remove the text "You can reorder or skip exercises any time during the workout." from the warmup screen (the UI now makes it self-evident)
Acceptance test: Both buttons visible without interaction. "Do later" disabled when exerciseQueue.length === 1. "Skip today" removes exercise from queue.

Task 3.2 — Add exercise drawer component

Create file: src/app/components/AddExerciseDrawer.tsx
Props: open: boolean, onClose: () => void, onAddExercise: (exercise: Exercise, equipmentType: string) => void, profile: UserProfile | null
Internal state: search: string, categoryFilter: string, selectedMovement: string | null
Renders using the existing Drawer component from drawer.tsx
Inner layout:

Search input
Category filter pills
Grouped exercise list (reuse groupExercisesByMovement logic)
Equipment picker step (if movement has multiple variants)


Reuse getFilteredExercises() logic from WorkoutBuilder (extract into shared utility if possible)
Acceptance test: Opens as a bottom sheet. Can search for "bench". Selecting it shows barbell/dumbbell/machine options. Selecting "Barbell" calls onAddExercise with the correct exercise and "barbell" as equipmentType.

Task 3.3 — Wire AddExerciseDrawer to ActiveWorkout

File: src/app/pages/ActiveWorkout.tsx
Add state: const [showAddExercise, setShowAddExercise] = useState(false)
Add AddExerciseDrawer at the bottom of the exercise screen JSX
Add "Add exercise" button at the bottom of the screen (below "Up next" card):

tsx  <button onClick={() => setShowAddExercise(true)} className="...">
    <Plus className="w-4 h-4 mr-2" /> Add exercise
  </button>

In AddExerciseDrawer.onAddExercise handler:

typescript  const key = selectedEquipmentType ? `${exercise.id}::${selectedEquipmentType}` : exercise.id
  const tier = classifyExercise(exercise.name)
  const estimate = profile ? estimateStartingWeight(exercise.name, profile, exercise.id) : null
  const newPlan: ExercisePlan = {
    suggestedWeight: estimate?.weight ?? 0,
    suggestedReps: estimate?.reps ?? getRepTarget(tier),
    sets: 3,
    source: 'estimated',
    isFirstSession: true,
    mode: getWeightMode(exercise.name, selectedEquipmentType || exercise.equipmentType, tier),
  }
  const exerciseWithEquipment = { ...exercise, selectedEquipmentType }
  setExerciseQueue(prev => [...prev, exerciseWithEquipment])
  setPlans(prev => ({ ...prev, [key]: newPlan }))
  setTotalPlanned(prev => prev + 1)
  setShowAddExercise(false)
  toast('Exercise added to queue')
Task 3.4 — Add exercise from feedback screen

File: src/app/pages/ActiveWorkout.tsx
On the feedback screen, add an "Add another exercise" button above the "Save & Finish" button
On click: set currentPhase('exercise') and open AddExerciseDrawer
When new exercise is added from feedback screen, set exerciseQueue to [newExercise] (only the new exercise, not all previous)
Acceptance test: On feedback screen, tapping "Add another exercise" returns to exercise screen with the new exercise loaded. Completing it saves its sets with the rest of the session.

Task 3.5 — Fix skippedCount for ad-hoc exercises

File: src/app/pages/ActiveWorkout.tsx
Add state: const [adHocExerciseIds, setAdHocExerciseIds] = useState<Set<string>>(new Set())
When adding an exercise via AddExerciseDrawer, add its key to adHocExerciseIds
In skippedCount calculation:

typescript  const plannedExerciseIds = exercises
    .filter(ex => !adHocExerciseIds.has(exerciseKey(ex)))
    .map(ex => exerciseKey(ex))
  const completedPlannedIds = new Set(
    completedSets
      .filter(s => !adHocExerciseIds.has(s.exerciseId))
      .map(s => s.exerciseId)
  )
  const skippedCount = plannedExerciseIds.filter(id => !completedPlannedIds.has(id)).length

PHASE 4 TASKS
Task 4.1 — Collapsible instructions

File: src/app/pages/ActiveWorkout.tsx
Add state: const [instructionsOpen, setInstructionsOpen] = useState(false)
Add useEffect(() => setInstructionsOpen(false), [currentExercise?.id]) to reset on exercise change
Replace the existing instructions Card with:

tsx  {currentExercise.instructions && (
    <Card>
      <button
        onClick={() => setInstructionsOpen(v => !v)}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
          How to perform
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", instructionsOpen && "rotate-180")} />
      </button>
      {instructionsOpen && (
        <CardContent className="pt-0 pb-4">
          <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
            {currentExercise.instructions}
          </p>
        </CardContent>
      )}
    </Card>
  )}

Import BookOpen from lucide-react
Acceptance test: Instructions hidden on load. Tapping header shows instructions. Moving to next exercise collapses them again.

Task 4.2 — Design consistency audit and fixes

Audit file list: Dashboard.tsx, Plan.tsx, Progress.tsx, Library.tsx, Profile.tsx, ActiveWorkout.tsx, WorkoutBuilder.tsx, Onboarding.tsx
For each file, apply:

Page title: <h1 className="text-2xl font-bold tracking-tight pt-2">
Primary action buttons: variant="primary" with size="lg" for full-width, size="default" for inline
Input height: all Input and Select components get className="h-11" unless already set
Card content padding: <CardContent className="p-4"> for mobile-first cards (remove px-6 overrides)
Icon stroke widths: standardize all Icon components to use default (no explicit strokeWidth) unless the icon is in an active state (where strokeWidth={2.2} is acceptable)
Remove any hardcoded color values (e.g. text-gray-600) and replace with token equivalents (text-muted-foreground)


This is a high-volume mechanical task. Work screen by screen.


PHASE 5 TASKS
Task 5.1 — Rest timer sound

Create file: src/utils/timerSound.ts
Export initAudioContext(): AudioContext | null — lazy init, returns null if unavailable
Export playRestCompleteSound(ctx: AudioContext): void:

typescript  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(880, ctx.currentTime)
  oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.15)
  gain.gain.setValueAtTime(0.4, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
  oscillator.start(ctx.currentTime)
  oscillator.stop(ctx.currentTime + 0.6)

Export SOUND_PREF_KEY = 'atlas_timer_sound'

Task 5.2 — Wire sound to ActiveWorkout

File: src/app/pages/ActiveWorkout.tsx
Add state: const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem(SOUND_PREF_KEY) !== 'false')
Add ref: const audioCtxRef = useRef<AudioContext | null>(null)
Initialize AudioContext on first user interaction (first tap of any button in the workout): if (!audioCtxRef.current) audioCtxRef.current = initAudioContext()
In the rest timer setRestTimer callback where t <= 1:

typescript  if (soundEnabled && audioCtxRef.current) {
    playRestCompleteSound(audioCtxRef.current)
  }
  navigator.vibrate?.([200, 100, 200])

Add sound toggle icon button next to the "Skip" button in the rest timer bar:

tsx  <button onClick={() => { const next = !soundEnabled; setSoundEnabled(next); localStorage.setItem(SOUND_PREF_KEY, String(next)) }}>
    {soundEnabled ? <Volume2 className="w-4 h-4 text-white/80" /> : <VolumeX className="w-4 h-4 text-white/40" />}
  </button>
Task 5.3 — Background timer notification

File: src/app/pages/ActiveWorkout.tsx
On workout start (setCurrentPhase('exercise')), request notification permission: Notification.requestPermission()
When startRestTimer() is called and document is hidden or will become hidden:

typescript  let notifTimeout: ReturnType<typeof setTimeout> | null = null
  
  const scheduleNotification = (seconds: number) => {
    if (notifTimeout) clearTimeout(notifTimeout)
    if (Notification.permission !== 'granted') return
    notifTimeout = setTimeout(() => {
      navigator.serviceWorker?.ready.then(reg => {
        reg.showNotification('Rest complete! 💪', {
          body: 'Time to start your next set',
          icon: '/icon.svg',
          vibrate: [200, 100, 200],
          tag: 'rest-timer',  // replaces previous notification
        })
      })
    }, seconds * 1000)
  }

Call scheduleNotification(REST_DURATION) in startRestTimer()
Cancel notification in the setRestTimer callback where t <= 1: if (notifTimeout) { clearTimeout(notifTimeout); notifTimeout = null }
Cancel on "Skip rest" button click
Acceptance test: Start rest timer, immediately switch to another app, wait for timer to expire. A notification appears.

Task 5.4 — Set completion pulse animation

Create file: src/app/components/ui/SetCompletePulse.tsx

tsx  interface Props { show: boolean }
  export function SetCompletePulse({ show }: Props) {
    if (!show) return null
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/30 animate-ping" />
      </div>
    )
  }

File: src/app/pages/ActiveWorkout.tsx
Add state: const [showPulse, setShowPulse] = useState(false)
In handleSetComplete(), after success: setShowPulse(true); setTimeout(() => setShowPulse(false), 500)
Add <SetCompletePulse show={showPulse} /> inside the CardContent (positioned relative)
Also add navigator.vibrate?.(50) in handleSetComplete()
Acceptance test: Logging a set shows a brief green pulse. Disappears after ~500ms. Does not interfere with button interaction.


Final Notes for Coding Agent
Execution order is strict for Phases 1 and 2. Phase 1 must be fully complete before Phase 2. Within each phase, tasks can be done in any order unless noted.
The exerciseKey() function in ActiveWorkout.tsx is the single most critical change in Phase 2. It touches set logging, plan lookup, and progression engine input simultaneously. Change it in one place and verify all three downstream effects.
Never modify the workout_sets table's existing exercise_id or exercise_name columns. Only add the new equipment_type column. Backward compatibility depends on the old columns remaining intact.
movementId derivation is the highest-risk task in Phase 1. The automated derivation will produce some incorrect groupings (e.g. "Dead Bug" might match "Deadlift"). The MOVEMENT_ID_OVERRIDES map is the escape hatch. Prioritize getting the 30 most-used exercises correct; edge cases in rarely-used exercises are acceptable.
Test the progression engine composite key change in isolation before integrating it into the full application. Write a small test script with mock WorkoutLog data containing the composite key format and verify computeAllSuggestions() output before wiring to the UI.