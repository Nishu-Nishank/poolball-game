import { lazy, Suspense } from 'react';
import { CircularProgress } from '@mui/material';
import DashboardPage from './pages/DashboardPage';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAccess } from './admin/RequireAccess';
import { useRoute } from './router';

// Admin screens are loaded on demand so public visitors download only the dashboard.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AdminUploadPage = lazy(() => import('./pages/AdminUploadPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));

const fallback = (
  <div className="grid min-h-screen place-items-center" aria-busy="true">
    <CircularProgress aria-label="Loading" />
  </div>
);

export default function App() {
  const route = useRoute();
  return (
    <AuthProvider>
      <Suspense fallback={fallback}>
        {route === 'dashboard' && <DashboardPage />}
        {route === 'login' && <LoginPage />}
        {route === 'admin' && (
          <RequireAccess route="admin" title="Upload results">
            <AdminUploadPage />
          </RequireAccess>
        )}
        {route === 'users' && (
          <RequireAccess route="users" title="User management">
            <UserManagementPage />
          </RequireAccess>
        )}
      </Suspense>
    </AuthProvider>
  );
}
