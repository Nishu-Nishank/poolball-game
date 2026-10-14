import * as XLSX from 'xlsx';
import type { DataIssue, KnockoutMatch, KnockoutRound, MatchRecord, Player, SourceRef, Team, TournamentData } from '../types/tournament.ts';
import {
  HEADER_SCAN_ROWS,
  KNOCKOUT_FIELDS,
  MATCH_FIELDS,
  MEMBER_COLUMN_PATTERN,
  TEAM_FIELDS,
  TOURNAMENT_STATUS_LABELS,
  interpretStatus,
  normalizeHeader,
} from './workbookMapping.ts';
import { WorkbookStructureError } from './errors.ts';
import type { FileFormat, WorkbookFile } from '../types/tournament.ts';

/** A worksheet as a plain grid of cell values (first row = Excel row 1). */
export interface SheetGrid {
  name: string;
  rows: unknown[][];
}

/** Parses one workbook, or several files read together (e.g. teams.csv + matches.csv). */
export function parseWorkbookFiles(files: WorkbookFile[]): TournamentData {
  const sheets: SheetGrid[] = [];
  const taken = new Set<string>();
  for (const file of files) {
    for (const sheet of readSheets(file, files.length > 1)) {
      // Sheet names must be unique: they identify the team and match tables and flagged rows.
      let name = sheet.name;
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${sheet.name} (${n})`;
      taken.add(name.toLowerCase());
      sheets.push({ ...sheet, name });
    }
  }
  return parseSheets(sheets, files.map((f) => f.fileName).join(', '));
}

export function parseWorkbook(data: ArrayBuffer, fileName: string): TournamentData {
  const format: FileFormat = /\.csv$/i.test(fileName) ? 'csv' : /\.xls$/i.test(fileName) ? 'xls' : 'xlsx';
  return parseWorkbookFiles([{ data, fileName, format }]);
}

function readSheets(file: WorkbookFile, prefixWithFileName: boolean): SheetGrid[] {
  const workbook =
    file.format === 'csv'
      ? // raw: keep every CSV value as text, so team numbers like "07" are not turned into 7.
        XLSX.read(decodeText(file.data), { type: 'string', raw: true })
      : XLSX.read(file.data, { type: 'array', cellDates: true });

  return workbook.SheetNames.map((sheetName) => ({
    // A CSV has a single, meaningless sheet name ("Sheet1"); the file name identifies it instead.
    name:
      file.format === 'csv'
        ? file.fileName.replace(/\.csv$/i, '')
        : prefixWithFileName
          ? `${file.fileName} › ${sheetName}`
          : sheetName,
    rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    }),
  }));
}

/**
 * CSV text is UTF-8 when saved as "CSV UTF-8" from Excel, but Windows-1252 for plain "CSV".
 * Strict UTF-8 decoding fails on the latter, which tells the two apart (a BOM is stripped).
 */
function decodeText(data: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return new TextDecoder('windows-1252').decode(data);
  }
}

export function parseSheets(sheets: SheetGrid[], fileName: string): TournamentData {
  const issues: DataIssue[] = [];

  const matchTable = findTable(sheets, MATCH_FIELDS, isMatchHeader);
  if (!matchTable) {
    const onlyFinals = findTable(sheets, KNOCKOUT_FIELDS, isKnockoutHeader) !== null;
    throw new WorkbookStructureError(
      onlyFinals
        ? 'Only the finals bracket was found. The finals sheet cannot be uploaded on its own — select the group results file together with it (choose both files in the same dialog).'
        : 'Could not find a match results sheet. Expected a header row with two team columns, a winner or result column and a balls-lost column.',
      describeSheets(sheets),
    );
  }
  const teamTable = findTable(
    sheets.filter((s) => s.name !== matchTable.sheet.name),
    TEAM_FIELDS,
    isTeamHeader,
  );

  const teams: Team[] = teamTable ? readTeams(teamTable, issues) : [];
  const matches = readMatches(matchTable, teams, !teamTable);
  if (teams.length > 0 && teams.every((t) => t.members.length === 0)) {
    issues.push({ severity: 'warning', message: 'No team member names were found in the workbook.' });
  }

  const knockoutTable = findTable(sheets, KNOCKOUT_FIELDS, isKnockoutHeader);
  const knockout = knockoutTable ? readKnockout(knockoutTable, teams) : [];

  return {
    teams,
    matches,
    knockout,
    issues,
    meta: {
      fileName,
      sheetNames: sheets.map((s) => s.name),
      teamSheet: teamTable?.sheet.name ?? null,
      matchSheet: matchTable.sheet.name,
      knockoutSheet: knockoutTable?.sheet.name ?? null,
      tournamentStatus: findTournamentStatus(sheets),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Table detection

type FieldSpec = Record<string, readonly string[]>;
type ColumnMap<F extends FieldSpec> = Partial<Record<keyof F, number>>;

interface Table<F extends FieldSpec> {
  sheet: SheetGrid;
  headerRow: number;
  columns: ColumnMap<F>;
  memberColumns: number[];
}

function findTable<F extends FieldSpec>(
  sheets: SheetGrid[],
  fields: F,
  accept: (columns: ColumnMap<F>, memberColumns: number[]) => boolean,
): Table<F> | null {
  let best: { table: Table<F>; score: number } | null = null;
  for (const sheet of sheets) {
    const limit = Math.min(sheet.rows.length, HEADER_SCAN_ROWS);
    for (let r = 0; r < limit; r++) {
      const headers = (sheet.rows[r] ?? []).map(normalizeHeader);
      const columns = mapColumns(headers, fields);
      const memberColumns = headers
        .map((h, i) => (MEMBER_COLUMN_PATTERN.test(h) ? i : -1))
        .filter((i) => i >= 0 && !Object.values(columns).includes(i));
      if (!accept(columns, memberColumns)) continue;
      const score = Object.keys(columns).length + memberColumns.length;
      if (!best || score > best.score) {
        best = { table: { sheet, headerRow: r, columns, memberColumns }, score };
      }
    }
  }
  return best?.table ?? null;
}

/** Assigns each field the first header matching its aliases (in alias priority order), without reuse. */
function mapColumns<F extends FieldSpec>(headers: string[], fields: F): ColumnMap<F> {
  const used = new Set<number>();
  const columns: ColumnMap<F> = {};
  for (const field of Object.keys(fields) as (keyof F)[]) {
    for (const alias of fields[field]) {
      const index = headers.findIndex((h, i) => h === alias && !used.has(i));
      if (index >= 0) {
        columns[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return columns;
}

function isMatchHeader(c: ColumnMap<typeof MATCH_FIELDS>): boolean {
  const hasBalls = c.ballsLost !== undefined || (c.teamABallsLost !== undefined && c.teamBBallsLost !== undefined);
  const hasWinner = c.winner !== undefined || c.result !== undefined;
  return c.teamA !== undefined && c.teamB !== undefined && hasWinner && hasBalls;
}

function isTeamHeader(c: ColumnMap<typeof TEAM_FIELDS>, memberColumns: number[]): boolean {
  const hasIdentity = c.number !== undefined || c.name !== undefined;
  return hasIdentity && (c.members !== undefined || memberColumns.length > 0);
}

function isKnockoutHeader(c: ColumnMap<typeof KNOCKOUT_FIELDS>): boolean {
  const hasTeams = (c.teamA !== undefined || c.teamADetails !== undefined) && (c.teamB !== undefined || c.teamBDetails !== undefined);
  return c.id !== undefined && c.racksA !== undefined && c.racksB !== undefined && hasTeams;
}

// ---------------------------------------------------------------------------------------------
// Knockout (finals bracket)

function knockoutRound(id: string): KnockoutRound | null {
  const v = id.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^(qf|quarter)/.test(v)) return 'QF';
  if (/^(sf|semi)/.test(v)) return 'SF';
  if (/^(f|final|gf|grandfinal)/.test(v)) return 'F';
  return null;
}

/**
 * Reads the finals table. Rows whose id is not a recognisable round (instruction text below the
 * table, blank rows) are skipped. Teams are matched by id first, then by the name in the team cell.
 */
function readKnockout(table: Table<typeof KNOCKOUT_FIELDS>, teams: Team[]): KnockoutMatch[] {
  const { sheet, headerRow, columns: c } = table;
  const text = (cells: unknown[], col: number | undefined) => (col === undefined ? '' : cellText(cells[col]));
  const resolve = teamResolver(teams);
  const out: KnockoutMatch[] = [];

  for (const { cells, source } of dataRows(sheet, headerRow)) {
    const id = text(cells, c.id);
    const round = knockoutRound(id);
    if (!round) continue;

    const reasons: string[] = [];
    const side = (idCol: number | undefined, detailCol: number | undefined) => {
      const ref = text(cells, idCol);
      const details = parseTeamDetails(text(cells, detailCol));
      const raw = ref || details.name || '';
      for (const candidate of [ref, details.name ?? '']) {
        if (!candidate) continue;
        const r = resolve(candidate);
        if (r.id) return { id: r.id, raw };
      }
      if (raw) reasons.push(`"${raw}" does not match a known team.`);
      return { id: null, raw };
    };
    const a = side(c.teamA, c.teamADetails);
    const b = side(c.teamB, c.teamBDetails);
    const racksA = toWholeNumber(c.racksA === undefined ? null : cells[c.racksA]);
    const racksB = toWholeNumber(c.racksB === undefined ? null : cells[c.racksB]);
    const target = toWholeNumber(c.target === undefined ? null : cells[c.target]);
    const ballsLostRaw = text(cells, c.ballsLost);
    const ballsLost = toWholeNumber(c.ballsLost === undefined ? null : cells[c.ballsLost]);
    if (ballsLostRaw && ballsLost === null) reasons.push(`Loser balls "${ballsLostRaw}" is not a valid whole number.`);
    const statusRaw = text(cells, c.status);
    const completed = c.status !== undefined && statusRaw ? interpretStatus(statusRaw) : null;

    let winner: string | null = null;
    const winnerRaw = text(cells, c.winner);
    if (winnerRaw) {
      const r = resolve(winnerRaw);
      if (!r.id) reasons.push(`Winner "${winnerRaw}" does not match a known team.`);
      else if (r.id !== a.id && r.id !== b.id) reasons.push(`Winner "${winnerRaw}" is not one of the two teams.`);
      else winner = r.id;
    } else if (target !== null && racksA !== null && racksB !== null && (racksA >= target) !== (racksB >= target)) {
      // No winner column value: a side that reached the target has won.
      winner = racksA >= target ? a.id : b.id;
    }

    let state: KnockoutMatch['state'];
    if (reasons.length > 0) state = 'flagged';
    else if (winner && completed === false) {
      reasons.push(`A winner is recorded but the status is "${statusRaw}".`);
      state = 'flagged';
    } else if (winner) state = 'played';
    else if (completed === true) {
      reasons.push('Match is marked complete but no winner is recorded.');
      state = 'flagged';
    } else state = a.id && b.id ? 'pending' : 'awaiting';

    out.push({
      id,
      round,
      teamA: a.id,
      teamB: b.id,
      teamARaw: a.raw,
      teamBRaw: b.raw,
      racksA,
      racksB,
      target,
      ballsLost,
      points: state === 'played' && ballsLost !== null ? ballsLost : 0,
      winner,
      statusRaw,
      state,
      reasons,
      source,
      order: out.length,
    });
  }
  return advanceWinners(out);
}

/**
 * Fills empty later-round slots from earlier winners by the usual bracket order
 * (SF1 = QF1 vs QF2, SF2 = QF3 vs QF4, Final = SF1 vs SF2), so the dashboard shows who
 * progressed even before the organisers type the names into the finals sheet.
 */
function advanceWinners(matches: KnockoutMatch[]): KnockoutMatch[] {
  const ordered = (round: KnockoutRound) => matches.filter((m) => m.round === round);
  const feed = (round: KnockoutRound, from: KnockoutRound) => {
    const sources = ordered(from);
    ordered(round).forEach((m, i) => {
      const a = sources[i * 2];
      const b = sources[i * 2 + 1];
      if (!a || !b) return;
      if (!m.teamA && a.winner) m.teamA = a.winner;
      if (!m.teamB && b.winner) m.teamB = b.winner;
      if (!m.teamARaw) m.teamARaw = `Winner ${a.id}`;
      if (!m.teamBRaw) m.teamBRaw = `Winner ${b.id}`;
      if (m.state === 'awaiting' && m.teamA && m.teamB) m.state = 'pending';
    });
  };
  feed('SF', 'QF');
  feed('F', 'SF');
  return matches;
}

function describeSheets(sheets: SheetGrid[]) {
  return sheets.map((s) => {
    const firstNonEmpty = s.rows.slice(0, HEADER_SCAN_ROWS).find((r) => r.some((v) => cellText(v) !== ''));
    return { name: s.name, headers: (firstNonEmpty ?? []).map(cellText).filter(Boolean) };
  });
}

// ---------------------------------------------------------------------------------------------
// Teams

function readTeams(table: Table<typeof TEAM_FIELDS>, issues: DataIssue[]): Team[] {
  const { sheet, headerRow, columns, memberColumns } = table;
  let numberCol = columns.number;
  let nameCol = columns.name;

  // A lone "Team" column holding numbers ("7", "Team 7", "T07") is the team number, not a name.
  if (numberCol === undefined && nameCol !== undefined) {
    const values = dataRows(sheet, headerRow).map(({ cells }) => cellText(cells[nameCol as number])).filter(Boolean);
    if (values.length > 0 && values.every((v) => extractTeamNumber(v) !== null)) {
      numberCol = nameCol;
      nameCol = undefined;
    }
  }

  const byId = new Map<string, Team>();
  for (const { cells, source } of dataRows(sheet, headerRow)) {
    const rawNumber = numberCol === undefined ? '' : cellText(cells[numberCol]);
    const number = rawNumber ? (extractTeamNumber(rawNumber) !== null ? stripTeamPrefix(rawNumber) : rawNumber) : null;
    const name = nameCol === undefined ? null : cellText(cells[nameCol]) || null;

    const members: Player[] = [
      ...(columns.members === undefined ? [] : splitMembers(cellText(cells[columns.members]))),
      ...memberColumns.map((i) => cellText(cells[i])).filter(Boolean).map((n) => ({ name: n })),
    ];
    if (!number && !name) {
      if (members.length > 0) {
        issues.push({ severity: 'warning', message: 'Members listed without a team number or name were ignored.', source });
      }
      continue;
    }

    const id = teamId(number, name);
    const reportedPoints = columns.points === undefined ? null : toNumber(cells[columns.points]);
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { id, number, name, members: dedupeMembers(members), group: null, reportedPoints, source });
      continue;
    }
    // One row per player ("long" layout): merge members into the existing team.
    if (name && existing.name && name.toLowerCase() !== existing.name.toLowerCase()) {
      issues.push({
        severity: 'warning',
        message: `Team ${number ?? name} has different names ("${existing.name}" and "${name}"); using "${existing.name}".`,
        source,
      });
    }
    existing.name ??= name;
    existing.members = dedupeMembers([...existing.members, ...members]);
    existing.reportedPoints ??= reportedPoints;
  }
  return [...byId.values()];
}

function splitMembers(text: string): Player[] {
  return text
    .split(/\r?\n|[,;/&+]|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

function dedupeMembers(members: Player[]): Player[] {
  const seen = new Set<string>();
  return members.filter((p) => {
    const key = p.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// Matches

function readMatches(
  table: Table<typeof MATCH_FIELDS>,
  teams: Team[],
  deriveTeams: boolean,
): MatchRecord[] {
  const { sheet, headerRow, columns: c } = table;
  const text = (cells: unknown[], col: number | undefined) => (col === undefined ? '' : cellText(cells[col]));
  // Only rows naming a team or a result are matches; instruction text around the table is skipped.
  const rows = dataRows(sheet, headerRow).filter(({ cells }) =>
    [c.teamA, c.teamB, c.winner, c.result].some((i) => text(cells, i) !== ''),
  );

  // Teams from the match sheet itself: "A ID" gives the number, the "Team A" cell the name and members.
  const sides = [
    [c.teamA, c.teamADetails, c.group],
    [c.teamB, c.teamBDetails, c.group],
  ] as const;
  for (const { cells } of rows) {
    for (const [refCol, detailCol, groupCol] of sides) {
      const raw = text(cells, refCol);
      if (!raw) continue;
      const number = extractTeamNumber(raw) !== null ? stripTeamPrefix(raw) : null;
      const id = teamId(number, number ? null : raw);
      let team = teams.find((t) => t.id === id);
      if (!team) {
        // With a team sheet, unknown teams are not invented; the match is flagged instead.
        if (!deriveTeams) continue;
        team = { id, number, name: number ? null : raw, members: [], group: null, reportedPoints: null, source: null };
        teams.push(team);
      }
      const details = parseTeamDetails(text(cells, detailCol));
      // "Team 1" as the name of team #1 adds nothing, so it is not shown as a separate name.
      const genericName = details.name !== null && extractTeamNumber(details.name) === extractTeamNumber(team.number ?? '');
      if (!team.name && details.name && !genericName) team.name = details.name;
      if (team.members.length === 0) team.members = details.members;
      team.group ??= text(cells, groupCol) || null;
    }
  }

  const resolve = teamResolver(teams);

  return rows.map(({ cells, source }, order) => {
    const parseIssues: string[] = [];
    const ref = (raw: string) => {
      const r = resolve(raw);
      if (r.issue) parseIssues.push(r.issue);
      return r.id;
    };

    const teamARaw = text(cells, c.teamA);
    const teamBRaw = text(cells, c.teamB);
    const teamA = ref(teamARaw);
    const teamB = ref(teamBRaw);

    // Winner from the winner column and/or an "A–B" result such as "1-0". When both exist they must agree.
    const winnerIdRaw = text(cells, c.winner);
    const resultRaw = text(cells, c.result);
    const winnerRaw = winnerIdRaw || resultRaw;
    let winner = winnerIdRaw ? ref(winnerIdRaw) : null;
    if (resultRaw) {
      const side = resultWinner(resultRaw);
      const fromResult = side === 'A' ? teamA : side === 'B' ? teamB : null;
      if (side === null) {
        parseIssues.push(`Result "${resultRaw}" does not identify a winner.`);
      } else if (!winnerIdRaw) {
        winner = fromResult;
      } else if (winner && fromResult && winner !== fromResult) {
        parseIssues.push(`Result "${resultRaw}" contradicts winner "${winnerIdRaw}".`);
      }
    }

    // Balls lost: single column, or the losing team's own column in the per-team layout.
    let ballsCell: unknown = null;
    if (c.ballsLost !== undefined) {
      ballsCell = cells[c.ballsLost];
    } else if (winner && winner === teamA) {
      ballsCell = cells[c.teamBBallsLost as number];
    } else if (winner && winner === teamB) {
      ballsCell = cells[c.teamABallsLost as number];
    }
    const ballsLostRaw = cellText(ballsCell);
    const ballsLost = toWholeNumber(ballsCell);

    const loserRaw = text(cells, c.loser);
    if (loserRaw && winner && teamA && teamB) {
      const expectedLoser = winner === teamA ? teamB : teamA;
      if (ref(loserRaw) !== expectedLoser) {
        parseIssues.push(`Loser "${loserRaw}" contradicts winner "${winnerRaw}".`);
      }
    }

    const pointsRaw = text(cells, c.points);
    if (pointsRaw && ballsLost !== null && toNumber(pointsRaw) !== ballsLost) {
      parseIssues.push(`Workbook points (${pointsRaw}) differ from balls lost by the loser (${ballsLost}).`);
    }

    const statusRaw = text(cells, c.status);
    let completed: boolean | null = null;
    if (c.status !== undefined) {
      completed = interpretStatus(statusRaw);
      if (completed === null) parseIssues.push(`Unrecognized match status "${statusRaw}".`);
    }

    const rawId = text(cells, c.id);
    return {
      id: rawId || `${sheet.name}!${source.row}`,
      hasWorkbookId: rawId !== '',
      round: text(cells, c.round) || null,
      group: text(cells, c.group) || null,
      date: toDate(c.date === undefined ? null : cells[c.date]),
      teamA,
      teamB,
      teamARaw,
      teamBRaw,
      winner,
      winnerRaw,
      ballsLost,
      ballsLostRaw,
      completed,
      statusRaw,
      parseIssues,
      source,
      order,
    };
  });
}

/** "1-0" → team A won, "0-1" → team B won (any higher score wins; a draw identifies no winner). */
function resultWinner(raw: string): 'A' | 'B' | null {
  const m = /^\s*(\d+)\s*[-–—:]\s*(\d+)\s*$/.exec(raw);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a > b ? 'A' : b > a ? 'B' : null;
}

/** "Team 1⏎Hithesh M R / Priyanka Kumari" → name "Team 1", members ["Hithesh M R", "Priyanka Kumari"]. */
function parseTeamDetails(text: string): { name: string | null; members: Player[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { name: null, members: [] };
  return { name: lines[0], members: dedupeMembers(splitMembers(lines.slice(1).join(' / '))) };
}

// ---------------------------------------------------------------------------------------------
// Team references

const TEAM_NUMBER = /^(?:team\s*)?(?:no\.?\s*)?#?\s*(?:t)?0*(\d+)$/i;

function extractTeamNumber(text: string): string | null {
  const m = TEAM_NUMBER.exec(text.trim());
  return m ? m[1] : null;
}

/** "Team #07" -> "07"; keeps leading zeros as written. */
function stripTeamPrefix(text: string): string {
  return text.trim().replace(/^(?:team\s*)?(?:no\.?\s*)?#?\s*(?:t(?=\d))?/i, '');
}

function teamId(number: string | null, name: string | null): string {
  if (number) {
    const n = extractTeamNumber(number);
    return `n:${n ?? number.toLowerCase()}`;
  }
  return `s:${(name ?? '').trim().toLowerCase()}`;
}

/**
 * Resolves a match cell to a team id by team number ("7", "#07", "Team 7"), exact team name,
 * or "07 - Name" combinations. Anything that matches zero or several teams is reported, never guessed.
 */
export function teamResolver(teams: Team[]) {
  const byNumber = new Map<string, Set<string>>();
  const byName = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, id: string) =>
    map.set(key, (map.get(key) ?? new Set()).add(id));
  for (const t of teams) {
    const n = t.number ? (extractTeamNumber(t.number) ?? t.number.toLowerCase()) : null;
    if (n) add(byNumber, n, t.id);
    if (t.name) add(byName, t.name.trim().toLowerCase(), t.id);
  }

  return (raw: string): { id: string | null; issue: string | null } => {
    const text = raw.trim();
    if (!text) return { id: null, issue: null };

    const candidates = new Set<string>();
    const number = extractTeamNumber(text);
    byNumber.get(number ?? text.toLowerCase())?.forEach((id) => candidates.add(id));
    byName.get(text.toLowerCase())?.forEach((id) => candidates.add(id));

    const combo = /^(?:team\s*)?#?\s*0*(\d+)\s*[-–—:|]\s*(.+)$/i.exec(text);
    if (combo && candidates.size === 0) {
      const byNum = byNumber.get(combo[1]);
      const byNm = byName.get(combo[2].trim().toLowerCase());
      if (byNum && byNm) {
        const both = [...byNum].filter((id) => byNm.has(id));
        both.forEach((id) => candidates.add(id));
        if (both.length === 0) {
          return { id: null, issue: `"${raw}" combines the number and name of different teams.` };
        }
      } else {
        (byNum ?? byNm)?.forEach((id) => candidates.add(id));
      }
    }

    if (candidates.size === 1) return { id: [...candidates][0], issue: null };
    if (candidates.size === 0) return { id: null, issue: `"${raw}" does not match any team.` };
    return { id: null, issue: `"${raw}" matches more than one team.` };
  };
}

// ---------------------------------------------------------------------------------------------
// Cells

function dataRows(sheet: SheetGrid, headerRow: number): { cells: unknown[]; source: SourceRef }[] {
  return sheet.rows
    .slice(headerRow + 1)
    .map((cells, i) => ({ cells: cells ?? [], source: { sheet: sheet.name, row: headerRow + 2 + i } }))
    .filter(({ cells }) => cells.some((v) => cellText(v) !== ''));
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  return String(value).trim();
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = cellText(value);
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

/** Balls lost must be a non-negative whole number; anything else is treated as invalid (null). */
export function toWholeNumber(value: unknown): number | null {
  const n = toNumber(value);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = cellText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function findTournamentStatus(sheets: SheetGrid[]): string | null {
  for (const sheet of sheets) {
    for (let r = 0; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        if (!TOURNAMENT_STATUS_LABELS.includes(normalizeHeader(row[c]))) continue;
        const right = row.slice(c + 1).map(cellText).find(Boolean);
        const below = cellText(sheet.rows[r + 1]?.[c]);
        return right || below || null;
      }
    }
  }
  return null;
}
