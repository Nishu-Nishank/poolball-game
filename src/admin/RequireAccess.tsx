import { useEffect, type ReactNode } from 'react';
import { Alert, AlertTitle, Button, CircularProgress } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { routeAccess } from '../auth/access';
import { navigate, type RouteId } from '../router';
import { AdminLayout } from './AdminLayout';

/**
 * Shows a protected screen only to the right role. This is a convenience for the UI — the data
 * behind these screens is protected by the database and the Edge Function, not by this check.
 */
export function RequireAccess({ route, title, children }: { route: RouteId; title: string; children: ReactNode }) {
  const auth = useAuth();
  const decision = auth.loading ? null : routeAccess(route, { signedIn: auth.session !== null, role: auth.role });

  useEffect(() => {
    if (decision === 'login') navigate('login', { replace: true });
  }, [decision]);

  if (!auth.configured) {
    return (
      <AdminLayout title={title}>
        <Alert severity="info">
          Administration is not available: Supabase is not configured for this deployment (see README, “Deployment”).
        </Alert>
      </AdminLayout>
    );
  }
  if (decision === null || decision === 'login') {
    return (
      <div className="grid min-h-screen place-items-center" aria-busy="true">
        <CircularProgress aria-label="Checking access" />
      </div>
    );
  }
  if (decision === 'forbidden') {
    return (
      <AdminLayout title={title}>
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={() => navigate(auth.role ? 'admin' : 'dashboard')}>
              {auth.role ? 'Go to uploads' : 'Back to dashboard'}
            </Button>
          }
        >
          <AlertTitle>No access</AlertTitle>
          {auth.role
            ? 'Only the superadmin can manage administrators.'
            : `${auth.email ?? 'This account'} is not an authorized administrator. Ask the superadmin to add this email address, then sign in again.`}
        </Alert>
      </AdminLayout>
    );
  }
  return <AdminLayout title={title}>{children}</AdminLayout>;
}
