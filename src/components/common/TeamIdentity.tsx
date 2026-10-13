import { Typography } from '@mui/material';
import type { Team } from '../../types/tournament';
import { teamLabel } from '../../utils/leaderboard';
import { TeamBadge } from './TeamBadge';

interface Props {
  team: Team;
  /** Show the team name under the label (used where there is no separate name column). */
  showName?: boolean;
  showMembers?: boolean;
  size?: 'sm' | 'md';
}

/** Team number with members stacked underneath — the primary way teams are shown. */
export function TeamIdentity({ team, showName = false, showMembers = true, size = 'md' }: Props) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <TeamBadge team={team} size={size} />
      <div className="min-w-0">
        <Typography component="div" sx={{ fontWeight: 700, fontSize: size === 'sm' ? '0.875rem' : '0.9375rem', lineHeight: 1.3 }}>
          {teamLabel(team)}
        </Typography>
        {showName && team.number && team.name && (
          <Typography component="div" variant="body2" noWrap sx={{ fontWeight: 500 }}>
            {team.name}
          </Typography>
        )}
        {showMembers &&
          (team.members.length > 0 ? (
            team.members.map((m) => (
              <Typography key={m.name} component="div" variant="body2" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                {m.name}
              </Typography>
            ))
          ) : (
            <Typography component="div" variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
              Members not listed
            </Typography>
          ))}
      </div>
    </div>
  );
}
