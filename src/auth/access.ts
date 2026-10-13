import type { RouteId } from '../router';

export type Role = 'admin' | 'superadmin';

/**
 * Client-side route guard. This only decides what to *show*: every privileged operation is
 * authorized again by the database functions / Edge Function, so bypassing it gains nothing.
 */
export function routeAccess(route: RouteId, auth: { signedIn: boolean; role: Role | null }): 'allow' | 'login' | 'forbidden' {
  switch (route) {
    case 'dashboard':
    case 'login':
      return 'allow';
    case 'admin':
      if (!auth.signedIn) return 'login';
      return auth.role ? 'allow' : 'forbidden';
    case 'users':
      if (!auth.signedIn) return 'login';
      return auth.role === 'superadmin' ? 'allow' : 'forbidden';
  }
}

/** Turns Supabase Auth errors into messages that help the user without revealing account details. */
export function friendlyAuthError(error: { message?: string; status?: number; code?: string } | null | undefined): string {
  const message = (error?.message ?? '').toLowerCase();
  if (error?.status === 429 || message.includes('rate limit') || error?.code === 'over_email_send_rate_limit') {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (error?.code === 'otp_expired' || message.includes('token has expired') || message.includes('otp')) {
    return 'The sign-in link or code is invalid or has expired. Request a new email.';
  }
  if (message.includes('api key') || message.includes('apikey')) {
    return 'The app is not connected to Supabase correctly: check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env, then restart the app.';
  }
  if (message.includes('fetch') || message.includes('network')) {
    return 'The sign-in service could not be reached. Check your connection and try again.';
  }
  // Unknown problem: show Supabase's own message so it can be diagnosed.
  return error?.message ? `Sign-in failed: ${error.message}` : 'Sign-in failed. Please try again.';
}
