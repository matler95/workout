# Atlas — V2 Build Plan

*Based on a read-through of `matler95/workout` (React + Vite + Supabase PWA) as it stands today.*

## 0. What "V2" actually means here

Worth saying up front, because it changes the shape of the work: this isn't a blank-slate app. You already have a working progression engine (`progressiveOverload.ts` — Epley e1RM, deload logic, exercise tiers), a periodization module, fatigue/injury-risk detection, a set-count recommender, a `movementId`-based exercise grouping system, and a substitution suggester (`smartAlgorithms.suggestSubstitutes` + `ExerciseSubstitutions.tsx`) that's already halfway to item #6. There's also an existing `analysis_and_plan.md` in the repo describing an equipment-aware history-key migration (`exerciseId::equipmentType`) — check whether that migration actually landed, because it's directly relevant to #7 below.

So V2 is best framed as: **rebuild the exercise data layer from scratch, add a real plan-generation engine in front of the existing algorithms, and upgrade the in-workout and progression UX** — not a rewrite of the math you've already built and debugged.

---

## 1. Branching & deployment strategy (#10)

**Git:** Cut a `v2` branch from `main` now. Keep `main` untouched except for genuine production hotfixes, which you cherry-pick into `v2` as they land.

**Supabase:** Because you're rebuilding the exercise DB and its relationships from scratch, don't do this inside the production project. Two options:

- **New Supabase project for v2** (recommended). Clean schema, no risk of a bad migration touching live user data, and you can iterate on table structure freely. Downside: you'll need an explicit user/auth migration path later if you ever want v1 users' history carried over — plan for that as a one-time export/import script when you're ready to cut over, not before.
- **Same project, new schema (`v2.*`) or `_v2`-suffixed tables** — cheaper to set up, shares auth, but you're now writing every query with schema-awareness and it's easy to leak a v2 table read into a v1 code path. Only worth it if you specifically want to test v2 against real user auth/accounts during beta.

Given you said "first locally, then integrate on Supabase," the new-project route fits better — you're not coupling v2's schema decisions to what's already live.

**Hosting:** Two Vercel deployments (or one project, two branches with distinct preview domains): `main` → production domain, `v2` branch → a staging subdomain (e.g. `beta.yourapp.com`) with its own env vars pointing at the v2 Supabase project. This gets you a real, shareable test URL without touching production, which is exactly what "keep production separate so users can further test it" needs.

---

## 2. Exercise database — greenfield schema (#8, #9)

Your current `Exercise` interface (`movementId`, `category`, `primaryMuscles`/`secondaryMuscles`, `equipment`, `equipmentType`, `difficulty`) is a reasonable base but is a flat list with no way to express *how much* a muscle is involved, what a movement costs in fatigue/time, or what else could substitute for it — all of which the new generation engine and swap feature need. Proposed structure, local-first as TypeScript/JSON, mirroring 1:1 into Supabase tables later:

```ts
interface Exercise {
  id: string;                    // unique per variant, e.g. "bench-press-barbell"
  movementId: string;            // groups variants, e.g. "bench-press" (keep — this already works well)
  name: string;

  // Classification
  mechanic: 'compound' | 'isolation';
  force: 'push' | 'pull' | 'static';
  splitTags: Array<'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full_body' | 'abs'>;
                                  // multi-tag, not single — a row like leg press
                                  // belongs to both "legs" and "lower"

  // Muscle involvement — the thing your current schema is missing
  muscles: Array<{
    muscle: string;               // controlled vocabulary, see below
    role: 'primary' | 'secondary';
    involvement: number;          // 0-1, used to weight set-credit toward volume targets
  }>;

  // Equipment / logistics
  equipmentType: 'barbell' | 'dumbbell' | 'smith' | 'machine' | 'cable' | 'kettlebell' | 'band' | 'bodyweight' | 'other';
  equipmentNeeded: string[];      // e.g. ["flat-bench", "barbell", "rack"] — used both for
                                  // filtering by "what do I have access to" and for the
                                  // "equipment is occupied" swap trigger
  spaceRequirement: 'stall' | 'bench' | 'floor' | 'rack';

  // Programming metadata — feeds the generator and progression engine directly
  tier: 'primary' | 'secondary' | 'accessory';   // maps to your existing ExerciseTier
  defaultRepRange: [number, number];
  fatigueCost: 1 | 2 | 3;         // rough "how much recovery this demands", used to time-budget sessions
  unilateral: boolean;

  // Substitution
  substitutionGroupId: string;    // exercises with the same primary muscle + similar mechanic;
                                  // your current suggestSubstitutes computes this at runtime —
                                  // consider precomputing it at DB-build time instead so swap
                                  // suggestions are instant and consistent, not query-time heuristics

  difficulty: 'beginner' | 'intermediate' | 'advanced';
  instructions: string;
  cues?: string[];
  tempo?: string;
  videoUrl?: string;
}
```

**Controlled muscle vocabulary:** define a fixed `muscles` table (chest, front-delts, lats, etc. — 15-20 entries covers almost everything) rather than free strings, so `primaryMuscles.includes('chest')` never silently drifts (your `getMovementId` fallback comment shows this exact kind of drift already bit you once with `movementId`).

**Supabase tables**, once the local set is stable:

```sql
exercises (id, movement_id, name, mechanic, force, equipment_type, tier, difficulty, fatigue_cost, unilateral, default_rep_min, default_rep_max, space_requirement, instructions, cues, tempo, video_url)
muscles (id, name, region)                         -- e.g. 'chest', 'upper-body'
exercise_muscles (exercise_id, muscle_id, role, involvement)
exercise_equipment (exercise_id, equipment_item)    -- normalizes equipmentNeeded[]
exercise_split_tags (exercise_id, split_tag)
substitution_groups (exercise_id, group_id)
```

Keep `movementId` as-is — it already works and the codebase already leans on it in `exerciseGrouping.ts` and `exerciseWeightMode.ts`.

Port your existing `exerciseIntegrityCheck.ts` to validate the new schema (every exercise has ≥1 primary muscle, `substitutionGroupId` isn't orphaned, `defaultRepRange` is sane for its tier, etc.) — cheap insurance against the exact kind of stale-data bug the `movementId` comment describes.

---

## 3. Build-my-own vs. Template — one generator, two entry points (#1, #5)

The important architectural decision: **don't build two separate code paths for "template" and "build your own."** Build one **session compiler** that takes:

```ts
interface SessionSpec {
  splitDay: 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full_body';
  equipmentAvailable: EquipmentType[];
  durationMinutes: number;           // working time, excludes warmup per your spec
  seedExercises: Exercise[];         // user-picked exercises, empty array for pure template mode
}

function compileSession(spec: SessionSpec, db: Exercise[]): CompiledSession
```

- **Template mode** calls it with `seedExercises: []` — the compiler does 100% of the picking.
- **Build-my-own mode** calls it with whatever the user picked as `seedExercises` — the compiler only fills gaps.
- Both modes render through the same "here's your session, here's why" UI, so results are always internally consistent and the user never gets a worse experience for having picked their own exercises.

**Compiler algorithm, roughly:**

1. Look up the muscle-volume targets for `splitDay` from a small target table (e.g. push day → chest: 3-4 sets, front-delts: 2-3, triceps: 2-3). This is your existing `smartSetCount`/volume logic's input, not a new invention.
2. Credit `seedExercises` against those targets (`involvement`-weighted, so a secondary-muscle hit counts partially).
3. For each muscle still under target, filter `db` by `equipmentAvailable` and `splitTags`, rank compounds before isolation, and greedily add exercises — checking each addition against a running time budget (`fatigueCost`/estimated sets × rest time per set, using your existing rest-time function in `smartAlgorithms.getRecommendedRest`) so the session fits `durationMinutes`.
4. Stop when either targets are met or time budget is exhausted; if time runs out before targets are met, flag which muscle groups came up short rather than silently under-programming — this is a good spot for the "coach" framing from #11 ("Push day is set — biceps only got secondary work today, that's expected on a push day").

This reuses `smartSetCount`, `getRecommendedRest`, and your progression tier logic as-is; the new work is the target table, the greedy fill loop, and the time-budget check.

---

## 4. Live alternative-exercise swap (#6)

You already have 80% of this: `suggestSubstitutes()` in `smartAlgorithms.ts` and a read-only `ExerciseSubstitutions.tsx` card. What's missing is turning it into an actual *replace* action with a scope choice, inside `ActiveWorkout.tsx`:

- Add a "Swap" affordance on the active exercise card (next to the existing reorder/skip controls — `exerciseQueue`/`handleDoLater`/`handleSkipEntirely` already live there, so this is one more sheet action, not new plumbing).
- Tapping it opens a short list (3-5) from `suggestSubstitutes`, filtered to equipment the user marks as unavailable right now — you'll want a lightweight "what's free right now" toggle rather than re-running the full onboarding equipment picker mid-workout.
- On selection, present exactly the two scopes you described:
  - **"Just this session"** — replace in the in-memory/active session state only; `workout_plans` definition is untouched, next rotation of this day still shows the original exercise.
  - **"Update my workout plan"** — persist the swap into the stored `workout_plans.exercises` JSONB for that day going forward.
- Precomputing `substitutionGroupId` at DB-build time (§2) means this list is instant and stable instead of recomputed with runtime heuristics every time — also makes it trivially testable.

---

## 5. Progression suggestion engine — diagnosis before rebuild (#7)

Don't rewrite this one blind. From what's in the repo, the most likely culprit is exactly what `analysis_and_plan.md` already flagged: `computeAllSuggestions` keys history by `exerciseId` (via `buildHistoryKey`/`stripEquipmentSuffix`/`extractEquipmentType`), and if the equipment-aware composite key (`exerciseId::equipmentType`) migration described in that doc wasn't fully completed end-to-end (DB column, plan JSONB, and the lookup itself), you'd see exactly the symptom of "suggestions feel off" — e.g. barbell and dumbbell bench history blending together, or a suggestion computed against the wrong tier's rep range.

Before touching the algorithm itself:

1. Confirm whether `workout_sets.equipment_type` exists in production and is actually populated for recent sets.
2. Add a debug view (even a temporary one) that shows, for any given suggestion, which historical sets it pulled and what key it used — this both diagnoses the current bug and becomes the "why this weight/reps" transparency piece your #11 goal wants anyway.
3. Write a handful of fixed input→expected-output regression tests against `computeSuggestion`/`computeAllSuggestions` using real exercise histories pulled from your own account, so future changes here can't silently regress again.

Only after that diagnosis is it worth deciding whether this is a data-migration gap (likely) or a genuine algorithm bug.

---

## 6. "Science-based coach" UX principles (#11)

A few concrete things that tend to separate "clean UI" from "feels like it's coaching you":

- **Show reasoning, not just numbers.** The insight surfaced in §5 above ("suggested +2.5kg because your last 3 sets averaged 9 reps at RPE 7") is the difference between a tracker and a coach.
- **Progressive disclosure.** Default view is simple (today's session, today's numbers); tapping in reveals the "why."
- **Honest gaps.** When the generator can't fully hit a muscle target in the time available (§3), say so instead of quietly shipping an under-programmed session — this builds trust in every other number the app shows.
- **Onboarding as calibration, not a form.** Frame the equipment/split/days/duration questions as "so I can build you a real plan," not a settings page.

---

## 7. Suggested phasing

| Phase | Focus |
|---|---|
| 0 | `v2` branch, new Supabase project, staging deploy on Vercel |
| 1 | Exercise DB v2 schema, local rebuild, ported integrity checker |
| 2 | Session compiler — template mode only (simpler, no seed-merging yet) |
| 3 | Build-my-own mode on top of the same compiler |
| 4 | Live swap UX (session-only / plan-wide) in `ActiveWorkout` |
| 5 | Progression engine diagnosis + fix, add reasoning/debug view |
| 6 | Push exercise DB into Supabase, connect app to v2 project |
| 7 | Closed beta on staging domain, then cutover plan from v1 |

Each phase is independently shippable to the staging branch, so you're never sitting on a half-finished rewrite.

---

**Decision: fixed curated library, no user-added exercises (for now).** This simplifies §2 in a couple of concrete ways:

- `movementId` and `substitutionGroupId` can both be assigned entirely at DB-build time — no runtime validation path, no UI for a user to pick/confirm a movement group or muscle involvement when adding a custom exercise.
- The integrity checker (ported from `exerciseIntegrityCheck.ts`) only needs to run at build time / CI, not defensively at runtime against unknown data shapes.
- Keeps the door open for custom exercises later — the schema doesn't preclude it, it's just not a Phase 1-7 concern. If you add it down the line, the main addition is a lightweight "which existing movement is this closest to" step in the add-exercise flow, since everything downstream (compiler, swap suggestions, progression tiering) leans on `movementId` and `substitutionGroupId` being populated.
