import { AppBar, Chip, IconButton, Toolbar, Tooltip, Typography } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LoginIcon from '@mui/icons-material/Login';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { formatDateTime } from '../../utils/format';
import { useAuth } from '../../auth/AuthContext';
import { linkProps } from '../../router';

interface Props {
  tournamentStatus: string | null;
  sourceLabel: string;
  lastUpdated: Date | null;
}

export function Header({ tournamentStatus, sourceLabel, lastUpdated }: Props) {
  const auth = useAuth();
  // Public viewers get a discreet sign-in link; signed-in administrators get a link to the admin area.
  const adminLink = auth.role
    ? { route: 'admin' as const, label: 'Admin', icon: <AdminPanelSettingsIcon /> }
    : { route: 'login' as const, label: 'Sign in', icon: <LoginIcon /> };
  return (
    <AppBar position="static" color="primary">
      <Toolbar className="mx-auto w-full max-w-7xl flex-wrap gap-x-4 gap-y-2 !px-4 py-3 sm:!px-6">
        <EmojiEventsIcon sx={{ color: '#fbbf24', fontSize: 32 }} aria-hidden />
        <div className="min-w-[200px] flex-1">
          <Typography variant="h1" component="h1" sx={{ fontSize: { xs: '1.125rem', sm: '1.375rem' } }}>
            4flow India 8-Ball Championship 2026
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)' }}>
            Tournament standings · {sourceLabel}
          </Typography>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {tournamentStatus && (
            <Chip
              label={tournamentStatus}
              size="small"
              sx={{ bgcolor: 'rgba(255,255,255,0.14)', color: '#fff' }}
            />
          )}
          <HeaderStat
            label="Last updated"
            value={formatDateTime(lastUpdated)}
            title="When the tournament results last changed"
          />
          <Tooltip title={adminLink.route === 'admin' ? 'Administration' : 'Administrator sign in'}>
            <IconButton
              component="a"
              {...linkProps(adminLink.route)}
              aria-label={adminLink.label}
              sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
            >
              {adminLink.icon}
            </IconButton>
          </Tooltip>
        </div>
      </Toolbar>
    </AppBar>
  );
}

function HeaderStat({ label, value, title }: { label: string; value: string; title: string }) {
  return (
    <div className="text-right leading-tight" title={title} aria-live="polite">
      <Typography variant="caption" component="div" sx={{ color: 'rgba(255,255,255,0.65)' }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" className="tabular-nums whitespace-nowrap" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </div>
  );
}
