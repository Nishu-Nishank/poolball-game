import type { ReactNode } from 'react';
import { Paper, Typography } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import SportsScoreIcon from '@mui/icons-material/SportsScore';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import type { EvaluatedMatch, KnockoutMatch, TeamStanding } from '../../types/tournament';
import { teamLabel } from '../../utils/leaderboard';
import { colors } from '../../theme';

interface Props {
  standings: TeamStanding[];
  matches: EvaluatedMatch[];
  knockout?: KnockoutMatch[];
}

export function SummaryCards({ standings, matches, knockout = [] }: Props) {
  const playedKnockout = knockout.filter((m) => m.state === 'played').length;
  const counted = matches.filter((m) => m.state === 'counted').length + playedKnockout;
  const recorded = matches.filter((m) => m.state !== 'duplicate').length + knockout.length;
  // Standings already combine group and knockout points.
  const totalPoints = standings.reduce((sum, s) => sum + s.points, 0);
  const leader = standings[0];
  const hasLeader = leader && leader.points > 0;
  const tiedOnPoints = hasLeader ? standings.filter((s) => s.points === leader.points).length - 1 : 0;

  return (
    <section aria-label="Tournament summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <StatCard icon={<GroupsIcon />} label="Total teams" value={standings.length} />
      <StatCard
        icon={<SportsScoreIcon />}
        label="Completed matches"
        value={counted}
        note={`of ${recorded} recorded${playedKnockout > 0 ? ` · incl. ${playedKnockout} knockout` : ''}`}
      />
      <StatCard icon={<AddCircleOutlineIcon />} label="Points awarded" value={totalPoints} accent />
      <StatCard
        icon={<EmojiEventsIcon />}
        label="Current leader"
        value={hasLeader ? teamLabel(leader.team) : '—'}
        note={
          hasLeader
            ? `${leader.points} pts${leader.team.number && leader.team.name ? ` · ${leader.team.name}` : ''}${
                tiedOnPoints > 0 ? ` · level on points with ${tiedOnPoints} other${tiedOnPoints > 1 ? 's' : ''}` : ''
              }`
            : 'No completed matches yet'
        }
        compactValue
      />
    </section>
  );
}

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  note?: string;
  accent?: boolean;
  compactValue?: boolean;
}

function StatCard({ icon, label, value, note, accent, compactValue }: StatCardProps) {
  return (
    <Paper className="flex min-w-0 flex-col gap-1 p-4">
      <div className="flex items-center gap-2" style={{ color: colors.muted }}>
        <span className="flex text-[20px] [&>svg]:text-[20px]" aria-hidden>
          {icon}
        </span>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
      </div>
      <Typography
        component="div"
        className="tabular-nums truncate"
        sx={{
          fontWeight: 800,
          fontSize: compactValue ? { xs: '1.25rem', sm: '1.5rem' } : { xs: '1.75rem', sm: '2rem' },
          lineHeight: 1.2,
          color: accent ? colors.win : 'text.primary',
        }}
      >
        {value}
      </Typography>
      {note && (
        <Typography variant="body2" color="text.secondary" className="truncate" title={note}>
          {note}
        </Typography>
      )}
    </Paper>
  );
}
