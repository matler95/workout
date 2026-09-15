# Exercise DB v2

Greenfield rebuild per `atlas-v2-build-plan.md`. Fixed curated library — see
the "Decision" section of the plan for what that does and doesn't rule out.

## Files

- `types.ts` — the `Exercise` shape and its controlled-vocabulary unions
  (`Muscle`, `EquipmentItem`, `EquipmentType`, `SplitTag`, `Tier`). Add new
  values to the unions here first; everything else follows.
- `muscles.ts` — canonical muscle list with display names + body region.
- `equipment.ts` — canonical equipment list, plus `equipmentGroups`, which
  maps the coarse onboarding question ("machines / dumbbells / barbell /
  calisthenics") to the granular `EquipmentItem[]` each group unlocks.
- `exercises.ts` — the seed database. ~50 exercises covering every
  `splitTag` and `equipmentType`, enough to exercise the session compiler
  end to end. **Not the full library** — extend by movement group, following
  the existing pattern (one record per equipment variant, sharing a
  `movementId`).
- `integrityCheck.ts` — run with `npx tsx src/data/v2/integrityCheck.ts`
  before every commit that touches `exercises.ts`. Currently flags:
  - duplicate ids
  - exercises with zero primary muscles
  - muscle refs outside the controlled vocabulary
  - involvement values outside 0-1
  - `defaultRepRange` with min > max
  - empty `equipmentNeeded` or `splitTags`
  - substitution groups with only one member (not a hard error — just means
    the swap feature has nothing to offer for that exercise yet)

Running it against the current seed set flags 5 single-member substitution
groups (dip, shrug, leg curl, leg extension, hip thrust) — expected at this
size, worth closing as the library grows so swap suggestions (#6) have
something to offer for every exercise.

## Note on `defaultRepRange` for time-based exercises

`plank-bodyweight` reuses `defaultRepRange` for a hold duration in seconds
(`[30, 60]`) rather than reps. This works today because nothing reads the
field's unit assumption yet, but it's a rough edge: before the session
compiler or progression engine touch static-hold exercises, either add an
explicit `unit: 'reps' | 'seconds'` field to `Exercise` or keep a short
hardcoded list of time-based `movementId`s the compiler treats differently.
Flagging now so it doesn't get baked in silently.

## Extending the library

1. Pick (or create) a `movementId`.
2. Add one `Exercise` record per equipment variant that exists in your gym
   context, sharing that `movementId`.
3. Assign `substitutionGroupId` to match any other exercise that hits the
   same primary muscle with a similar `mechanic` — this is what powers the
   in-workout swap list, so don't leave it as a singleton group if a
   reasonable substitute exists elsewhere in the file.
4. Run the integrity checker.

## Not built yet (next phases per the build plan)

- Session compiler (`compileSession`) — Phase 2/3.
- Supabase table migration — Phase 6, once this local set is stable.
- Full library breadth — this seed set is intentionally push/pull/legs/abs
  coverage, not exhaustive.
