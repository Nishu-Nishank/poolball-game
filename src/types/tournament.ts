/** Supported tournament file formats. */
export type FileFormat = 'xlsx' | 'xls' | 'csv';

/** One workbook (.xlsx / .xls) or one .csv table, as raw bytes. */
export interface WorkbookFile {
  data: ArrayBuffer;
  fileName: string;
  format: FileFormat;
}

/** Location of a record in the workbook, so flagged data can be traced back to its cell row. */
export interface SourceRef {
  sheet: string;
  /** 1-based row number as shown in Excel. */
  row: number;
}

export interface Player {
  name: string;
}

export interface Team {
  /** Stable key derived from the team number (or the name when no number exists). */
  id: string;
  /** Team number exactly as written in the workbook, e.g. "7" or "07". Null if the workbook has none. */
  number: string | null;
  name: string | null;
  members: Player[];
  /** Group / pool the team plays in, derived from its matches. */
  group: string | null;
  /** Points value found in the workbook, if any. Only used to cross-check the calculated total. */
  reportedPoints: number | null;
  source: SourceRef | null;
}

/**
 * One match row, normalized from the workbook but not yet validated.
 * Team references are resolved to team ids where possible; the raw text is kept for diagnostics.
 */
export interface MatchRecord {
  /** Match id from the workbook, or a row-based id when the workbook has no id column. */
  id: string;
  /** True when `id` came from the workbook (enables duplicate detection). */
  hasWorkbookId: boolean;
  round: string | null;
  group: string | null;
  date: Date | null;
  teamA: string | null;
  teamB: string | null;
  teamARaw: string;
  teamBRaw: string;
  winner: string | null;
  winnerRaw: string;
  /** Balls lost by the losing team. Null when missing or not a valid whole number. */
  ballsLost: number | null;
  ballsLostRaw: string;
  /** Explicit completion flag from a status column; null when the workbook has no status column. */
  completed: boolean | null;
  statusRaw: string;
  /** Problems found while parsing this row (e.g. unknown team reference). */
  parseIssues: string[];
  source: SourceRef;
  /** Position in the workbook, used as the chronological fallback. */
  order: number;
}

export type MatchState =
  /** Valid, completed and counted towards the standings. */
  | 'counted'
  /** Not played or not confirmed yet; ignored without warning. */
  | 'pending'
  /** Ambiguous, contradictory or invalid; excluded from the standings and shown for review. */
  | 'flagged'
  /** Exact repeat of an already counted match id; ignored. */
  | 'duplicate';

export interface EvaluatedMatch extends MatchRecord {
  state: MatchState;
  loser: string | null;
  /** Points awarded to the winner (0 unless state is 'counted'). */
  points: number;
  reasons: string[];
}

export interface PointAward {
  matchId: string;
  hasWorkbookId: boolean;
  round: string | null;
  date: Date | null;
  order: number;
  winnerId: string;
  loserId: string;
  ballsLost: number;
  points: number;
}

export type FormResult = 'W' | 'L';

export interface TeamStanding {
  team: Team;
  /** Official rank under the default ordering (points, then wins, then fewest balls lost). */
  rank: number;
  played: number;
  won: number;
  lost: number;
  /** Balls this team lost in counted matches it lost. */
  ballsLost: number;
  points: number;
  /** Points-earning wins, oldest first. */
  breakdown: PointAward[];
  /** Counted results, oldest first. */
  form: FormResult[];
}

export interface DataIssue {
  severity: 'warning' | 'error';
  message: string;
  source?: SourceRef;
}

export type KnockoutRound = 'QF' | 'SF' | 'F';

/** A knockout (finals bracket) match, played as a race to `target` racks. Not part of the points table. */
export interface KnockoutMatch {
  /** Match id from the workbook, e.g. "QF1", "SF2", "Final". */
  id: string;
  round: KnockoutRound;
  teamA: string | null;
  teamB: string | null;
  teamARaw: string;
  teamBRaw: string;
  racksA: number | null;
  racksB: number | null;
  /** Racks needed to win the match, if the workbook states it. */
  target: number | null;
  /** Balls the losing team had left, if the sheet records it; the winner receives that many points. */
  ballsLost: number | null;
  /** Points awarded to the winner (0 unless played with a recorded ball count). */
  points: number;
  winner: string | null;
  statusRaw: string;
  state: 'played' | 'pending' | 'awaiting' | 'flagged';
  reasons: string[];
  source: SourceRef;
  order: number;
}

export interface TournamentData {
  teams: Team[];
  matches: MatchRecord[];
  /** Finals bracket matches (empty when the workbook has no finals sheet). */
  knockout: KnockoutMatch[];
  issues: DataIssue[];
  meta: {
    fileName: string;
    sheetNames: string[];
    teamSheet: string | null;
    matchSheet: string;
    knockoutSheet: string | null;
    tournamentStatus: string | null;
  };
}
