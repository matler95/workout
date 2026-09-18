# V2 Setup Checklist — Phases 6 & 7

Everything up to here (schema, seed data, session compiler, swap UX,
progression fix) is code I could write and verify directly. These two
phases need actions on your Supabase/Vercel/GitHub accounts that I don't
have credentials for — this is the exact list of what to do, in order.

## Phase 6 — Supabase

1. **Create a new Supabase project** for v2 (dashboard → New Project).
   Separate from production, per the build plan's branching section —
   this lets the schema evolve freely without any risk to live user data.
   Note the project URL and both the anon key and service-role key.

2. **Run the schema migration.** Open the new project's SQL Editor → New
   query → paste the contents of `data_migration/migration_v2_exercise_schema.sql`
   → Run. This creates the five tables (`exercises`, `muscles`,
   `exercise_muscles`, `exercise_equipment`, `exercise_split_tags`), their
   indexes, read-only RLS policies, and seeds the muscle vocabulary.

3. **Seed the exercise data.** From the repo root, on the `v2` branch:
   ```
   SUPABASE_URL=https://xxxx.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
   npx tsx data_migration/seedExercisesV2.ts
   ```
   Pull both values from the new project's Settings → API. This pushes
   all 77 exercises + their muscle/equipment/split-tag relationships. It's
   idempotent — re-run any time after editing `src/data/v2/exercises.ts`
   to push updates, and it runs the integrity checker first so it refuses
   to push known-bad data.

4. **Add the v2 project's credentials as env vars** — see Phase 7 below,
   these get set on the v2 Vercel deployment, not your local `.env.local`
   for the production app (keep those separate so you can't accidentally
   point your day-to-day dev environment at the wrong database).

## Phase 7 — Staging deployment

Two ways to get a stable, shareable staging URL tracking the `v2` branch
(pick one — the first is simpler, the second is cleaner if you want fully
independent deploy settings):

**Option A — Branch domain on the existing Vercel project.**
Project Settings → Domains → add a domain (e.g. `beta.yourapp.com` or use
a Vercel-provided one) → assign it to track the `v2` git branch instead of
`main`. Then Settings → Environment Variables → add the v2 Supabase URL/
anon key scoped to "Preview" environment (or specifically to the `v2`
branch, if your Vercel plan supports branch-scoped env vars) so it doesn't
touch the Production env vars used by `main`.

**Option B — A second Vercel project, same repo.**
Import the same GitHub repo again as a new Vercel project, set its
Production Branch to `v2` in Project Settings → Git, and give it its own
domain and its own full set of env vars (cleanest separation, no risk of
an env var scope mistake leaking the v2 Supabase credentials into the
production deployment).

Either way, `vercel.json` doesn't need changes — the existing
`buildCommand`/`outputDirectory`/rewrites apply the same to both branches.

## Cutover checklist (when v2 is ready to replace v1 for real users)

Not urgent yet, but writing it down now while the reasoning's fresh:

- [ ] Decide the migration path for **existing users' workout history** —
      v1 exercise ids don't match v2 exercise ids, so old `workout_sets`
      rows need either an id-mapping table (v1 id → v2 id) or an
      acknowledged "history resets" tradeoff. This wasn't part of the
      original 11-point brief — worth deciding explicitly before cutover,
      not during it.
- [ ] Point `main`'s Supabase env vars at the v2 project (or migrate v2's
      schema into the production project at this point, now that it's
      proven out on staging).
- [ ] Merge `v2` → `main`.
- [ ] Keep the v2 Supabase project around for a rollback window before
      decommissioning it.
