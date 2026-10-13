import { useState } from 'react';
import { ButtonBase, InputAdornment, Paper, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { Team, TeamStanding } from '../../types/tournament';
import { filterStandings, teamLabel } from '../../utils/leaderboard';
import { matchTitle } from '../../utils/format';
import { TeamBadge } from '../common/TeamBadge';
import { colors } from '../../theme';

interface Props {
  standings: TeamStanding[];
  teamsById: Map<string, Team>;
  onSelectTeam: (teamId: string) => void;
}

/** Every team's total, itemised by the wins that produced it. */
export function PointsBreakdown({ standings, teamsById, onSelectTeam }: Props) {
  const [query, setQuery] = useState('');
  const rows = filterStandings(standings, query);

  return (
    <section aria-labelledby="breakdown-title">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <Typography id="breakdown-title" variant="h2" component="h2">
          Points Breakdown
        </Typography>
        <TextField
          size="small"
          placeholder="Find a team"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-64"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
            htmlInput: { 'aria-label': 'Find a team' },
          }}
        />
      </div>
      <Typography variant="body2" color="text.secondary" className="mb-4">
        A winning team earns one point for every ball the losing team lost in that match.
      </Typography>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((s) => (
          <Paper key={s.team.id} className="overflow-hidden">
            <ButtonBase
              onClick={() => onSelectTeam(s.team.id)}
              className="!flex w-full !justify-between gap-3 border-b border-slate-200 !px-4 !py-3 text-left hover:bg-slate-50"
              aria-label={`${teamLabel(s.team)}, ${s.points} points — view team`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <TeamBadge team={s.team} size="sm" />
                <div className="min-w-0">
                  <Typography noWrap sx={{ fontWeight: 700 }}>
                    {teamLabel(s.team)}
                    {s.team.number && s.team.name ? ` — ${s.team.name}` : ''}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Rank {s.rank}
                  </Typography>
                </div>
              </div>
              <Typography className="whitespace-nowrap tabular-nums" sx={{ fontWeight: 800, fontSize: '1.25rem' }}>
                {s.points} <span className="text-sm font-semibold text-slate-500">pts</span>
              </Typography>
            </ButtonBase>
            <div className="px-4 py-3">
              <TeamPointsBreakdown standing={s} teamsById={teamsById} />
            </div>
          </Paper>
        ))}
      </div>
      {rows.length === 0 && (
        <Paper className="px-4 py-10 text-center">
          <Typography sx={{ fontWeight: 600 }}>{standings.length === 0 ? 'No teams found in the workbook' : `No team matches “${query}”`}</Typography>
        </Paper>
      )}
    </section>
  );
}

/** Itemised list for one team; reused inside the team details view. */
export function TeamPointsBreakdown({ standing, teamsById }: { standing: TeamStanding; teamsById: Map<string, Team> }) {
  if (standing.breakdown.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No points yet — {standing.played === 0 ? 'no completed matches' : 'no wins so far'}. Total: <strong>0 points</strong>
      </Typography>
    );
  }
  return (
    <>
      <ul className="m-0 list-none space-y-1.5 p-0">
        {standing.breakdown.map((award) => {
          const opponent = teamsById.get(award.loserId);
          const tag = [matchTitle(award.matchId, award.hasWorkbookId), award.round].filter(Boolean).join(' · ');
          return (
            <li key={`${award.matchId}-${award.order}`} className="flex items-start justify-between gap-3">
              <Typography variant="body2" component="span">
                Defeated <strong>{opponent ? teamLabel(opponent) : award.loserId}</strong>
                {tag && <span className="text-slate-500"> ({tag})</span>}: {award.ballsLost}{' '}
                {award.ballsLost === 1 ? 'ball' : 'balls'} lost by opponent
              </Typography>
              <Typography
                variant="body2"
                component="span"
               
                className="whitespace-nowrap tabular-nums"
                sx={{ fontWeight: 700, color: award.points > 0 ? colors.win : 'text.secondary' }}
              >
                +{award.points}
              </Typography>
            </li>
          );
        })}
      </ul>
      <div className="mt-2.5 flex justify-between gap-3 border-t border-dashed border-slate-300 pt-2">
        <Typography variant="body2" color="text.secondary" className="tabular-nums">
          {standing.breakdown.length > 1 ? standing.breakdown.map((a) => a.points).join(' + ') : 'Total'}
        </Typography>
        <Typography variant="body2" className="tabular-nums" sx={{ fontWeight: 800 }}>
          = {standing.points} {standing.points === 1 ? 'point' : 'points'}
        </Typography>
      </div>
    </>
  );
}
