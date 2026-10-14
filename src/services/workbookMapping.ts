/**
 * Header aliases used to locate data in the tournament workbook.
 *
 * Headers are compared after normalization (see `normalizeHeader`): lower-cased, "#" read as "no",
 * and everything except letters and digits removed — so "Team #", "Team No." and "team_no" all
 * become "teamno". Aliases are listed in priority order.
 *
 * NOTE: these aliases are NOT yet verified against 4IBC_2026_LIVE_Tournament.xlsx (the workbook was
 * not accessible while building). If the parser reports that it cannot find a sheet, add the real
 * header text here — no other code needs to change.
 */
export const TEAM_FIELDS = {
  number: ['teamno', 'teamnumber', 'teamnum', 'teamid', 'teamcode'],
  name: ['teamname', 'name', 'team'],
  /** A single column listing all members, separated by commas, slashes, "&", "and" or line breaks. */
  members: ['teammembers', 'members', 'players', 'playernames', 'participants', 'teamplayers'],
  points: ['totalpoints', 'points', 'pts'],
} as const;

/** One column per member, e.g. "Player 1", "Player 2 Name", "Member #1". */
export const MEMBER_COLUMN_PATTERN = /^(player|member|participant)(no)?\d+(name)?$/;

export const MATCH_FIELDS = {
  id: ['matchid', 'matchno', 'matchnumber', 'match', 'gameid', 'gameno', 'gamenumber', 'fixtureno', 'fixtureid'],
  round: ['round', 'roundname', 'stage', 'phase'],
  group: ['group', 'pool', 'groupname'],
  date: ['date', 'matchdate', 'playedon'],
  // Team-number columns ("A ID") are preferred; a "Team A" text column is then read for name + members.
  teamA: ['aid', 'teamaid', 'team1id', 'team1', 'teama', 'team1no', 'teamano', 'team1number', 'teamanumber', 'team1name', 'teamaname', 'hometeam', 'side1'],
  teamB: ['bid', 'teambid', 'team2id', 'team2', 'teamb', 'team2no', 'teambno', 'team2number', 'teambnumber', 'team2name', 'teambname', 'awayteam', 'side2', 'opponent'],
  /** Cells like "Team 1⏎Player A / Player B": first line is the team name, further lines the members. */
  teamADetails: ['teama', 'team1', 'teamaname', 'team1name'],
  teamBDetails: ['teamb', 'team2', 'teambname', 'team2name'],
  winner: ['winnerid', 'winner', 'winningteam', 'winnerteam', 'winnerno', 'winnerteamno', 'matchwinner', 'wonby'],
  /** Score from team A's perspective, e.g. "1-0" (A won) or "0-1" (B won). */
  result: ['resultab', 'result12', 'result', 'score'],
  loser: ['loser', 'losingteam', 'loserteam', 'loserno', 'loserteamno'],
  /** Balls lost by the losing team, as a single column. */
  ballsLost: [
    'ballslost', 'ballslostbyloser', 'ballslostbylosingteam', 'loserballslost', 'losingteamballslost',
    'loserballs', 'ballsleft', 'ballsremaining', 'remainingballs',
  ],
  /** Alternative layout: balls lost recorded per team; the loser's value is used. */
  teamABallsLost: ['team1ballslost', 'teamaballslost', 'ballslostteam1', 'ballslostteama', 'team1ballsleft', 'team1ballsremaining'],
  teamBBallsLost: ['team2ballslost', 'teambballslost', 'ballslostteam2', 'ballslostteamb', 'team2ballsleft', 'team2ballsremaining'],
  status: ['status', 'matchstatus', 'state', 'completed', 'played', 'confirmed', 'resultconfirmed'],
  /** Points the workbook itself awards for the match — only used to cross-check, never added. */
  points: ['pointsawarded', 'winnerpoints', 'points', 'pts'],
} as const;

/**
 * Finals bracket table ("Finals" sheet): one row per knockout match with rack scores.
 * Detected by a match id column plus two rack-score columns; it has no balls-lost column, so it
 * is never mistaken for the group match register.
 */
export const KNOCKOUT_FIELDS = {
  id: ['match', 'matchid', 'matchno', 'fixture', 'fixtureid'],
  teamA: ['aid', 'teamaid', 'team1id', 'teamano', 'team1no'],
  teamB: ['bid', 'teambid', 'team2id', 'teambno', 'team2no'],
  teamADetails: ['teama', 'team1', 'hometeam'],
  teamBDetails: ['teamb', 'team2', 'awayteam'],
  racksA: ['racksa', 'racks1', 'framesa', 'frames1', 'scorea', 'score1'],
  racksB: ['racksb', 'racks2', 'framesb', 'frames2', 'scoreb', 'score2'],
  /** Racks needed to win ("race to"). */
  target: ['target', 'raceto', 'firstto', 'racksto', 'racksneeded'],
  /** Optional: balls the loser had left — awarded to the winner as points, like in the group stage. */
  ballsLost: ['loserballs', 'ballslost', 'ballslostbyloser', 'loserballslost', 'ballsremaining', 'ballsleft'],
  status: ['status', 'matchstatus'],
  winner: ['winnerid', 'winnerteamid', 'winner', 'winningteam'],
} as const;

/** Cells whose normalized text equals one of these are treated as the tournament status label. */
export const TOURNAMENT_STATUS_LABELS = ['tournamentstatus', 'championshipstatus', 'eventstatus'];

const COMPLETE = /^(complete|completed|done|finished|played|final|confirmed|result|yes|y|true|1|✓|✔)$/;
const INCOMPLETE = /^(toplay|yettoplay|notyetplayed|open|awaiting|awaitingqualifiers|awaitingqualifier|pending|scheduled|upcoming|notplayed|notstarted|tbd|tba|live|inprogress|ongoing|postponed|cancelled|canceled|no|n|false|0|)$/;

/** Maps a status cell to complete (true), incomplete (false) or unknown (null). */
export function interpretStatus(raw: string): boolean | null {
  const v = raw.toLowerCase().replace(/[^a-z0-9✓✔]/g, '');
  if (COMPLETE.test(v)) return true;
  if (INCOMPLETE.test(v)) return false;
  return null;
}

/** Scan this many rows at the top of each sheet when looking for a header row (the finals sheet draws a bracket above its table). */
export const HEADER_SCAN_ROWS = 80;

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/#/g, 'no')
    .replace(/[^a-z0-9]/g, '');
}
