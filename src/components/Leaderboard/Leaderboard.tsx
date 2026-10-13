import { useId, useMemo, useState } from 'react';
import {
  Chip,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { TeamStanding } from '../../types/tournament';
import { filterStandings, sortStandings, type SortDirection, type SortKey } from '../../utils/leaderboard';
import { TeamIdentity } from '../common/TeamIdentity';
import { FormChips } from '../common/FormChips';
import { colors } from '../../theme';

interface Props {
  standings: TeamStanding[];
  onSelectTeam: (teamId: string) => void;
  title?: string;
  /** Compact variant for group tables: no search box and no footnote. */
  compact?: boolean;
}

const hideBelow = (bp: 'sm' | 'md' | 'lg') => ({ display: { xs: 'none', [bp]: 'table-cell' } });

export function Leaderboard({ standings, onSelectTeam, title = 'Tournament Leaderboard', compact = false }: Props) {
  const titleId = useId();
  const hasNames = standings.some((s) => s.team.name);
  const hasGroups = !compact && standings.some((s) => s.team.group);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'points', direction: 'desc' });

  const rows = useMemo(
    () => sortStandings(filterStandings(standings, query), sort.key, sort.direction),
    [standings, query, sort],
  );

  const sortBy = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, direction: s.direction === 'desc' ? 'asc' : 'desc' }
        : // Balls lost reads best ascending (fewest first); points and wins descending.
          { key, direction: key === 'ballsLost' ? 'asc' : 'desc' },
    );

  const sortHeader = (key: SortKey, label: string, title: string) => (
    <TableSortLabel
      active={sort.key === key}
      direction={sort.key === key ? sort.direction : key === 'ballsLost' ? 'asc' : 'desc'}
      onClick={() => sortBy(key)}
      title={title}
    >
      {label}
    </TableSortLabel>
  );

  return (
    <Paper component="section" aria-labelledby={titleId} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Typography id={titleId} variant="h2" component="h2">
          {title}
        </Typography>
        {!compact && (
        <TextField
          size="small"
          placeholder="Search team no., name or player"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-72"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
            htmlInput: { 'aria-label': 'Search teams' },
          }}
        />
        )}
      </div>

      <TableContainer>
        <Table size="small" aria-label={`${title} standings`}>
          <TableHead>
            <TableRow>
              <TableCell align="center" sx={{ width: { xs: 40, sm: 56 }, px: { xs: 0.5, sm: 2 } }}>
                Rank
              </TableCell>
              <TableCell>Team No. &amp; Members</TableCell>
              {hasNames && <TableCell sx={hideBelow('md')}>Team Name</TableCell>}
              {hasGroups && (
                <TableCell align="center" sx={hideBelow('sm')}>
                  Group
                </TableCell>
              )}
              <TableCell align="center" title="Matches played" sx={hideBelow('sm')}>
                M
              </TableCell>
              <TableCell align="center">{sortHeader('won', 'W', 'Matches won')}</TableCell>
              <TableCell align="center" title="Matches lost" sx={hideBelow('sm')}>
                L
              </TableCell>
              <TableCell align="center" sx={hideBelow('sm')}>
                {sortHeader('ballsLost', 'Balls Lost', 'Balls lost by this team in matches it lost')}
              </TableCell>
              <TableCell sx={hideBelow('lg')}>Form</TableCell>
              <TableCell align="center">{sortHeader('points', 'PTS', 'Total points')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((s) => {
              const isLeader = s.rank === 1 && s.points > 0;
              return (
                <TableRow
                  key={s.team.id}
                  hover
                  tabIndex={0}
                  onClick={() => onSelectTeam(s.team.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectTeam(s.team.id);
                    }
                  }}
                  aria-label={`Rank ${s.rank}, view details`}
                  sx={{
                    cursor: 'pointer',
                    verticalAlign: 'top',
                    '& td': { py: 1.25 },
                    ...(isLeader && {
                      bgcolor: colors.winSoft,
                      '& td:first-of-type': { boxShadow: `inset 3px 0 0 ${colors.win}` },
                    }),
                    '&:focus-visible': { outline: `2px solid ${colors.navyLight}`, outlineOffset: -2 },
                  }}
                >
                  <TableCell align="center" sx={{ px: { xs: 0.5, sm: 2 } }}>
                    <Typography className="tabular-nums" sx={{ fontWeight: 700, pt: 0.75 }}>
                      {s.rank}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ minWidth: { xs: 150, sm: 180 } }}>
                    <div className="md:hidden">
                      <TeamIdentity team={s.team} showName size="sm" />
                    </div>
                    <div className="hidden md:block">
                      <TeamIdentity team={s.team} size="sm" />
                    </div>
                  </TableCell>
                  {hasNames && (
                    <TableCell sx={{ ...hideBelow('md'), pt: '18px !important' }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {s.team.name ?? '—'}
                      </Typography>
                    </TableCell>
                  )}
                  {hasGroups && (
                    <TableCell align="center" sx={{ ...hideBelow('sm'), pt: '14px !important' }}>
                      {s.team.group ? <Chip label={s.team.group} size="small" variant="outlined" /> : '—'}
                    </TableCell>
                  )}
                  <NumberCell value={s.played} sx={hideBelow('sm')} />
                  <NumberCell value={s.won} color={s.won > 0 ? colors.win : undefined} />
                  <NumberCell value={s.lost} color={s.lost > 0 ? colors.loss : undefined} sx={hideBelow('sm')} />
                  <NumberCell value={s.ballsLost} sx={hideBelow('sm')} />
                  <TableCell sx={{ ...hideBelow('lg'), pt: '16px !important' }}>
                    <FormChips form={s.form} />
                  </TableCell>
                  <TableCell align="center">
                    <Typography
                      className="tabular-nums"
                      sx={{ fontWeight: 800, fontSize: '1.125rem', pt: 0.5, color: isLeader ? colors.win : 'text.primary' }}
                    >
                      {s.points}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {rows.length === 0 && (
        <div className="px-4 py-10 text-center">
          <Typography sx={{ fontWeight: 600 }}>
            {standings.length === 0 ? 'No teams found in the workbook' : `No team matches “${query}”`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {standings.length === 0
              ? 'Teams will appear here once they are added to the tournament workbook.'
              : 'Try a team number (e.g. 7), a team name or a player name.'}
          </Typography>
        </div>
      )}

      {!compact && (
        <Typography variant="caption" color="text.secondary" component="p" className="border-t border-slate-200 px-4 py-2">
          Ranked by points, then matches won, then fewest balls lost, then team number. Select a team for full details.
        </Typography>
      )}
    </Paper>
  );
}

function NumberCell({ value, color, sx }: { value: number; color?: string; sx?: object }) {
  return (
    <TableCell align="center" sx={sx}>
      <Typography variant="body2" className="tabular-nums" sx={{ fontWeight: 600, pt: 0.875, color }}>
        {value}
      </Typography>
    </TableCell>
  );
}
