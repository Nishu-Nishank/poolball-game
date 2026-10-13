import { useMemo } from 'react';
import { Typography } from '@mui/material';
import type { EvaluatedMatch, Team } from '../../types/tournament';
import { buildStandings } from '../../utils/leaderboard';
import { Leaderboard } from '../Leaderboard/Leaderboard';

interface Props {
  teams: Team[];
  matches: EvaluatedMatch[];
  onSelectTeam: (teamId: string) => void;
}

/** One cricket-style table per group, ranked within the group by the same rules as the overall table. */
export function GroupStandings({ teams, matches, onSelectTeam }: Props) {
  const groups = useMemo(() => {
    const names = [...new Set(teams.map((t) => t.group).filter((g): g is string => !!g))];
    names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return names.map((group) => ({
      group,
      // Only matches between teams of this group count here, as buildStandings ignores outsiders.
      standings: buildStandings(
        teams.filter((t) => t.group === group),
        matches,
      ),
    }));
  }, [teams, matches]);

  return (
    <section aria-label="Group standings" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4">
        {groups.map(({ group, standings }) => (
          <Leaderboard key={group} title={`Group ${group}`} standings={standings} onSelectTeam={onSelectTeam} compact />
        ))}
      </div>
      <Typography variant="caption" color="text.secondary">
        Within each group, teams are ranked by points, then matches won, then fewest balls lost, then team number.
      </Typography>
    </section>
  );
}
