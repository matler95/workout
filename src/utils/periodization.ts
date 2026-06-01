/**
 * Smart Periodization Selection
 *
 * Selects the best periodization model (linear/undulating/block) based on:
 * - Training goal (strength/hypertrophy/general)
 * - Experience level (beginner/intermediate/advanced)
 * - Training frequency (days per week)
 * - Recovery capacity (inferred from experience + stress level)
 *
 * Return value includes rep ranges and set modifiers per phase.
 */

export type PeriodizationType = 'linear' | 'undulating' | 'block';

export interface PeriodizationPhase {
  name: string;
  weeks: number;
  repRange: [number, number];
  intensity: string; // % 1RM
  rir: number; // reps in reserve
  volumeModifier: number; // 1.0 = baseline, 0.5 = deload
}

export interface PeriodizationModel {
  type: PeriodizationType;
  phases: PeriodizationPhase[];
  totalWeeks: number;
  description: string;
}

// ─── Periodization Definitions ────────────────────────────────────────────────

const LINEAR_PERIODIZATION: PeriodizationModel = {
  type: 'linear',
  phases: [
    {
      name: 'Accumulation (Hypertrophy)',
      weeks: 3,
      repRange: [8, 12],
      intensity: '60-70% 1RM',
      rir: 2,
      volumeModifier: 1.0,
    },
    {
      name: 'Intensification (Strength)',
      weeks: 3,
      repRange: [4, 6],
      intensity: '75-85% 1RM',
      rir: 1,
      volumeModifier: 0.9,
    },
    {
      name: 'Realization (Peaking)',
      weeks: 2,
      repRange: [2, 4],
      intensity: '85-95% 1RM',
      rir: 0,
      volumeModifier: 0.75,
    },
    {
      name: 'Deload',
      weeks: 1,
      repRange: [10, 15],
      intensity: '50-60% 1RM',
      rir: 3,
      volumeModifier: 0.5,
    },
  ],
  totalWeeks: 9,
  description: 'Sequential phases emphasizing one quality at a time. Best for strength goals and beginners.',
};

const UNDULATING_PERIODIZATION: PeriodizationModel = {
  type: 'undulating',
  phases: [
    {
      name: 'Hypertrophy Day',
      weeks: 1,
      repRange: [10, 12],
      intensity: '65-75% 1RM',
      rir: 2,
      volumeModifier: 1.0,
    },
    {
      name: 'Strength Day',
      weeks: 1,
      repRange: [6, 8],
      intensity: '75-85% 1RM',
      rir: 1,
      volumeModifier: 1.0,
    },
    {
      name: 'Power/Endurance Day',
      weeks: 1,
      repRange: [12, 15],
      intensity: '60-70% 1RM',
      rir: 2,
      volumeModifier: 1.0,
    },
    {
      name: 'Deload Week',
      weeks: 1,
      repRange: [10, 15],
      intensity: '50-60% 1RM',
      rir: 3,
      volumeModifier: 0.5,
    },
  ],
  totalWeeks: 4,
  description: 'Varies rep ranges within each week (daily undulation). Best for intermediate lifters seeking muscle + strength.',
};

const BLOCK_PERIODIZATION: PeriodizationModel = {
  type: 'block',
  phases: [
    {
      name: 'Hypertrophy Block',
      weeks: 4,
      repRange: [8, 12],
      intensity: '65-75% 1RM',
      rir: 2,
      volumeModifier: 1.0,
    },
    {
      name: 'Strength Block',
      weeks: 4,
      repRange: [4, 6],
      intensity: '80-90% 1RM',
      rir: 1,
      volumeModifier: 0.9,
    },
    {
      name: 'Peaking Block',
      weeks: 2,
      repRange: [1, 3],
      intensity: '90-95% 1RM',
      rir: 0,
      volumeModifier: 0.7,
    },
    {
      name: 'Deload',
      weeks: 1,
      repRange: [10, 15],
      intensity: '50-60% 1RM',
      rir: 3,
      volumeModifier: 0.5,
    },
  ],
  totalWeeks: 11,
  description: 'Entire mesocycles dedicated to one training quality. Best for advanced lifters pursuing strength or competition prep.',
};

// ─── Selection Logic ──────────────────────────────────────────────────────────

export function selectPeriodization(
  goal: string,
  experienceLevel: string,
  trainingDays: number,
  stressLevel?: number,
): PeriodizationModel {
  // Default stress level to moderate if not provided
  const stress = stressLevel ?? 3;
  const highStress = stress >= 4;

  // ── Strength goal → prioritize linear or block ──────────────────────────────
  if (goal === 'increase_strength') {
    if (experienceLevel === 'advanced' && trainingDays >= 4) {
      return BLOCK_PERIODIZATION;
    }
    return LINEAR_PERIODIZATION;
  }

  // ── Muscle building → prioritize undulating if good recovery ─────────────────
  if (goal === 'build_muscle') {
    if (highStress || trainingDays < 3) {
      // High stress or low frequency → simpler linear is safer
      return LINEAR_PERIODIZATION;
    }
    if (trainingDays >= 3) {
      return UNDULATING_PERIODIZATION;
    }
    return LINEAR_PERIODIZATION;
  }

  // ── Fat loss → balance recovery with frequency ──────────────────────────────
  if (goal === 'lose_fat') {
    if (trainingDays >= 4 && !highStress) {
      return UNDULATING_PERIODIZATION;
    }
    return LINEAR_PERIODIZATION;
  }

  // ── Athletic performance → block for advanced, linear for others ────────────
  if (goal === 'athletic_performance') {
    if (experienceLevel === 'advanced' && trainingDays >= 4) {
      return BLOCK_PERIODIZATION;
    }
    return LINEAR_PERIODIZATION;
  }

  // ── General fitness → undulating for balance ───────────────────────────────
  if (goal === 'general_fitness') {
    if (trainingDays >= 3 && !highStress) {
      return UNDULATING_PERIODIZATION;
    }
    return LINEAR_PERIODIZATION;
  }

  // ── Default ───────────────────────────────────────────────────────────────
  return LINEAR_PERIODIZATION;
}

// ─── Helper: get current phase rep range ────────────────────────────────────

export function getCurrentPhaseRepRange(
  model: PeriodizationModel,
  weekNumber: number,
): [number, number] {
  let cumulativeWeeks = 0;
  for (const phase of model.phases) {
    cumulativeWeeks += phase.weeks;
    if (weekNumber <= cumulativeWeeks) {
      return phase.repRange;
    }
  }
  // Cycle back to beginning
  return model.phases[0].repRange;
}

// ─── Helper: get current phase volume modifier ──────────────────────────────

export function getCurrentPhaseVolumeModifier(
  model: PeriodizationModel,
  weekNumber: number,
): number {
  let cumulativeWeeks = 0;
  for (const phase of model.phases) {
    cumulativeWeeks += phase.weeks;
    if (weekNumber <= cumulativeWeeks) {
      return phase.volumeModifier;
    }
  }
  // Cycle back to beginning
  return model.phases[0].volumeModifier;
}
