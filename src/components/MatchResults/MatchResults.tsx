import { useState } from 'react';
import { Button, ButtonBase, Chip, Paper, Typography } from '@mui/material';
import type { EvaluatedMatch, KnockoutMatch, Team } from '../../types/tournament';
import { teamLabel } from '../../utils/leaderboard';
import { plural } from '../../utils/format';
import { allResults, upcomingMatches, type ResultItem } from '../../utils/results';
import { TeamIdentity } from '../common/TeamIdentity';
import { colors } from '../../theme';

interface Props {
  matches: EvaluatedMatch[];
  knockout?: KnockoutMatch[];
  teamsById: Map<string, Team>;
  onSelectTeam: (teamId: string) => void;
  /** Show only the N most recent results (used on the overview). */
  limit?: number;
  onViewAll?: () => void;
  compact?: boolean;
}

const PAGE_SIZE = 12;

/** Completed matches from both stages as scorecards, newest first, plus the matches still to play. */
export function MatchResults({ matches, knockout = [], teamsById, onSelectTeam, limit, onViewAll, compact }: Props) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const completed = allResults(matches, knockout);
  const upcoming = upcomingMatches(matches, knockout);
  const visible = completed.slice(0, limit ?? shown);

  return (
    <section className="min-w-0" aria-labelledby={compact ? 'recent-results-title' : 'results-title'}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <Typography id={compact ? 'recent-results-title' : 'results-title'} variant="h2" component="h2">
          {compact ? 'Recent Results' : 'Match Results'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {plural(completed.length, 'completed match', 'completed matches')}
          {upcoming.length > 0 && ` · ${upcoming.length} to play`}
        </Typography>
      </div>

      {completed.length === 0 ? (
        <Paper className="px-4 py-10 text-center">
          <Typography sx={{ fontWeight: 600 }}>No completed matches yet</Typography>
          <Typography variant="body2" color="text.secondary">
            Results appear here as soon as they are confirmed in the workbook.
          </Typography>
        </Paper>
      ) : (
        <div className={compact ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'}>
          {visible.map((r) => (
            <MatchCard key={r.key} result={r} teamsById={teamsById} onSelectTeam={onSelectTeam} compact={compact} />
          ))}
        </div>
      )}

      {limit !== undefined && completed.length > limit && onViewAll && (
        <Button onClick={onViewAll} fullWidth sx={{ mt: 1.5 }}>
          View all {completed.length} results
        </Button>
      )}
      {limit === undefined && completed.length > shown && (
        <Button onClick={() => setShown((n) => n + PAGE_SIZE)} fullWidth variant="outlined" sx={{ mt: 2 }}>
          Show more ({completed.length - shown} remaining)
        </Button>
      )}

      {!compact && upcoming.length > 0 && (
        <>
          <Typography variant="h2" component="h3" className="!mt-6 !mb-3">
            Upcoming Matches
          </Typography>
          <Paper className="divide-y divide-slate-100">
            {upcoming.map((u) => {
              const a = u.teamAId ? teamsById.get(u.teamAId) : undefined;
              const b = u.teamBId ? teamsById.get(u.teamBId) : undefined;
              return (
                <div key={u.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                  <Typography variant="body2" color="text.secondary" className="w-40 shrink-0" sx={{ fontWeight: 600 }}>
                    {u.heading}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {a ? teamLabel(a) : u.teamARaw || 'TBD'} <span className="font-normal text-slate-500">vs</span>{' '}
                    {b ? teamLabel(b) : u.teamBRaw || 'TBD'}
                  </Typography>
                  <Chip label={u.status} size="small" variant="outlined" className="ml-auto" />
                </div>
              );
            })}
          </Paper>
        </>
      )}
    </section>
  );
}

interface CardProps {
  result: ResultItem;
  teamsById: Map<string, Team>;
  onSelectTeam: (teamId: string) => void;
  compact?: boolean;
}

export function MatchCard({ result: r, teamsById, onSelectTeam, compact }: CardProps) {
  const winner = teamsById.get(r.winnerId);
  const loser = teamsById.get(r.loserId);
  if (!winner || !loser) return null;

  return (
    <Paper className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <Typography variant="body2" color="text.secondary" noWrap sx={{ fontWeight: 600 }}>
          {r.heading || 'Completed match'}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap className="shrink-0" sx={{ fontWeight: 600 }}>
          {teamLabel(winner)} vs {teamLabel(loser)}
        </Typography>
      </div>

      <div className="flex flex-col divide-y divide-slate-100">
        <TeamLine team={winner} result="Won" onSelect={onSelectTeam} showMembers={!compact} />
        <TeamLine team={loser} result="Lost" onSelect={onSelectTeam} showMembers={!compact} />
      </div>

      <div
        className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5"
        style={{ background: colors.winSoft, borderColor: colors.border }}
      >
        <Typography variant="body2">
          {r.racks && (
            <>
              Racks <strong className="tabular-nums">{r.racks}</strong> ·{' '}
            </>
          )}
          {r.ballsLost !== null ? (
            <>
              {teamLabel(loser)} lost <strong className="tabular-nums">{r.ballsLost}</strong> {r.ballsLost === 1 ? 'ball' : 'balls'}
            </>
          ) : (
            `${teamLabel(loser)} lost`
          )}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, color: colors.win }} className="tabular-nums">
          +{r.points} {r.points === 1 ? 'pt' : 'pts'} to {teamLabel(winner)}
        </Typography>
      </div>
    </Paper>
  );
}

function TeamLine({
  team,
  result,
  onSelect,
  showMembers,
}: {
  team: Team;
  result: 'Won' | 'Lost';
  onSelect: (id: string) => void;
  showMembers: boolean;
}) {
  const won = result === 'Won';
  return (
    <ButtonBase
      onClick={() => onSelect(team.id)}
      aria-label={`${teamLabel(team)} ${result.toLowerCase()} — view team`}
      className="!flex !items-start !justify-between gap-3 !px-4 !py-3 text-left hover:bg-slate-50"
    >
      <div className="min-w-0">
        <TeamIdentity team={team} showName showMembers={showMembers} size="sm" />
      </div>
      <Chip
        label={won ? 'WON' : 'LOST'}
        size="small"
        sx={{
          bgcolor: won ? colors.win : colors.lossSoft,
          color: won ? '#fff' : colors.loss,
          border: won ? 'none' : `1px solid ${colors.loss}33`,
          flexShrink: 0,
        }}
      />
    </ButtonBase>
  );
}
