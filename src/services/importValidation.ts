/**
 * Validation for administrator uploads. Shared by the browser and the upload Edge Function
 * (copied by scripts/sync-shared.mjs), so the preview and the server apply identical rules.
 *
 * Uploads are stricter than the read-only dashboard: the dashboard shows what it can and lists
 * problems, while an upload with any error is rejected so it never becomes the published dataset.
 */
import type { EvaluatedMatch, FileFormat, SourceRef, TournamentData, WorkbookFile } from '../types/tournament.ts';
import { parseWorkbookFiles } from './excelParser.ts';
import { WorkbookStructureError } from './errors.ts';
import { evaluateMatches } from '../utils/pointsCalculator.ts';

export const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const UPLOAD_EXTENSIONS: Record<string, FileFormat> = { '.csv': 'csv', '.xlsx': 'xlsx', '.xls': 'xls' };

export interface ImportIssue {
  message: string;
  source?: SourceRef;
  matchId?: string;
}

export interface ImportSummary {
  teams: number;
  matches: number;
  completed: number;
  pending: number;
  groups: string[];
  matchSheet: string | null;
  teamSheet: string | null;
}

export interface ImportValidation {
  ok: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  summary: ImportSummary;
  /** Parsed data — only meaningful (and only ever published) when `ok` is true. */
  data: TournamentData | null;
  matches: EvaluatedMatch[];
}

export type FileCheck = { ok: true; format: FileFormat } | { ok: false; error: string };

const ZIP = [0x50, 0x4b, 0x03, 0x04]; // .xlsx (Office Open XML is a ZIP archive)
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // legacy .xls (OLE compound file)
const startsWith = (bytes: Uint8Array, sig: number[]) => sig.every((b, i) => bytes[i] === b);

/** Checks extension, size and that the content really is what the extension claims. */
export function checkUploadFile(fileName: string, bytes: Uint8Array, maxBytes = DEFAULT_MAX_UPLOAD_BYTES): FileCheck {
  const ext = /\.[^.]+$/.exec(fileName.toLowerCase())?.[0] ?? '';
  const format = UPLOAD_EXTENSIONS[ext];
  if (!format) return { ok: false, error: `Unsupported file type "${ext || 'no extension'}". Upload a .csv, .xlsx or .xls file.` };
  if (bytes.length === 0) return { ok: false, error: 'The file is empty.' };
  if (bytes.length > maxBytes) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
    return { ok: false, error: `The file is ${mb(bytes.length)} MB; the maximum is ${mb(maxBytes)} MB.` };
  }
  const zip = startsWith(bytes, ZIP);
  const ole = startsWith(bytes, OLE);
  if (format === 'xlsx' && !zip) return { ok: false, error: 'The file content is not a valid .xlsx workbook.' };
  if (format === 'xls' && !ole) return { ok: false, error: 'The file content is not a valid .xls workbook.' };
  if (format === 'csv') {
    if (zip || ole) return { ok: false, error: 'This is an Excel workbook saved with a .csv extension. Rename it to .xlsx/.xls or export it as CSV.' };
    if (bytes.subarray(0, 65536).includes(0)) return { ok: false, error: 'The file content is not text, so it is not a valid CSV file.' };
  }
  return { ok: true, format };
}

/** Parses and validates one uploaded file. Never throws for bad content — problems become errors. */
export function validateImport(file: WorkbookFile): ImportValidation {
  const empty: ImportSummary = { teams: 0, matches: 0, completed: 0, pending: 0, groups: [], matchSheet: null, teamSheet: null };
  const fail = (errors: ImportIssue[]): ImportValidation => ({ ok: false, errors, warnings: [], summary: empty, data: null, matches: [] });

  let data: TournamentData;
  try {
    data = parseWorkbookFiles([file]);
  } catch (e) {
    if (e instanceof WorkbookStructureError) {
      const found = e.sheets.map((s) => `${s.name}: ${s.headers.join(' | ') || '(empty)'}`).join('; ');
      return fail([{ message: `${e.message} Found — ${found || 'no sheets'}.` }]);
    }
    return fail([{ message: 'The file could not be read as a spreadsheet. Check that it is not corrupted or password-protected.' }]);
  }

  const matches = evaluateMatches(data.matches);
  const errors: ImportIssue[] = [];

  if (data.teams.length === 0) errors.push({ message: 'No teams were found in the file.' });
  if (data.matches.length === 0) errors.push({ message: 'No matches were found in the file.' });

  // Stable match IDs are required: they make duplicates detectable and results traceable.
  const withoutId = matches.filter((m) => !m.hasWorkbookId);
  if (withoutId.length > 0 && withoutId.length === matches.length) {
    errors.push({ message: 'The Match ID column is missing. Every match needs a unique Match ID.' });
  } else {
    withoutId.forEach((m) => errors.push({ message: 'Match ID is missing.', source: m.source }));
  }

  for (const m of matches) {
    if (m.state === 'flagged' || m.state === 'duplicate') {
      errors.push({ message: m.reasons.join(' '), source: m.source, matchId: m.hasWorkbookId ? m.id : undefined });
    }
  }

  const groups = [...new Set(data.teams.map((t) => t.group).filter((g): g is string => !!g))].sort();
  const summary: ImportSummary = {
    teams: data.teams.length,
    matches: matches.filter((m) => m.state !== 'duplicate').length,
    completed: matches.filter((m) => m.state === 'counted').length,
    pending: matches.filter((m) => m.state === 'pending').length,
    groups,
    matchSheet: data.meta.matchSheet,
    teamSheet: data.meta.teamSheet,
  };

  return {
    ok: errors.length === 0,
    errors,
    warnings: data.issues.map((i) => ({ message: i.message, source: i.source })),
    summary,
    data,
    matches,
  };
}
