import type { DataIssue, EvaluatedMatch, TeamStanding, TournamentData } from '../types/tournament';
import { evaluateMatches } from '../utils/pointsCalculator';
import { buildStandings, crossCheckReportedPoints } from '../utils/leaderboard';
import type { WorkbookSource } from './workbookSource';

/** Everything the dashboard renders, derived from one version of the workbook. */
export interface TournamentSnapshot {
  data: TournamentData;
  matches: EvaluatedMatch[];
  standings: TeamStanding[];
  /** Workbook-level problems (flagged matches carry their own reasons in `matches`). */
  issues: DataIssue[];
  version: string;
  /** When the source data was last modified, if known. */
  lastModified: Date | null;
}

export async function loadTournament(
  source: WorkbookSource,
  previousVersion: string | null,
): Promise<TournamentSnapshot | 'unchanged'> {
  const payload = await source.fetchWorkbook(previousVersion);
  if (payload === 'unchanged') return 'unchanged';
  if ('dataset' in payload) return buildSnapshot(payload.dataset, payload.version, payload.lastModified);
  // Loaded on demand: the spreadsheet library is large and not needed for the first paint.
  const { parseWorkbookFiles } = await import('./excelParser');
  return buildSnapshot(parseWorkbookFiles(payload.files), payload.version, payload.lastModified);
}

export function buildSnapshot(data: TournamentData, version: string, lastModified: Date | null = null): TournamentSnapshot {
  const matches = evaluateMatches(data.matches);
  const standings = buildStandings(data.teams, matches);
  return {
    data,
    matches,
    standings,
    issues: [...data.issues, ...crossCheckReportedPoints(standings)],
    version,
    lastModified,
  };
}
