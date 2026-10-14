import type { KnockoutMatch, KnockoutRound, PointAward } from '../types/tournament';

export const ROUND_LABELS: Record<KnockoutRound, string> = { QF: 'Quarter finals', SF: 'Semi finals', F: 'Finals' };
export const ROUND_NAMES: Record<KnockoutRound, string> = { QF: 'Quarter final', SF: 'Semi final', F: 'Final' };

/** Tab order of the knockout rounds on the dashboard. */
export const KNOCKOUT_ROUNDS: KnockoutRound[] = ['QF', 'SF', 'F'];

/**
 * Knockout wins with a recorded ball count award points like group wins, so the overall
 * leaderboard shows group points + knockout points. Matches without a ball count award nothing.
 * Ordered after all group matches so the breakdown lists them last.
 */
export function knockoutAwards(matches: KnockoutMatch[]): PointAward[] {
  return matches
    .filter((m) => m.state === 'played' && m.winner && m.teamA && m.teamB && m.ballsLost !== null)
    .map((m) => ({
      matchId: m.id,
      hasWorkbookId: true,
      round: ROUND_NAMES[m.round],
      date: null,
      order: 1_000_000 + m.order,
      winnerId: m.winner as string,
      loserId: (m.winner === m.teamA ? m.teamB : m.teamA) as string,
      ballsLost: m.ballsLost as number,
      points: m.points,
    }));
}
