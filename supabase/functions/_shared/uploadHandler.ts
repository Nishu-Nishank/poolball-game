/**
 * Upload endpoint logic, independent of Deno so it can be unit-tested with fake dependencies.
 *
 *   POST multipart/form-data   file=<.csv|.xlsx|.xls>   mode=preview|publish
 *   Authorization: Bearer <Supabase access token of the signed-in user>
 *
 * Every request re-verifies the token with Supabase Auth and the caller's role in the database —
 * nothing from the client (UI state, claims, form fields) is trusted for authorization.
 * "preview" has no side effects. "publish" records the upload, stores the original file privately
 * and, only if validation passes, publishes the dataset in one database transaction.
 */
import { checkUploadFile, DEFAULT_MAX_UPLOAD_BYTES, validateImport, type ImportIssue, type ImportSummary } from './tournament/services/importValidation.ts';
import { encodeDataset } from './tournament/services/datasetCodec.ts';
import type { EvaluatedMatch, FileFormat, Team } from './tournament/types/tournament.ts';

export type Role = 'admin' | 'superadmin';

export interface UploadRecord {
  file_name: string;
  file_format: FileFormat;
  file_size: number;
  uploaded_by: string;
  uploaded_by_email: string;
}

export interface UploadPatch {
  status: 'rejected' | 'failed';
  storage_path?: string | null;
  completed_at: string;
  team_count?: number | null;
  match_count?: number | null;
  validation_summary?: unknown;
  error_summary?: unknown;
}

export interface UploadDeps {
  /** Verifies the access token with Supabase Auth; null when invalid or expired. */
  getUser(token: string): Promise<{ id: string; email: string } | null>;
  /** Current role from the database (public.resolve_admin), null when not an active admin. */
  resolveRole(userId: string): Promise<Role | null>;
  createUpload(record: UploadRecord): Promise<string>;
  setStoragePath(uploadId: string, path: string): Promise<void>;
  storeOriginal(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  finishUpload(uploadId: string, patch: UploadPatch): Promise<void>;
  /** public.publish_dataset — atomic; returns the publication time (UTC ISO string). */
  publish(uploadId: string, data: unknown, summary: ImportSummary, actorId: string): Promise<string>;
  audit(actorId: string, action: string, target: string, details: unknown): Promise<void>;
  /** public.delete_upload — authorizes and deletes the rows; returns the storage path of the file. */
  deleteUpload(uploadId: string, actorId: string): Promise<string | null>;
  removeStored(path: string): Promise<void>;
}

export interface UploadConfig {
  maxBytes: number;
  /** Origins allowed to call the function from a browser; ['*'] allows any (auth is token-based). */
  allowedOrigins: string[];
}

export const DEFAULT_UPLOAD_CONFIG: UploadConfig = { maxBytes: DEFAULT_MAX_UPLOAD_BYTES, allowedOrigins: ['*'] };

const MAX_LISTED_ISSUES = 200;
const CONTENT_TYPES: Record<FileFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
};

export async function handleUploadRequest(req: Request, deps: UploadDeps, config: UploadConfig = DEFAULT_UPLOAD_CONFIG) {
  const cors = corsHeaders(req, config);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST' && req.method !== 'DELETE') return json(405, { error: 'Method not allowed.' });

  // --- Authentication and authorization (always server-side) ---------------------------------
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  const user = token ? await deps.getUser(token) : null;
  if (!user) return json(401, { error: 'Please sign in again.' });
  const role = await deps.resolveRole(user.id);
  if (!role) return json(403, { error: 'Your account is not authorized to upload tournament data.' });

  // --- Delete an upload (record, dataset and stored file) ------------------------------------
  if (req.method === 'DELETE') {
    const body = (await req.json().catch(() => null)) as { uploadId?: unknown } | null;
    const uploadId = typeof body?.uploadId === 'string' ? body.uploadId : '';
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) return json(400, { error: 'No upload was specified.' });
    let path: string | null;
    try {
      // The database function enforces: not the live dataset; admins only their own uploads.
      path = await deps.deleteUpload(uploadId, user.id);
    } catch (e) {
      const message = e instanceof Error ? e.message.replace(/^[^:]*: /, '') : 'The upload could not be deleted.';
      return json(/cannot be deleted|only delete|not found/i.test(message) ? 403 : 500, { error: message });
    }
    let fileRemoved = true;
    if (path) {
      try {
        await deps.removeStored(path);
      } catch {
        fileRemoved = false; // record is gone; an orphaned file in the private bucket is harmless
      }
    }
    return json(200, { deleted: uploadId, fileRemoved });
  }

  // --- File checks ---------------------------------------------------------------------------
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > config.maxBytes + 64 * 1024) return json(413, { error: tooLarge(config.maxBytes) });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: 'Send the file as multipart/form-data.' });
  }
  const file = form.get('file');
  const mode = form.get('mode') === 'publish' ? 'publish' : 'preview';
  if (!(file instanceof File)) return json(400, { error: 'No file was provided.' });
  if (file.size > config.maxBytes) return json(413, { error: tooLarge(config.maxBytes) });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkUploadFile(file.name, bytes, config.maxBytes);
  if (!check.ok) return json(400, { error: check.error });

  const validation = validateImport({ data: bytes.slice().buffer, fileName: file.name, format: check.format });
  const report = {
    ok: validation.ok,
    summary: validation.summary,
    errors: validation.errors.slice(0, MAX_LISTED_ISSUES),
    warnings: validation.warnings.slice(0, MAX_LISTED_ISSUES),
    errorCount: validation.errors.length,
  };

  if (mode === 'preview') {
    return json(200, {
      mode,
      ...report,
      teams: (validation.data?.teams ?? []).map(previewTeam),
      matches: validation.matches.map((m) => previewMatch(m, validation.data?.teams ?? [])),
    });
  }

  // --- Publish -------------------------------------------------------------------------------
  let uploadId: string;
  try {
    uploadId = await deps.createUpload({
      file_name: file.name.slice(0, 255),
      file_format: check.format,
      file_size: bytes.length,
      uploaded_by: user.id,
      uploaded_by_email: user.email,
    });
  } catch {
    return json(500, { error: 'The upload could not be recorded. Nothing was changed.' });
  }

  const finish = (patch: Omit<UploadPatch, 'completed_at'>) =>
    deps.finishUpload(uploadId, { ...patch, completed_at: new Date().toISOString() });

  try {
    const path = `${uploadId}/${safeFileName(file.name)}`;
    await deps.storeOriginal(path, bytes, CONTENT_TYPES[check.format]);
    await deps.setStoragePath(uploadId, path);

    if (!validation.ok || !validation.data) {
      await finish({
        status: 'rejected',
        validation_summary: validation.summary,
        error_summary: report.errors,
        team_count: validation.summary.teams,
        match_count: validation.summary.matches,
      });
      await deps.audit(user.id, 'upload_rejected', uploadId, { file_name: file.name, errors: validation.errors.length });
      return json(422, { mode, uploadId, ...report });
    }

    const publishedAt = await deps.publish(uploadId, encodeDataset(validation.data), validation.summary, user.id);
    return json(200, { mode, uploadId, publishedAt, ...report });
  } catch (e) {
    // The active dataset is untouched: publication is a single transaction that either fully
    // succeeds or does not happen.
    const message = e instanceof Error ? e.message : String(e);
    await finish({ status: 'failed', error_summary: [{ message }] }).catch(() => undefined);
    await deps.audit(user.id, 'upload_failed', uploadId, { file_name: file.name, message }).catch(() => undefined);
    return json(500, { error: 'Publishing failed. The previously published results are still live.', uploadId });
  }
}

function corsHeaders(req: Request, config: UploadConfig): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin);
  return {
    ...(allowed && origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
    'access-control-allow-methods': 'POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const tooLarge = (max: number) => `The file is too large; the maximum is ${(max / 1024 / 1024).toFixed(1)} MB.`;

/** Keeps storage keys predictable: letters, digits, dot, dash, underscore, parentheses. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.\-()]+/g, '_').replace(/\.{2,}/g, '.').replace(/^[._]+/, '');
  return (cleaned || 'upload').slice(-120);
}

function label(team: Pick<Team, 'number' | 'name'> | undefined, fallback: string): string {
  if (!team) return fallback || '—';
  return team.number ? `Team #${team.number}` : (team.name ?? fallback);
}

function previewTeam(t: Team) {
  return { id: t.id, label: label(t, t.id), name: t.name, group: t.group, members: t.members.map((m) => m.name) };
}

function previewMatch(m: EvaluatedMatch, teams: Team[]) {
  const find = (id: string | null) => teams.find((t) => t.id === id);
  return {
    id: m.hasWorkbookId ? m.id : null,
    row: m.source.row,
    group: m.group,
    teamA: label(find(m.teamA), m.teamARaw),
    teamB: label(find(m.teamB), m.teamBRaw),
    winner: m.winner ? label(find(m.winner), m.winnerRaw) : null,
    ballsLost: m.ballsLost,
    points: m.points,
    state: m.state,
    reasons: m.reasons,
  };
}

export type { ImportIssue, ImportSummary };
