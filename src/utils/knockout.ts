import type { KnockoutRound } from '../types/tournament';

export const ROUND_LABELS: Record<KnockoutRound, string> = { QF: 'Quarter finals', SF: 'Semi finals', F: 'Finals' };

/** Tab order of the knockout rounds on the dashboard. */
export const KNOCKOUT_ROUNDS: KnockoutRound[] = ['QF', 'SF', 'F'];
