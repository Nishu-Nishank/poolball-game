import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonIcon from '@mui/icons-material/Person';
import type { EvaluatedMatch, Team, TeamStanding } from '../../types/tournament';
import { teamLabel } from '../../utils/leaderboard';
import { matchHeading } from '../../utils/format';
import { TeamBadge } from '../common/TeamBadge';
import { TeamPointsBreakdown } from '../PointsBreakdown/PointsBreakdown';
import { colors } from '../../theme';

interface Props {
  open: boolean;
  standing: TeamStanding | null;
  matches: EvaluatedMatch[];
  teamsById: Map<string, Team>;
  onClose: () => void;
}

export function TeamDetails({ open, standing, matches, teamsById, onClose }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Dialog open={open && standing !== null} onClose={onClose} fullScreen={fullScreen} maxWidth="md" fullWidth aria-labelledby="team-details-title">
      {standing && <TeamDetailsContent standing={standing} matches={matches} teamsById={teamsById} onClose={onClose} />}
    </Dialog>
  );
}

function TeamDetailsContent({ standing: s, matches, teamsById, onClose }: Omit<Props, 'open' | 'standing'> & { standing: TeamStanding }) {
  const { team } = s;
  const played = matches
    .filter((m) => m.state === 'counted' && (m.winner === team.id || m.loser === team.id))
    .sort((a, b) => a.order - b.order);

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <Button startIcon={<ArrowBackIcon />} onClick={onClose}>
          Back to leaderboard
        </Button>
        <Typography variant="body2" color="text.secondary" className="pr-2">
          Rank {s.rank}
        </Typography>
      </div>

      <DialogContent className="!px-4 !py-5 sm:!px-6">
        <div className="flex items-start gap-4">
          <TeamBadge team={team} size="lg" />
          <div className="min-w-0">
            <Typography id="team-details-title" variant="h1" component="h2">
              {teamLabel(team)}
            </Typography>
            {team.number && team.name && (
              <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                {team.name}
              </Typography>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {team.members.length > 0 ? (
                team.members.map((m) => <Chip key={m.name} icon={<PersonIcon />} label={m.name} size="small" variant="outlined" />)
              ) : (
                <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                  Members not listed in the workbook
                </Typography>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
          <Stat label="Points" value={s.points} highlight />
          <Stat label="Played" value={s.played} />
          <Stat label="Won" value={s.won} color={colors.win} />
          <Stat label="Lost" value={s.lost} color={colors.loss} />
          <Stat label="Balls lost" value={s.ballsLost} />
        </div>

        <Typography variant="h3" component="h3" className="!mt-6 !mb-2">
          Match by match
        </Typography>
        {played.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No completed matches yet.
          </Typography>
        ) : (
          <TableContainer component={Paper}>
            <Table size="small" aria-label={`${teamLabel(team)} matches`}>
              <TableHead>
                <TableRow>
                  <TableCell>Match</TableCell>
                  <TableCell>Opponent</TableCell>
                  <TableCell align="center">Result</TableCell>
                  <TableCell align="center">Balls lost (loser)</TableCell>
                  <TableCell align="right">Points earned</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {played.map((m) => {
                  const won = m.winner === team.id;
                  const opponent = teamsById.get((won ? m.loser : m.winner)!);
                  const label =
                    matchHeading(m) ||
                    `Row ${m.source.row}`;
                  return (
                    <TableRow key={`${m.id}-${m.source.row}`}>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {label}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {opponent ? teamLabel(opponent) : '—'}
                        </Typography>
                        {opponent?.number && opponent.name && (
                          <Typography variant="caption" color="text.secondary">
                            {opponent.name}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={won ? 'W' : 'L'}
                          size="small"
                          sx={{ bgcolor: won ? colors.win : colors.loss, color: '#fff', minWidth: 32 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        {m.ballsLost} {won ? `by ${opponent ? teamLabel(opponent) : 'opponent'}` : `by ${teamLabel(team)}`}
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                         
                          sx={{ fontWeight: 700, color: won ? colors.win : 'text.secondary' }}
                          className="tabular-nums"
                        >
                          {won ? `+${m.points}` : '0'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Typography variant="h3" component="h3" className="!mt-6 !mb-2">
          How {s.points} {s.points === 1 ? 'point was' : 'points were'} earned
        </Typography>
        <Paper className="px-4 py-3">
          <TeamPointsBreakdown standing={s} teamsById={teamsById} />
        </Paper>
      </DialogContent>
    </>
  );
}

function Stat({ label, value, color, highlight }: { label: string; value: number; color?: string; highlight?: boolean }) {
  return (
    <Paper
      className="px-3 py-2 text-center"
      sx={highlight ? { bgcolor: colors.navy, color: '#fff', borderColor: colors.navy } : undefined}
    >
      <Typography component="div" className="tabular-nums" sx={{ fontWeight: 800, fontSize: '1.5rem', color }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: highlight ? 'rgba(255,255,255,0.75)' : 'text.secondary' }}>
        {label}
      </Typography>
    </Paper>
  );
}
