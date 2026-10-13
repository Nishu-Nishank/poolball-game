/**
 * Calls to the privileged backend. These are convenience wrappers only: every function checks the
 * caller's role on the server (database functions / Edge Function), whatever the UI shows.
 */
import { functionsUrl, publishableKey, supabase } from '../lib/supabase';
import type { ImportIssue, ImportSummary } from '../services/importValidation';

export const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB ?? 5) || 5;

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw new Error(error.message || 'The request failed.');
  return data as T;
}

// --- Uploads ------------------------------------------------------------------------------------

export interface UploadHistoryRow {
  id: string;
  file_name: string;
  file_format: string;
  file_size: number;
  status: 'processing' | 'rejected' | 'failed' | 'published';
  uploaded_at: string;
  completed_at: string | null;
  team_count: number | null;
  match_count: number | null;
  validation_summary: ImportSummary | null;
  error_summary: ImportIssue[] | null;
  became_active: boolean;
  is_active: boolean;
  /** Only returned to the superadmin. */
  uploaded_by_email: string | null;
  /** Uploaded by the signed-in user (admins may delete only these). */
  is_mine: boolean;
}

export const getUploadHistory = (limit = 50) => rpc<UploadHistoryRow[]>('get_upload_history', { p_limit: limit });

/** Makes a previously published upload the live dataset again. Returns its original publication time. */
export const activateUpload = (uploadId: string) => rpc<string>('activate_upload_api', { p_upload_id: uploadId });

/** Deletes an upload, its dataset and the stored file (server-side checks: not live, own uploads for admins). */
export async function deleteUpload(uploadId: string): Promise<void> {
  const { data } = await client().auth.getSession();
  const token = data.session?.access_token;
  if (!token || !functionsUrl) throw new Error('Your session has expired. Please sign in again.');
  let res: Response;
  try {
    res = await fetch(`${functionsUrl}/upload-dataset`, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(publishableKey && { apikey: publishableKey }),
      },
      body: JSON.stringify({ uploadId }),
    });
  } catch {
    throw new Error('The upload service could not be reached. Check your connection and try again.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `The upload could not be deleted (HTTP ${res.status}).`);
  }
}

export interface PreviewTeam {
  id: string;
  label: string;
  name: string | null;
  group: string | null;
  members: string[];
}

export interface PreviewMatch {
  id: string | null;
  row: number;
  group: string | null;
  teamA: string;
  teamB: string;
  winner: string | null;
  ballsLost: number | null;
  points: number;
  state: 'counted' | 'pending' | 'flagged' | 'duplicate';
  reasons: string[];
}

export interface UploadResponse {
  mode?: 'preview' | 'publish';
  ok?: boolean;
  error?: string;
  summary?: ImportSummary;
  errors?: ImportIssue[];
  warnings?: ImportIssue[];
  errorCount?: number;
  teams?: PreviewTeam[];
  matches?: PreviewMatch[];
  uploadId?: string;
  publishedAt?: string;
}

/** Sends the file to the upload-dataset Edge Function. "preview" never changes anything. */
export async function sendUpload(file: File, mode: 'preview' | 'publish'): Promise<{ status: number; body: UploadResponse }> {
  const { data } = await client().auth.getSession();
  const token = data.session?.access_token;
  if (!token || !functionsUrl) throw new Error('Your session has expired. Please sign in again.');

  const form = new FormData();
  form.append('file', file);
  form.append('mode', mode);
  let res: Response;
  try {
    res = await fetch(`${functionsUrl}/upload-dataset`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, ...(publishableKey && { apikey: publishableKey }) },
      body: form,
    });
  } catch {
    throw new Error('The upload service could not be reached. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => ({ error: `Unexpected response from the server (HTTP ${res.status}).` }))) as UploadResponse;
  return { status: res.status, body };
}

// --- Administrators (superadmin) -----------------------------------------------------------------

export interface AdminRow {
  id: string;
  email: string;
  role: 'admin' | 'superadmin';
  status: 'active' | 'removed';
  pending_email: string | null;
  is_linked: boolean;
  created_at: string;
  created_by_email: string | null;
  updated_at: string;
  updated_by_email: string | null;
  claimed_at: string | null;
  last_sign_in_at: string | null;
}

export const listAdmins = () => rpc<AdminRow[]>('admin_list');
export const addAdmin = (email: string) => rpc<string>('admin_add', { p_email: email });
/** Returns 'changed' (not yet linked), 'pending' (awaiting verification of the new address) or 'unchanged'. */
export const updateAdminEmail = (id: string, email: string) =>
  rpc<'changed' | 'pending' | 'unchanged'>('admin_update_email', { p_id: id, p_new_email: email });
export const cancelEmailChange = (id: string) => rpc<void>('admin_cancel_email_change', { p_id: id });
export const removeAdmin = (id: string) => rpc<void>('admin_remove', { p_id: id });

export const isValidEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
