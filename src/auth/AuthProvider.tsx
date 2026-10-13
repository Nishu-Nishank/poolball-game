import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AuthContext, type AuthState } from './AuthContext';
import { friendlyAuthError, type Role } from './access';

/**
 * Supabase email-OTP session plus the caller's role from the database (public.get_my_access).
 * The role is fetched per user id and refreshed on window focus, so a revoked admin loses the
 * admin screens without reloading. It is never trusted for authorization — the server re-checks.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(!supabase);
  const [access, setAccess] = useState<{ userId: string; role: Role | null } | null>(null);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const fetchRole = useCallback((forUser: string): Promise<Role | null> => {
    if (!supabase) return Promise.resolve(null);
    return Promise.resolve(supabase.rpc('get_my_access')).then(({ data, error }) => {
      const role = error ? null : ((data as { role: Role }[] | null)?.[0]?.role ?? null);
      setAccess({ userId: forUser, role });
      return role;
    });
  }, []);

  const refreshAccess = useCallback(async () => (userId ? fetchRole(userId) : null), [userId, fetchRole]);

  useEffect(() => {
    if (!userId) return;
    void fetchRole(userId);
    const onFocus = () => void fetchRole(userId);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [userId, fetchRole]);

  const value = useMemo<AuthState>(() => {
    const role = userId && access?.userId === userId ? access.role : null;
    return {
      configured: supabase !== null,
      loading: !sessionReady || (userId !== null && access?.userId !== userId),
      session,
      email: session?.user.email ?? null,
      role,
      refreshAccess,
      async sendCode(email) {
        if (!supabase) throw new Error('Sign-in is not configured.');
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          // Any address receives a code, so the response never reveals who is registered.
          // An account alone grants nothing: privileges come only from an admin record.
          options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/login` },
        });
        if (error) throw new Error(friendlyAuthError(error));
      },
      async verifyCode(email, code) {
        if (!supabase) throw new Error('Sign-in is not configured.');
        const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
        if (error || !data.user) throw new Error(friendlyAuthError(error));
        return fetchRole(data.user.id);
      },
      async signOut() {
        if (!supabase) return;
        await supabase.auth.signOut();
        setAccess(null);
      },
    };
  }, [session, sessionReady, access, userId, refreshAccess, fetchRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
