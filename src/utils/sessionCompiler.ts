// ─── Session Compiler ───────────────────────────────────────────────────────
// The one function both "build my own" and "choose a template" route through
// (see atlas-v2-build-plan.md §3). Template mode calls it with an empty
// `seedExercises`; build-your-own calls it with the user's picks and it
// fills the remaining gaps. Same coherence guarantee either way.
//
// Time-budget constant (2.75 min/set = ~45s work + ~90s rest) is carried
// over from `smartSetCount.ts`'s `newUserSetCount` rather than reinvented —
// keep these in sync if one changes.
//
// KNOWN SIMPLIFICATION (v1 of this compiler): set counts are assigned by
// tier (primary/secondary/accessory) rather than by calling the real
// `smartSetCount`/`computeAllSuggestions` engine, because those need a
// user's actual history + suggestion map, which this standalone function
// doesn't have. Once this is wired into the app, swap
// `defaultSetsForTier(exercise.tier)` below for a real call to
// `smartSetCount(exercise.id, exercise.name, suggestions, history, profile, exercisesInDay)`
// — the rest of the compiler (muscle-target crediting, greedy fill,
// coverage/warnings) doesn't need to change.

import type { Exercise, Muscle, SplitTag, EquipmentItem } from '../data/v2/types';
import { splitMuscleTargets } from '../data/v2/muscleTargets';

const MINUTES_PER_SET = 2.75; // see smartSetCount.ts — keep in sync

const TIER_DEFAULT_SETS: Record<Exercise['tier'], number> = {
  primary: 4,
  secondary: 3,
  accessory: 2,
};

function defaultSetsForTier(tier: Exercise['tier']): number {
  return TIER_DEFAULT_SETS[tier];
}

export interface SessionSpec {
  splitDay: SplitTag;
  equipmentAvailable: EquipmentItem[];
  /** Working time only — warmup is handled separately upstream. */
  durationMinutes: number;
  /** User-picked exercises. Empty array = pure template mode. */
  seedExercises: Exercise[];
}

export interface CompiledExercise {
  exercise: Exercise;
  sets: number;
  /** Why the compiler picked this one — surfaced in the UI per the
   *  "show reasoning, not just numbers" coaching principle (build plan §6). */
  reason: string;
  fromSeed: boolean;
}

export interface MuscleCoverage {
  muscle: Muscle;
  target: number;
  achieved: number;
}

export interface CompiledSession {
  splitDay: SplitTag;
  exercises: CompiledExercise[];
  coverage: MuscleCoverage[];
  estimatedMinutes: number;
  /** Muscle groups that came up short of target — surface honestly rather
   *  than silently under-programming (build plan §3, §6). */
  warnings: string[];
}

function equipmentSatisfied(needed: EquipmentItem[], available: EquipmentItem[]): boolean {
  return needed.every((item) => item === 'none' || available.includes(item));
}

/** Weighted "how much does this exercise close the remaining gap" score.
 *  Primary-role involvement counts fully; secondary-role involvement counts
 *  partially, same intent as the involvement weighting in MuscleInvolvement
 *  itself — a secondary hit is real but shouldn't crowd out a better-fit
 *  primary exercise for the same slot. */
function scoreCandidate(exercise: Exercise, remaining: Map<Muscle, number>): number {
  let score = 0;
  for (const m of exercise.muscles) {
    const need = remaining.get(m.muscle) ?? 0;
    if (need <= 0) continue;
    const roleWeight = m.role === 'primary' ? 1.0 : 0.6;
    score += Math.min(need, m.involvement * defaultSetsForTier(exercise.tier)) * roleWeight;
  }
  // Mild preference for compounds — they close more of the target board per
  // exercise slot, which matters when slots are the scarce resource.
  if (exercise.mechanic === 'compound') score *= 1.15;
  return score;
}

export function compileSession(spec: SessionSpec, db: Exercise[]): CompiledSession {
  const { splitDay, equipmentAvailable, durationMinutes, seedExercises } = spec;

  const targets = splitMuscleTargets[splitDay] ?? {};
  const remaining = new Map<Muscle, number>(
    Object.entries(targets).map(([m, v]) => [m as Muscle, v as number])
  );
  const targetTotals = new Map(remaining); // keep an untouched copy for the coverage report

  const compiled: CompiledExercise[] = [];
  const usedMovementIds = new Set<string>();
  const usedSubstitutionGroups = new Set<string>();
  let minutesUsed = 0;

  // ── Credit seed exercises first ──────────────────────────────────────────
  for (const exercise of seedExercises) {
    const sets = defaultSetsForTier(exercise.tier);
    compiled.push({
      exercise,
      sets,
      reason: 'Your pick.',
      fromSeed: true,
    });
    usedMovementIds.add(exercise.movementId);
    usedSubstitutionGroups.add(exercise.substitutionGroupId);
    minutesUsed += sets * MINUTES_PER_SET;

    for (const m of exercise.muscles) {
      const roleWeight = m.role === 'primary' ? 1.0 : 0.6;
      const credit = sets * m.involvement * roleWeight;
      remaining.set(m.muscle, (remaining.get(m.muscle) ?? 0) - credit);
    }
  }

  // ── Greedy fill for whatever's left ──────────────────────────────────────
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const stillNeeded = [...remaining.values()].some((v) => v > 0.01);
    if (!stillNeeded) break;

    const eligible = db.filter(
      (ex) =>
        ex.splitTags.includes(splitDay) &&
        !usedMovementIds.has(ex.movementId) &&
        equipmentSatisfied(ex.equipmentNeeded, equipmentAvailable)
    );
    if (eligible.length === 0) break; // nothing left that fits equipment/split

    // Prefer exercises from a substitution group not already used this
    // session — avoids back-to-back near-duplicate movements (e.g. two
    // overhead-press variants). Fall back to reuse only if that's the only
    // way left to close a remaining gap, so variety never costs coverage.
    const fresh = eligible.filter((ex) => !usedSubstitutionGroups.has(ex.substitutionGroupId));
    const candidates = fresh.length > 0 ? fresh : eligible;

    let best: Exercise | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      const s = scoreCandidate(c, remaining);
      if (s > bestScore) {
        best = c;
        bestScore = s;
      }
    }
    if (!best || bestScore <= 0) break; // remaining gaps can't be closed with available equipment

    const sets = defaultSetsForTier(best.tier);
    const projectedMinutes = minutesUsed + sets * MINUTES_PER_SET;
    if (projectedMinutes > durationMinutes && compiled.length > 0) break; // time budget exhausted

    const primaryMuscle = best.muscles.find((m) => m.role === 'primary')?.muscle ?? best.muscles[0]?.muscle;
    compiled.push({
      exercise: best,
      sets,
      reason: primaryMuscle
        ? `Fills remaining ${primaryMuscle.replace('-', ' ')} volume for ${splitDay} day.`
        : `Rounds out ${splitDay} day coverage.`,
      fromSeed: false,
    });
    usedMovementIds.add(best.movementId);
    usedSubstitutionGroups.add(best.substitutionGroupId);
    minutesUsed = projectedMinutes;

    for (const m of best.muscles) {
      const roleWeight = m.role === 'primary' ? 1.0 : 0.6;
      const credit = sets * m.involvement * roleWeight;
      remaining.set(m.muscle, (remaining.get(m.muscle) ?? 0) - credit);
    }
  }

  // ── Coverage report + honest shortfall warnings ──────────────────────────
  const coverage: MuscleCoverage[] = [...targetTotals.entries()].map(([muscle, target]) => ({
    muscle,
    target,
    achieved: Math.max(0, target - (remaining.get(muscle) ?? 0)),
  }));

  const warnings: string[] = [];
  for (const c of coverage) {
    if (c.achieved < c.target - 0.5) {
      warnings.push(
        `${c.muscle.replace('-', ' ')}: ${c.achieved.toFixed(1)}/${c.target} target sets — ` +
          (minutesUsed >= durationMinutes
            ? 'ran out of session time before this was fully covered.'
            : 'no available exercise with your current equipment closes the rest of this gap.')
      );
    }
  }

  return {
    splitDay,
    exercises: compiled,
    coverage,
    estimatedMinutes: Math.round(minutesUsed),
    warnings,
  };
}
