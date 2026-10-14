import { ButtonBase, Chip, Paper, Typography } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import type { KnockoutMatch, KnockoutRound, Team } from '../../types/tournament';
import { teamLabel } from '../../utils/leaderboard';
import { ROUND_LABELS } from '../../utils/knockout';
import { TeamIdentity } from '../common/TeamIdentity';
import { colors } from '../../theme';

interface Props {
  round: KnockoutRound;
  matches: KnockoutMatch[];
  teamsById: Map<string, Team>;
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
export function KnockoutStage({ round, matches, teamsById, onSelectTeam, noKnockoutData }: Props) {
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

  return (
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
          <KnockoutCard key={`${m.id}-${m.source.row}`} match={m} teamsById={teamsById} onSelectTeam={onSelectTeam} />
        ))}
      </div>
      <Typography variant="caption" color="text.secondary">
        Knockout matches are a race to the stated number of racks and do not count towards the group points table.
      </Typography>
    </section>
  );
}

function KnockoutCard({ match: m, teamsById, onSelectTeam }: { match: KnockoutMatch; teamsById: Map<string, Team>; onSelectTeam: (id: string) => void }) {
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
        <Side teamId={m.teamA} raw={m.teamARaw} racks={m.racksA} winner={m.winner} teamsById={teamsById} onSelectTeam={onSelectTeam} fallback="Winner of earlier round" />
        <Side teamId={m.teamB} raw={m.teamBRaw} racks={m.racksB} winner={m.winner} teamsById={teamsById} onSelectTeam={onSelectTeam} fallback="Winner of earlier round" />
      </div>
      {m.reasons.length > 0 && (
        <Typography variant="caption" color="error" className="px-4 py-2">
          {m.reasons.join(' ')}
        </Typography>
      )}
    </Paper>
  );
}

function Side(props: {
  teamId: string | null;
  raw: string;
  racks: number | null;
  winner: string | null;
  teamsById: Map<string, Team>;
  onSelectTeam: (id: string) => void;
  fallback: string;
}) {
  const team = props.teamId ? props.teamsById.get(props.teamId) : undefined;
  const won = props.winner !== null && props.winner === props.teamId;
  const lost = props.winner !== null && props.teamId !== null && props.winner !== props.teamId;
  const score = (
    <Typography
      component="span"
      className="tabular-nums"
      sx={{ fontWeight: 800, fontSize: '1.5rem', minWidth: 36, textAlign: 'right', color: won ? colors.win : lost ? 'text.secondary' : 'text.primary' }}
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
      <div className="flex shrink-0 items-center gap-2">
        {won && <Chip size="small" label="WON" sx={{ bgcolor: colors.win, color: '#fff' }} />}
        {score}
      </div>
    </>
  );
  const className = `!flex !items-center !justify-between gap-3 !px-4 !py-3 text-left ${won ? 'bg-emerald-50' : ''}`;
  return team ? (
    <ButtonBase onClick={() => props.onSelectTeam(team.id)} aria-label={`${teamLabel(team)} — view team`} className={`${className} hover:bg-slate-50`}>
      {content}
    </ButtonBase>
  ) : (
    <div className={className}>{content}</div>
  );
}
