import type { ReactNode } from 'react';
import { AppBar, Button, Toolbar, Typography } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../auth/AuthContext';
import { linkProps, navigate, useRoute, type RouteId } from '../router';

const NAV: { route: RouteId; label: string; superadminOnly?: boolean }[] = [
  { route: 'dashboard', label: 'Dashboard' },
  { route: 'admin', label: 'Upload results' },
  { route: 'users', label: 'User management', superadminOnly: true },
];

/** Shell for the administrator screens, matching the dashboard's header styling. */
export function AdminLayout({ title, children }: { title: string; children: ReactNode }) {
  const auth = useAuth();
  const current = useRoute();

  return (
    <div className="min-h-screen">
      <AppBar position="static" color="primary">
        <Toolbar className="mx-auto w-full max-w-7xl flex-wrap gap-x-4 gap-y-2 !px-4 py-3 sm:!px-6">
          <EmojiEventsIcon sx={{ color: '#fbbf24', fontSize: 28 }} aria-hidden />
          <div className="min-w-[200px] flex-1">
            <Typography variant="h1" component="p" sx={{ fontSize: { xs: '1rem', sm: '1.125rem' } }}>
              4flow India 8-Ball Championship 2026
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)' }}>
              Administration
            </Typography>
          </div>
          {auth.session && (
            <div className="ml-auto flex items-center gap-3">
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }} className="hidden sm:block">
                {auth.email}
                {auth.role && ` · ${auth.role === 'superadmin' ? 'Superadmin' : 'Admin'}`}
              </Typography>
              <Button
                size="small"
                startIcon={<LogoutIcon />}
                onClick={async () => {
                  await auth.signOut();
                  navigate('dashboard');
                }}
                sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
              >
                Sign out
              </Button>
            </div>
          )}
        </Toolbar>
        <nav aria-label="Administration" className="bg-white/5">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 sm:px-4">
            {NAV.filter((n) => !n.superadminOnly || auth.role === 'superadmin').map((n) => (
              <Button
                key={n.route}
                component="a"
                {...linkProps(n.route)}
                aria-current={current === n.route ? 'page' : undefined}
                sx={{
                  color: '#fff',
                  borderRadius: 0,
                  py: 1.25,
                  borderBottom: current === n.route ? '3px solid #fbbf24' : '3px solid transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                {n.label}
              </Button>
            ))}
          </div>
        </nav>
      </AppBar>
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-5 sm:px-6">
        <Typography variant="h1" component="h1">
          {title}
        </Typography>
        {children}
      </main>
    </div>
  );
}
