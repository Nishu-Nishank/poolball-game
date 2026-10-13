/**
 * UploadDeps backed by Supabase, using the service-role client. Runs only inside the Edge
 * Function; the service-role key comes from the function environment and never reaches a browser.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role, UploadDeps } from './uploadHandler.ts';

export const UPLOAD_BUCKET = 'tournament-uploads';

export function supabaseUploadDeps(admin: SupabaseClient): UploadDeps {
  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };

  return {
    async getUser(token) {
      // Validates the token with Supabase Auth (signature, expiry, user still exists).
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user?.email) return null;
      return { id: data.user.id, email: data.user.email };
    },

    async resolveRole(userId) {
      const { data, error } = await admin.rpc('resolve_admin', { p_user_id: userId });
      fail('resolve_admin', error);
      return data === 'admin' || data === 'superadmin' ? (data as Role) : null;
    },

    async createUpload(record) {
      const { data, error } = await admin.from('uploads').insert(record).select('id').single();
      fail('create upload', error);
      return (data as { id: string }).id;
    },

    async setStoragePath(uploadId, path) {
      const { error } = await admin.from('uploads').update({ storage_path: path }).eq('id', uploadId);
      fail('set storage path', error);
    },

    async storeOriginal(path, bytes, contentType) {
      const { error } = await admin.storage.from(UPLOAD_BUCKET).upload(path, bytes, { contentType, upsert: false });
      fail('store original file', error);
    },

    async finishUpload(uploadId, patch) {
      const { error } = await admin.from('uploads').update(patch).eq('id', uploadId).eq('status', 'processing');
      fail('finish upload', error);
    },

    async publish(uploadId, data, summary, actorId) {
      const { data: publishedAt, error } = await admin.rpc('publish_dataset', {
        p_upload_id: uploadId,
        p_data: data,
        p_summary: summary,
        p_actor: actorId,
      });
      fail('publish dataset', error);
      return publishedAt as string;
    },

    async audit(actorId, action, target, details) {
      const { error } = await admin.rpc('audit', { p_actor: actorId, p_action: action, p_target: target, p_details: details });
      fail('audit', error);
    },
  };
}
