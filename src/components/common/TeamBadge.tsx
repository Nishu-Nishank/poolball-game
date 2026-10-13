import { Box } from '@mui/material';
import type { Team } from '../../types/tournament';
import { colors } from '../../theme';

const sizes = { sm: 28, md: 36, lg: 56 } as const;

/** Scoreboard-style number tile, used where a cricket table would show a flag. */
export function TeamBadge({ team, size = 'md' }: { team: Team; size?: keyof typeof sizes }) {
  const text = team.number ?? initials(team.name);
  const px = sizes[size];
  return (
    <Box
      aria-hidden
      sx={{
        minWidth: px,
        height: px,
        px: 0.75,
        borderRadius: 1.5,
        bgcolor: colors.navy,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size === 'lg' ? '1.25rem' : size === 'sm' ? '0.75rem' : '0.875rem',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
      }}
    >
      {team.number ? `#${text}` : text}
    </Box>
  );
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
