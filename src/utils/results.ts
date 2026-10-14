import type { EvaluatedMatch, KnockoutMatch, KnockoutRound } from '../types/tournament';
import { matchHeading } from './format';
import { ROUND_NAMES } from './knockout';

/** A completed match from either stage, in the shape the result cards and team details render. */
export interface ResultItem {
  key: string;
  id: string;
  heading: string;
  stage: 'group' | KnockoutRound;
  winnerId: string;
  loserId: string;
  /** Balls the loser had left; null when the knockout sheet did not record it. */
  ballsLost: number | null;
  points: number;
  /** Rack score for knockout matches, e.g. "2–1". */
  racks: string | null;
  date: Date | null;
  /** Chronological position; knockout matches come after every group match. */
  order: number;
}

/** A match still to be played, from either stage. */
export interface UpcomingItem {
  key: string;
  heading: string;
  teamAId: string | null;
  teamBId: string | null;
  teamARaw: string;
  teamBRaw: string;
  status: string;
  order: number;
}

const KNOCKOUT_OFFSET = 1_000_000;

export function groupResult(m: EvaluatedMatch): ResultItem | null {
  if (m.state !== 'counted' || !m.winner || !m.loser) return null;
  return {
    key: `${m.id}-${m.source.row}`,
    id: m.id,
    heading: matchHeading(m),
    stage: 'group',
    winnerId: m.winner,
    loserId: m.loser,
    ballsLost: m.ballsLost,
    points: m.points,
    racks: null,
    date: m.date,
    order: m.order,
  };
}

export function knockoutResult(k: KnockoutMatch): ResultItem | null {
  if (k.state !== 'played' || !k.winner || !k.teamA || !k.teamB) return null;
  const loserId = k.winner === k.teamA ? k.teamB : k.teamA;
  const winnerRacks = k.winner === k.teamA ? k.racksA : k.racksB;
  const loserRacks = k.winner === k.teamA ? k.racksB : k.racksA;
  return {
    key: `${k.id}-${k.source.row}`,
    id: k.id,
    heading: `${k.id} · ${ROUND_NAMES[k.round]}`,
    stage: k.round,
    winnerId: k.winner,
    loserId,
    ballsLost: k.ballsLost,
    points: k.points,
    racks: winnerRacks !== null && loserRacks !== null ? `${winnerRacks}–${loserRacks}` : null,
    date: null,
    order: KNOCKOUT_OFFSET + k.order,
  };
}

/** All completed matches, most recent first (knockout after group, then by date/order). */
export function allResults(matches: EvaluatedMatch[], knockout: KnockoutMatch[]): ResultItem[] {
  const items = [
    ...matches.map(groupResult).filter((r): r is ResultItem => r !== null),
    ...knockout.map(knockoutResult).filter((r): r is ResultItem => r !== null),
  ];
  return items.sort((a, b) => {
    if (a.date && b.date && a.date.getTime() !== b.date.getTime()) return b.date.getTime() - a.date.getTime();
    return b.order - a.order;
  });
}

/** Matches still to be played, in schedule order (group first, then QF → SF → Final). */
export function upcomingMatches(matches: EvaluatedMatch[], knockout: KnockoutMatch[]): UpcomingItem[] {
  const group: UpcomingItem[] = matches
    .filter((m) => m.state === 'pending')
    .map((m) => ({
      key: `${m.id}-${m.source.row}`,
      heading: matchHeading(m) || 'Scheduled',
      teamAId: m.teamA,
      teamBId: m.teamB,
      teamARaw: m.teamARaw,
      teamBRaw: m.teamBRaw,
      status: m.statusRaw || 'To play',
      order: m.order,
    }));
  const ko: UpcomingItem[] = knockout
    .filter((k) => k.state === 'pending' || k.state === 'awaiting')
    .map((k) => ({
      key: `${k.id}-${k.source.row}`,
      heading: `${k.id} · ${ROUND_NAMES[k.round]}`,
      teamAId: k.teamA,
      teamBId: k.teamB,
      teamARaw: k.teamARaw,
      teamBRaw: k.teamBRaw,
      status: k.state === 'awaiting' ? 'Awaiting qualifiers' : k.statusRaw || 'To play',
      order: KNOCKOUT_OFFSET + k.order,
    }));
  return [...group, ...ko].sort((a, b) => a.order - b.order);
}
