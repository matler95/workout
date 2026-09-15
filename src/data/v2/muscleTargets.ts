import type { Muscle, SplitTag } from './types';

/** Target working sets per muscle for a single session of this split type.
 *  Deliberately modest defaults (mid-range hypertrophy volume) — these are
 *  a starting point, not a prescription locked to any one goal. Once the
 *  onboarding profile carries a goal (strength/hypertrophy/fat-loss) the
 *  same way `smartSetCount`'s `NewUserProfile` does, scale these targets
 *  from here rather than forking the table. */
export const splitMuscleTargets: Record<SplitTag, Partial<Record<Muscle, number>>> = {
  push: {
    chest: 4,
    'front-delts': 3,
    'side-delts': 3,
    triceps: 3,
  },
  pull: {
    lats: 4,
    rhomboids: 3,
    'rear-delts': 2,
    biceps: 3,
    traps: 2,
    forearms: 1,
  },
  legs: {
    quads: 4,
    hamstrings: 3,
    glutes: 3,
    calves: 2,
    adductors: 1,
    abductors: 1,
  },
  upper: {
    chest: 3,
    lats: 3,
    rhomboids: 2,
    'front-delts': 2,
    'side-delts': 2,
    'rear-delts': 2,
    biceps: 2,
    triceps: 2,
  },
  lower: {
    quads: 3,
    hamstrings: 3,
    glutes: 3,
    calves: 2,
  },
  full_body: {
    chest: 2,
    lats: 2,
    quads: 3,
    hamstrings: 2,
    glutes: 2,
    'front-delts': 1,
    biceps: 1,
    triceps: 1,
    abdominals: 2,
  },
  abs: {
    abdominals: 3,
    obliques: 2,
  },
};
