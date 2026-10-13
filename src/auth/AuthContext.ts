import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Role } from './access';

export interface AuthState {
  /** False when Supabase is not configured: admin features are hidden entirely. */
  configured: boolean;
  /** True while the session or the role is being resolved. */
  loading: boolean;
  session: Session | null;
  email: string | null;
  /** Role as last confirmed by the database. Only used for display; the server re-checks every action. */
  role: Role | null;
  /** Re-checks the role with the database (e.g. after an admin was removed). */
  refreshAccess: () => Promise<Role | null>;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<Role | null>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>.');
  return auth;
}
