import { ButtonBase, Chip, Paper, Tooltip, Typography } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import type { KnockoutMatch, KnockoutRound, Team } from '../../types/tournament';
import { teamLabel } from '../../utils/leaderboard';
import { ROUND_LABELS } from '../../utils/knockout';
import { TeamIdentity } from '../common/TeamIdentity';
import { FinalReveal } from './FinalReveal';
import { colors } from '../../theme';

interface Props {
  round: KnockoutRound;
  matches: KnockoutMatch[];
  teamsById: Map<string, Team>;
  /** Each team's total points in the overall leaderboard (group + knockout). */
  pointsByTeam: Map<string, number>;
  onSelectTeam: (teamId: string) => void;
  /** True when the published data has no finals sheet at all. */
  noKnockoutData: boolean;
}

const STATE: Record<KnockoutMatch['state'], { label: string; color: 'success' | 'default' | 'warning' | 'error' }> = {
  played: { label: 'Complete', color: 'success' },
  pending: { label: 'To play', color: 'default' },
  awaiting: { label: 'Awaiting qualifiers', color: 'default' },
  flagged: { label: 'Needs review', color: 'error' },
};

/** One knockout round as scorecards: rack scores, winner highlighted, placeholders for unknown teams. */
export function KnockoutStage({ round, matches, teamsById, pointsByTeam, onSelectTeam, noKnockoutData }: Props) {
  const rows = matches.filter((m) => m.round === round).sort((a, b) => a.order - b.order);
  const title = ROUND_LABELS[round];
  const champion = round === 'F' ? rows.find((m) => m.state === 'played' && m.winner) : undefined;
  const championTeam = champion?.winner ? teamsById.get(champion.winner) : undefined;

  if (rows.length === 0) {
    return (
      <Paper className="px-4 py-10 text-center">
        <Typography sx={{ fontWeight: 600 }}>{title} not started yet</Typography>
        <Typography variant="body2" color="text.secondary">
          {noKnockoutData
            ? 'The finals bracket appears here once the organisers publish the finals sheet.'
            : 'These matches appear here once they are entered in the finals sheet.'}
        </Typography>
      </Paper>
    );
  }

  const section = (
    <section aria-label={title} className="flex flex-col gap-4">
      {championTeam && (
        <Paper className="flex items-center gap-3 px-4 py-3" sx={{ bgcolor: colors.navy, color: '#fff', borderColor: colors.navy }}>
          <EmojiEventsIcon sx={{ color: '#fbbf24', fontSize: 36 }} aria-hidden />
          <div>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              Champion
            </Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', lineHeight: 1.2 }}>
              {teamLabel(championTeam)}
              {championTeam.members.length > 0 && (
                <span className="font-medium text-white/80"> · {championTeam.members.map((m) => m.name).join(' / ')}</span>
              )}
            </Typography>
          </div>
        </Paper>
      )}
      <div className={rows.length === 1 ? 'grid grid-cols-1 gap-3 md:max-w-xl' : 'grid grid-cols-1 gap-3 md:grid-cols-2'}>
        {rows.map((m) => (
          <KnockoutCard key={`${m.id}-${m.source.row}`} match={m} teamsById={teamsById} pointsByTeam={pointsByTeam} onSelectTeam={onSelectTeam} />
        ))}
      </div>
      <Typography variant="caption" color="text.secondary">
        Knockout matches are a race to the stated number of racks. The winner receives points equal to the balls the loser
        had left, added to their group-stage points in the overall leaderboard. Group tables show group matches only.
      </Typography>
    </section>
  );

  // The Finals tab opens with a short sparkle animation before the decided result is shown.
  // FinalReveal only exists while this round is on screen, so it replays each time the tab is opened.
  return championTeam ? <FinalReveal>{section}</FinalReveal> : section;
}

function KnockoutCard({
  match: m,
  teamsById,
  pointsByTeam,
  onSelectTeam,
}: {
  match: KnockoutMatch;
  teamsById: Map<string, Team>;
  pointsByTeam: Map<string, number>;
  onSelectTeam: (id: string) => void;
}) {
  const state = STATE[m.state];
  const heading = [m.id, m.target && `first to ${m.target} ${m.target === 1 ? 'rack' : 'racks'}`].filter(Boolean).join(' · ');
  return (
    <Paper className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <Typography variant="body2" color="text.secondary" noWrap sx={{ fontWeight: 600 }}>
          {heading}
        </Typography>
        <Chip size="small" label={state.label} color={state.color} variant={m.state === 'played' ? 'filled' : 'outlined'} />
      </div>
      <div className="flex flex-col divide-y divide-slate-100">
        <Side teamId={m.teamA} raw={m.teamARaw} racks={m.racksA} winner={m.winner} teamsById={teamsById} pointsByTeam={pointsByTeam} onSelectTeam={onSelectTeam} fallback="To be decided" />
        <Side teamId={m.teamB} raw={m.teamBRaw} racks={m.racksB} winner={m.winner} teamsById={teamsById} pointsByTeam={pointsByTeam} onSelectTeam={onSelectTeam} fallback="To be decided" />
      </div>
      {m.state === 'played' && m.winner && m.ballsLost !== null && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5"
          style={{ background: colors.winSoft, borderColor: colors.border }}
        >
          <Typography variant="body2">
            {loserLabel(m, teamsById)} lost <strong className="tabular-nums">{m.ballsLost}</strong> {m.ballsLost === 1 ? 'ball' : 'balls'}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: colors.win }} className="tabular-nums">
            +{m.points} {m.points === 1 ? 'pt' : 'pts'} to {teamsById.get(m.winner) ? teamLabel(teamsById.get(m.winner)!) : 'winner'}
          </Typography>
        </div>
      )}
      {m.reasons.length > 0 && (
        <Typography variant="caption" color="error" className="px-4 py-2">
          {m.reasons.join(' ')}
        </Typography>
      )}
    </Paper>
  );
}

function loserLabel(m: KnockoutMatch, teamsById: Map<string, Team>): string {
  const loserId = m.winner === m.teamA ? m.teamB : m.teamA;
  const team = loserId ? teamsById.get(loserId) : undefined;
  return team ? teamLabel(team) : 'The loser';
}

function Side(props: {
  teamId: string | null;
  raw: string;
  racks: number | null;
  winner: string | null;
  teamsById: Map<string, Team>;
  pointsByTeam: Map<string, number>;
  onSelectTeam: (id: string) => void;
  fallback: string;
}) {
  const team = props.teamId ? props.teamsById.get(props.teamId) : undefined;
  const won = props.winner !== null && props.winner === props.teamId;
  const lost = props.winner !== null && props.teamId !== null && props.winner !== props.teamId;
  const total = props.teamId ? props.pointsByTeam.get(props.teamId) : undefined;
  const score = (
    <Typography
      component="span"
      className="tabular-nums"
      sx={{ fontWeight: 800, fontSize: '1.5rem', minWidth: 36, textAlign: 'right', color: won ? colors.win : lost ? colors.loss : 'text.primary' }}
      aria-label={props.racks === null ? 'No score yet' : `${props.racks} racks`}
    >
      {props.racks ?? '–'}
    </Typography>
  );
  const content = (
    <>
      <div className="min-w-0">
        {team ? (
          <TeamIdentity team={team} showName size="sm" />
        ) : (
          <Typography variant="body2" color="text.disabled" sx={{ py: 1, fontStyle: 'italic' }}>
            {props.raw || props.fallback}
          </Typography>
        )}
      </div>
      {total !== undefined && (
        <Tooltip title="Total points in the overall leaderboard (group stage + knockout)">
          <div className="ml-1 shrink-0 self-center border-l border-slate-200 pl-3 leading-none">
            <Typography variant="caption" component="div" color="text.secondary" sx={{ letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.625rem' }}>
              Points
            </Typography>
            <Typography component="div" className="tabular-nums" sx={{ fontWeight: 800, fontSize: '1.25rem', lineHeight: 1.2, color: colors.navy }}>
              {total}
              <span className="ml-0.5 text-xs font-semibold text-slate-500">pts</span>
            </Typography>
          </div>
        </Tooltip>
      )}
      <div className="ml-auto flex shrink-0 items-center justify-end gap-2 pl-3">
        {won && <Chip size="small" label="WON" sx={{ bgcolor: colors.win, color: '#fff' }} />}
        {lost && <Chip size="small" label="LOST" sx={{ bgcolor: colors.lossSoft, color: colors.loss, border: `1px solid ${colors.loss}33` }} />}
        {score}
      </div>
    </>
  );
  const className = `!flex !items-center gap-3 !px-4 !py-3 text-left ${won ? 'bg-emerald-50' : lost ? 'bg-red-50/60' : ''}`;
  return team ? (
    <ButtonBase onClick={() => props.onSelectTeam(team.id)} aria-label={`${teamLabel(team)} — view team`} className={`${className} hover:bg-slate-50`}>
      {content}
    </ButtonBase>
  ) : (
    <div className={className}>{content}</div>
  );
}
