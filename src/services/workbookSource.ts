import type { SupabaseClient } from '@supabase/supabase-js';
import { NoPublishedDataError, WorkbookAccessError } from './errors';
import { decodeDataset } from './datasetCodec';
import { supabase } from '../lib/supabase';
import type { FileFormat, TournamentData, WorkbookFile } from '../types/tournament';

export type { FileFormat, WorkbookFile };

/**
 * Where the tournament data comes from. The UI and parser only depend on this interface, so the
 * source (published Supabase dataset, Graph backend or local files) is a configuration choice.
 */
export interface WorkbookSource {
  readonly kind: 'supabase' | 'static' | 'api';
  readonly label: string;
  /** Returns the data, or 'unchanged' when it matches `previousVersion`. */
  fetchWorkbook(previousVersion: string | null): Promise<WorkbookPayload | 'unchanged'>;
}

export type WorkbookPayload = (
  | {
      /** A single workbook, or several files (e.g. teams.csv + matches.csv) read together. */
      files: WorkbookFile[];
    }
  | {
      /** Already parsed and validated data (the dataset published by an administrator). */
      dataset: TournamentData;
    }
) & {
  /** ETags, content hashes or dataset id; used to skip re-parsing unchanged data. */
  version: string;
  /** When the data last changed at the source, if known. */
  lastModified: Date | null;
};

const DEFAULT_FILE_NAME = '4IBC_2026_LIVE_Tournament.xlsx';

/**
 * Fetches one file over HTTP. `cache: 'no-cache'` makes the browser revalidate with the
 * server (ETag / Last-Modified), so an unchanged file costs a 304 rather than a full download.
 */
async function fetchOverHttp(
  url: string,
  describeFailure: (status: number, body: string) => WorkbookAccessError,
): Promise<{ file: WorkbookFile; version: string; lastModified: Date | null }> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-cache' });
  } catch {
    throw new WorkbookAccessError(`Could not reach ${url}.`, 'Check your network connection and that the server is running.');
  }
  if (!response.ok) throw describeFailure(response.status, await response.text().catch(() => ''));

  const data = await response.arrayBuffer();
  const fileName = fileNameFrom(response, url);
  const format = detectFormat(data, fileName, response.headers.get('content-type'));
  if (!format) {
    // Dev servers answer unknown paths with index.html, so a missing file can look like a 200.
    throw describeFailure(404, '');
  }
  const version = response.headers.get('etag') ?? (await contentHash(data));
  const modified = new Date(response.headers.get('last-modified') ?? '');
  return { file: { data, fileName, format }, version, lastModified: Number.isNaN(modified.getTime()) ? null : modified };
}

async function fetchAll(
  urls: string[],
  previousVersion: string | null,
  describeFailure: (url: string) => (status: number, body: string) => WorkbookAccessError,
): Promise<WorkbookPayload | 'unchanged'> {
  const results = await Promise.all(urls.map((url) => fetchOverHttp(url, describeFailure(url))));
  const version = results.map((r) => r.version).join('|');
  if (version === previousVersion) return 'unchanged';
  const times = results.map((r) => r.lastModified?.getTime()).filter((t): t is number => t !== undefined);
  const lastModified = times.length > 0 ? new Date(Math.max(...times)) : null;
  return { files: results.map((r) => r.file), version, lastModified };
}

/**
 * Prototype source: downloaded copies served from `public/data/`.
 * Accepts one workbook URL or several (e.g. a teams CSV and a matches CSV).
 */
export function staticFileSource(urls: string[]): WorkbookSource {
  return {
    kind: 'static',
    label: urls.length > 1 ? 'Local data files' : 'Local workbook copy',
    fetchWorkbook: (previous) =>
      fetchAll(urls, previous, (url) => (status) =>
        status === 404
          ? new WorkbookAccessError(
              `The tournament data was not found at ${url}.`,
              `Download ${DEFAULT_FILE_NAME} from SharePoint (or export it as CSV) and save it as public${url}.`,
            )
          : new WorkbookAccessError(`Loading ${url} failed (HTTP ${status}).`),
      ),
  };
}

/** Default source: the backend in server/ downloads the published workbook from SharePoint via Microsoft Graph. */
export function apiSource(url = '/api/workbook'): WorkbookSource {
  return {
    kind: 'api',
    label: 'Live from SharePoint',
    fetchWorkbook: (previous) =>
      fetchAll([url], previous, () => (status, body) => {
        let detail = '';
        try {
          detail = (JSON.parse(body) as { error?: string }).error ?? '';
        } catch {
          /* non-JSON error body */
        }
        // No JSON error from our server means the request never reached it (dev proxy / gateway error).
        if (!detail) {
          return new WorkbookAccessError(
            `The tournament server is not reachable (HTTP ${status}).`,
            'It starts automatically with "npm run dev"; in production, start it with "npm start".',
          );
        }
        if (status === 503) {
          return new WorkbookAccessError(
            'SharePoint access has not been set up yet.',
            detail,
          );
        }
        return new WorkbookAccessError(`The workbook could not be fetched from SharePoint. ${detail}`);
      }),
  };
}

/**
 * Published dataset in Supabase. A tiny version check runs on every refresh; the full dataset
 * is downloaded only when an administrator has published a new one.
 */
export function supabaseSource(client: Pick<SupabaseClient, 'rpc'> | null): WorkbookSource {
  const unreachable = (detail?: string) =>
    new WorkbookAccessError('The tournament results could not be loaded.', detail ?? 'Check your connection and try again.');
  return {
    kind: 'supabase',
    label: 'Published results',
    fetchWorkbook: async (previous) => {
      if (!client) throw unreachable('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).');
      const version = await client.rpc('get_published_version');
      if (version.error) throw unreachable();
      const current = (version.data as { dataset_id: string }[] | null)?.[0];
      if (!current) throw new NoPublishedDataError();
      if (current.dataset_id === previous) return 'unchanged';

      const full = await client.rpc('get_published_dataset');
      if (full.error) throw unreachable();
      const row = (full.data as { dataset_id: string; published_at: string; data: unknown }[] | null)?.[0];
      if (!row) throw new NoPublishedDataError();
      return { dataset: decodeDataset(row.data), version: row.dataset_id, lastModified: new Date(row.published_at) };
    },
  };
}

/**
 * VITE_DATA_SOURCE selects the source. Default: the published Supabase dataset when Supabase is
 * configured, otherwise the SharePoint backend ('api'). 'static' reads files from public/ (offline dev).
 */
export function sourceFromEnv(): WorkbookSource {
  const kind = import.meta.env.VITE_DATA_SOURCE ?? (supabase ? 'supabase' : 'api');
  if (kind === 'supabase') return supabaseSource(supabase);
  if (kind === 'api') return apiSource();
  const urls = (import.meta.env.VITE_WORKBOOK_URL || `/data/${DEFAULT_FILE_NAME}`)
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  return staticFileSource(urls);
}

/**
 * .xlsx files are ZIP archives ("PK" header). CSV has no signature, so it is recognized by its
 * extension or content type — and HTML (a dev-server fallback page) is never mistaken for CSV.
 */
export function detectFormat(data: ArrayBuffer, fileName: string, contentType?: string | null): FileFormat | null {
  const bytes = new Uint8Array(data, 0, Math.min(2, data.byteLength));
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'xlsx';
  const type = (contentType ?? '').toLowerCase();
  if (type.includes('text/html')) return null;
  if (/\.csv$/i.test(fileName) || type.includes('text/csv')) return 'csv';
  return null;
}

async function contentHash(data: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) return `${data.byteLength}`;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function fileNameFrom(response: Response, url: string): string {
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (match) return decodeURIComponent(match[1]);
  return decodeURIComponent(url.split('?')[0].split('/').pop() || DEFAULT_FILE_NAME);
}
