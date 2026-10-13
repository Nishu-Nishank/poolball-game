import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Tolerate copy/paste variations: whitespace, quotes and a trailing slash would otherwise produce
// malformed request URLs ("Invalid path specified in request URL").
const clean = (value: string | undefined) => (value ?? '').trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');

const url = clean(import.meta.env.VITE_SUPABASE_URL);
// The publishable (anon) key is safe in the browser: every table is protected by RLS and all
// privileged work happens in database functions or the Edge Function.
const key = clean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) || clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url)) {
  console.warn(`VITE_SUPABASE_URL looks wrong: "${url}". Expected the API URL, e.g. https://<project-ref>.supabase.co`);
}

/** Null when Supabase is not configured (e.g. local CSV development); admin features are then hidden. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

export const publishableKey = key ?? null;

export const functionsUrl = url ? `${url}/functions/v1` : null;
