import type { DataIssue, EvaluatedMatch, Team, TeamStanding } from '../types/tournament';
import { calculatePoints } from './pointsCalculator';

export type SortKey = 'points' | 'won' | 'ballsLost';
export type SortDirection = 'asc' | 'desc';

/**
 * Builds the standings from evaluated matches. Every team in the workbook appears,
 * including teams with zero points or no matches.
 *
 * Official order (fallback — the workbook does not define a tie-break rule):
 *   1. total points (desc)  2. matches won (desc)  3. balls lost (asc)  4. team number (asc)
 */
export function buildStandings(teams: Team[], evaluated: EvaluatedMatch[]): TeamStanding[] {
  const byId = new Map<string, TeamStanding>(
    teams.map((team) => [
      team.id,
      { team, rank: 0, played: 0, won: 0, lost: 0, ballsLost: 0, points: 0, breakdown: [], form: [] },
    ]),
  );

  const awards = calculatePoints(evaluated).sort((a, b) => a.order - b.order);
  for (const award of awards) {
    const winner = byId.get(award.winnerId);
    const loser = byId.get(award.loserId);
    if (!winner || !loser) continue;
    winner.played += 1;
    winner.won += 1;
    winner.points += award.points;
    winner.breakdown.push(award);
    winner.form.push('W');
    loser.played += 1;
    loser.lost += 1;
    loser.ballsLost += award.ballsLost;
    loser.form.push('L');
  }

  const ordered = [...byId.values()].sort(compareOfficial);
  ordered.forEach((s, i) => (s.rank = i + 1));
  return ordered;
}

export function compareOfficial(a: TeamStanding, b: TeamStanding): number {
  return (
    b.points - a.points ||
    b.won - a.won ||
    a.ballsLost - b.ballsLost ||
    compareTeamNumbers(a.team, b.team)
  );
}

/** Re-orders standings for display; ties fall back to the official rank so order stays deterministic. */
export function sortStandings(
  standings: TeamStanding[],
  key: SortKey,
  direction: SortDirection,
): TeamStanding[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...standings].sort((a, b) => sign * (a[key] - b[key]) || a.rank - b.rank);
}

/** Matches team number ("7", "#07", "team 7"), team name or any member name. */
export function filterStandings(standings: TeamStanding[], query: string): TeamStanding[] {
  const q = query.trim().toLowerCase();
  if (!q) return standings;
  // Numeric queries match the team number exactly, so "1" finds Team #01 but not Team #12.
  const numberQuery = q.replace(/^(team\s*)?#?\s*/, '').replace(/^0+(?=\d)/, '');
  const isNumberQuery = /^\d+$/.test(numberQuery);
  return standings.filter(({ team }) => {
    const number = team.number?.replace(/^0+(?=\d)/, '').toLowerCase();
    if (isNumberQuery && number === numberQuery) return true;
    if (!isNumberQuery && team.number?.toLowerCase().includes(q)) return true;
    if (team.name?.toLowerCase().includes(q)) return true;
    return team.members.some((p) => p.name.toLowerCase().includes(q));
  });
}

/**
 * If the workbook carries its own points totals, report teams where they disagree with the
 * calculated value. The calculated value is always the one displayed — workbook totals are never added.
 */
export function crossCheckReportedPoints(standings: TeamStanding[]): DataIssue[] {
  return standings
    .filter((s) => s.team.reportedPoints !== null && s.team.reportedPoints !== s.points)
    .map((s) => ({
      severity: 'warning' as const,
      message: `${teamLabel(s.team)}: workbook shows ${s.team.reportedPoints} points, calculated from match results: ${s.points}.`,
      source: s.team.source ?? undefined,
    }));
}

export function teamLabel(team: Pick<Team, 'number' | 'name'>): string {
  if (team.number) return `Team #${team.number}`;
  return team.name ?? 'Unknown team';
}

function compareTeamNumbers(a: Team, b: Team): number {
  const key = (t: Team) => t.number ?? t.name ?? t.id;
  return key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: 'base' });
}
