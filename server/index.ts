/**
 * Minimal backend that downloads the tournament workbook from SharePoint via Microsoft Graph
 * (app-only, client-credentials flow) and serves it to the dashboard at GET /api/workbook.
 *
 * Credentials stay on the server. The browser only ever receives the .xlsx bytes.
 * Run with `npm run server` (Node >= 22.18 runs this TypeScript file directly).
 * If `dist/` exists (after `npm run build`) it is served too, so one process can host everything.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { locateInDrives, parseSharePointFileUrl } from './sharepointUrl.ts';

/** The published tournament workbook. Override with SHAREPOINT_FILE_URL if the file moves. */
const DEFAULT_FILE_URL =
  'https://4flowconsulting.sharepoint.com/:x:/r/sites/4IBC20264flowIndia8-BallChampionship/SiteAssets/Published/68d0b2b0-9077-46a8-8cc4-62c47a14a315/4IBC_2026_LIVE_Tournament%20(Published).xlsx';

const config = {
  tenantId: process.env.AZURE_TENANT_ID ?? '',
  clientId: process.env.AZURE_CLIENT_ID ?? '',
  clientSecret: process.env.AZURE_CLIENT_SECRET ?? '',
  /** Link to the workbook, as copied from the browser (query string is ignored). */
  fileUrl: process.env.SHAREPOINT_FILE_URL || DEFAULT_FILE_URL,
  port: Number(process.env.PORT ?? 8787),
  cacheMs: Number(process.env.CACHE_SECONDS ?? 30) * 1000,
};

const GRAPH = 'https://graph.microsoft.com/v1.0';
const CONTENT_TYPES: Record<string, string> = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8',
};
const DIST = resolve(import.meta.dirname, '..', 'dist');

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Without Azure credentials the server can only read links that work without a sign-in. */
const useGraph = () => missingConfig().length === 0;

function missingConfig(): string[] {
  const required: [string, string][] = [
    ['AZURE_TENANT_ID', config.tenantId],
    ['AZURE_CLIENT_ID', config.clientId],
    ['AZURE_CLIENT_SECRET', config.clientSecret],
  ];
  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  return missing;
}

// --- Microsoft Graph ------------------------------------------------------------------------

let token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt - 60_000) return token.value;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) {
    // Never echo the secret; Azure's error code is enough to diagnose.
    throw new HttpError(502, `Microsoft sign-in failed (${body.error ?? res.status}). Check the Azure app registration settings.`);
  }
  token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function graph(path: string): Promise<Response> {
  const res = await fetch(`${GRAPH}${path}`, { headers: { authorization: `Bearer ${await getToken()}` } });
  if (res.ok) return res;
  const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message;
  const hint =
    res.status === 401 || res.status === 403
      ? 'The app registration does not have read access to the SharePoint site.'
      : res.status === 404
        ? 'The workbook was not found — check SHAREPOINT_FILE_URL.'
        : '';
  throw new HttpError(502, `Microsoft Graph returned ${res.status}. ${hint}${detail ? ` (${detail})` : ''}`.trim());
}

let itemPath: string | null = null;

/** Graph path of the workbook's driveItem, resolved once. */
async function resolveItemPath(): Promise<string> {
  if (itemPath) return itemPath;
  let file;
  try {
    file = parseSharePointFileUrl(config.fileUrl);
  } catch (e) {
    throw new HttpError(500, (e as Error).message);
  }
  const { value: drives } = (await (
    await graph(`/sites/${file.hostname}:${file.sitePath}:/drives?$select=id,name,webUrl`)
  ).json()) as { value: { id: string; name: string; webUrl: string }[] };
  const located = locateInDrives(file, drives);
  if (!located) {
    throw new HttpError(
      502,
      `No document library in ${file.sitePath} contains ${file.filePath}. Libraries visible to the app: ${drives.map((d) => d.name).join(', ') || 'none'}.`,
    );
  }
  const path = located.pathInDrive.split('/').map(encodeURIComponent).join('/');
  itemPath = `/drives/${located.driveId}/root:${path}`;
  return itemPath;
}

interface CachedWorkbook {
  etag: string;
  fileName: string;
  /** HTTP date of the last change to the file in SharePoint, if known. */
  lastModified: string | null;
  body: Buffer;
  checkedAt: number;
}

let cache: CachedWorkbook | null = null;
let pending: Promise<CachedWorkbook> | null = null;

/**
 * Returns the workbook, contacting SharePoint at most once per CACHE_SECONDS (shared by all viewers).
 * Uses Microsoft Graph when Azure credentials are configured, otherwise the link itself.
 */
function getWorkbook(): Promise<CachedWorkbook> {
  if (cache && Date.now() - cache.checkedAt < config.cacheMs) return Promise.resolve(cache);
  pending ??= (async () => {
    try {
      return useGraph() ? await fetchViaGraph() : await fetchViaLink();
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Graph: the file content is only downloaded again when its content tag (cTag) changes. */
async function fetchViaGraph(): Promise<CachedWorkbook> {
  const meta = (await (
    await graph(`${await resolveItemPath()}?$select=id,name,cTag,lastModifiedDateTime,parentReference`)
  ).json()) as { id: string; name: string; cTag: string; lastModifiedDateTime?: string; parentReference: { driveId: string } };
  const lastModified = meta.lastModifiedDateTime ? new Date(meta.lastModifiedDateTime).toUTCString() : null;
  const etag = `"${createHash('sha1').update(meta.cTag).digest('hex')}"`;
  if (cache && cache.etag === etag) {
    cache.checkedAt = Date.now();
    return cache;
  }
  const content = await graph(`/drives/${meta.parentReference.driveId}/items/${meta.id}/content`);
  cache = { etag, fileName: meta.name, lastModified, body: Buffer.from(await content.arrayBuffer()), checkedAt: Date.now() };
  return cache;
}

/**
 * No credentials: download the link directly. This only works for "Anyone with the link" sharing
 * links; organisation-only links answer 401 or redirect to the Microsoft sign-in page instead.
 */
async function fetchViaLink(): Promise<CachedWorkbook> {
  const url = new URL(config.fileUrl);
  url.searchParams.set('download', '1');
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'follow' });
  } catch {
    throw new HttpError(502, 'SharePoint could not be reached from the tournament server.');
  }
  const body = Buffer.from(await res.arrayBuffer());
  const isWorkbook = body[0] === 0x50 && body[1] === 0x4b; // .xlsx files are ZIP archives
  if (!res.ok || !isWorkbook) {
    throw new HttpError(
      503,
      `The workbook link only works for signed-in 4flow users (SharePoint answered ${res.status}), so the server cannot open it. ` +
        'Either share the workbook as "Anyone with the link" and set that link as SHAREPOINT_FILE_URL in server/.env, ' +
        'or have an administrator add an Azure app registration (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET) to server/.env.',
    );
  }
  const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
  if (cache && cache.etag === etag) {
    cache.checkedAt = Date.now();
    return cache;
  }
  const disposition = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(res.headers.get('content-disposition') ?? '');
  const fileName = decodeURIComponent(disposition?.[1] ?? url.pathname.split('/').pop() ?? 'workbook.xlsx');
  cache = { etag, fileName, lastModified: res.headers.get('last-modified'), body, checkedAt: Date.now() };
  return cache;
}

// --- HTTP -------------------------------------------------------------------------------------

async function handleWorkbook(req: IncomingMessage, res: ServerResponse) {
  const wb = await getWorkbook();
  const headers: Record<string, string> = { etag: wb.etag, 'cache-control': 'no-cache' };
  if (wb.lastModified) headers['last-modified'] = wb.lastModified;
  if (req.headers['if-none-match'] === wb.etag) {
    res.writeHead(304, headers).end();
    return;
  }
  res
    .writeHead(200, {
      ...headers,
      'content-type': CONTENT_TYPES[extname(wb.fileName).toLowerCase()] ?? 'application/octet-stream',
      'content-length': wb.body.length,
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(wb.fileName)}`,
    })
    .end(wb.body);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

async function serveStatic(pathname: string, res: ServerResponse) {
  const target = resolve(DIST, `.${decodeURIComponent(pathname)}`);
  const inside = target === DIST || target.startsWith(DIST + sep);
  // Tournament data is only ever served through /api/workbook, never as static files.
  const file = inside && !(extname(target).toLowerCase() in CONTENT_TYPES) && (await isFile(target)) ? target : join(DIST, 'index.html');
  if (!(await isFile(file))) return sendJson(res, 404, { error: 'Not found. Run "npm run build" to serve the dashboard from this server.' });
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
}

async function isFile(path: string) {
  return stat(path).then((s) => s.isFile(), () => false);
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });
    if (pathname === '/api/workbook') return await handleWorkbook(req, res);
    if (pathname === '/api/health') return sendJson(res, 200, { ok: true, mode: useGraph() ? 'graph' : 'link' });
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
    return await serveStatic(pathname, res);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (!(e instanceof HttpError)) console.error(e);
    return sendJson(res, status, { error: e instanceof HttpError ? e.message : 'Unexpected server error.' });
  }
}).listen(config.port, () => {
  console.log(`Tournament server listening on http://localhost:${config.port}`);
  if (!useGraph()) {
    console.warn('No Azure credentials: reading SHAREPOINT_FILE_URL directly (works only for "Anyone with the link" links).');
  }
});
