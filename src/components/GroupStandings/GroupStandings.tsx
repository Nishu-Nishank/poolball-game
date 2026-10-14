import { useMemo } from 'react';
import { Typography } from '@mui/material';
import type { EvaluatedMatch, KnockoutMatch, Team } from '../../types/tournament';
import { buildStandings } from '../../utils/leaderboard';
import { knockoutAwards } from '../../utils/knockout';
import { Leaderboard } from '../Leaderboard/Leaderboard';

interface Props {
  teams: Team[];
  matches: EvaluatedMatch[];
  knockout?: KnockoutMatch[];
  onSelectTeam: (teamId: string) => void;
}

/**
 * One cricket-style table per group. Each team's figures are the same as in the overall table
 * (group matches plus its knockout results), ranked within the group.
 */
export function GroupStandings({ teams, matches, knockout = [], onSelectTeam }: Props) {
  const groups = useMemo(() => {
    const names = [...new Set(teams.map((t) => t.group).filter((g): g is string => !!g))];
    names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const awards = knockoutAwards(knockout);
    return names.map((group) => ({
      group,
      standings: buildStandings(
        teams.filter((t) => t.group === group),
        matches,
        awards,
      ),
    }));
  }, [teams, matches, knockout]);

  return (
    <section aria-label="Group standings" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4">
        {groups.map(({ group, standings }) => (
          <Leaderboard key={group} title={`Group ${group}`} standings={standings} onSelectTeam={onSelectTeam} compact />
        ))}
      </div>
      <Typography variant="caption" color="text.secondary">
        Within each group, teams are ranked by points, then matches won, then fewest balls lost, then team number. Figures
        include each team's knockout matches, as in the overall table.
      </Typography>
    </section>
  );
}
