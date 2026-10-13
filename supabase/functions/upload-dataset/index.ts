// Supabase Edge Function: validates and publishes tournament uploads. See ../_shared/uploadHandler.ts.
import { createClient } from '@supabase/supabase-js';
import { handleUploadRequest } from '../_shared/uploadHandler.ts';
import { supabaseUploadDeps } from '../_shared/supabaseUploadDeps.ts';

// Injected automatically by Supabase; never exposed to clients.
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const config = {
  maxBytes: Number(Deno.env.get('MAX_UPLOAD_BYTES') ?? 5 * 1024 * 1024),
  allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((o) => o.trim()).filter(Boolean),
};

const deps = supabaseUploadDeps(admin);

Deno.serve((req) => handleUploadRequest(req, deps, config));
