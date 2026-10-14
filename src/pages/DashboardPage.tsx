import { useMemo, useState } from 'react';
import { Alert, Button, Paper, Tab, Tabs } from '@mui/material';
import { useTournamentData } from '../hooks/useTournamentData';
import { Header } from '../components/Header/Header';
import { SummaryCards } from '../components/SummaryCards/SummaryCards';
import { Leaderboard } from '../components/Leaderboard/Leaderboard';
import { MatchResults } from '../components/MatchResults/MatchResults';
import { PointsBreakdown } from '../components/PointsBreakdown/PointsBreakdown';
import { TeamDetails } from '../components/TeamDetails/TeamDetails';
import { DataIssues } from '../components/DataIssues/DataIssues';
import { GroupStandings } from '../components/GroupStandings/GroupStandings';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { KnockoutStage } from '../components/Knockout/KnockoutStage';
import { KNOCKOUT_ROUNDS, ROUND_LABELS } from '../utils/knockout';
import { formatRefreshTime } from '../utils/format';
import type { KnockoutRound } from '../types/tournament';

type View = 'standings' | 'groups' | 'results' | 'breakdown';
type Stage = 'group' | KnockoutRound;

export default function DashboardPage() {
  const { snapshot, loading, refreshing, error, lastUpdated, lastRefreshed, source, refresh } = useTournamentData();
  const [view, setView] = useState<View>('standings');
  const [stage, setStage] = useState<Stage>('group');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  // Kept separate from the selection so the dialog content stays rendered during its close animation.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const openTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    setDetailsOpen(true);
  };

  const teamsById = useMemo(() => new Map(snapshot?.data.teams.map((t) => [t.id, t]) ?? []), [snapshot]);
  const pointsByTeam = useMemo(() => new Map(snapshot?.standings.map((s) => [s.team.id, s.points]) ?? []), [snapshot]);
  const hasGroups = snapshot?.data.teams.some((t) => t.group) ?? false;
  const selected = snapshot?.standings.find((s) => s.team.id === selectedTeamId) ?? null;

  return (
    <div className="min-h-screen">
      <Header
        tournamentStatus={snapshot?.data.meta.tournamentStatus ?? null}
        sourceLabel={source.label}
        lastUpdated={lastUpdated}
        lastRefreshed={lastRefreshed}
        refreshing={refreshing}
        onRefresh={refresh}
      />

      {snapshot && (
        <Paper square className="sticky top-0 z-10 !border-x-0 !border-t-0">
          <Tabs
            value={view}
            onChange={(_, v: View) => setView(v)}
            variant="scrollable"
            allowScrollButtonsMobile
            className="mx-auto max-w-7xl px-2 sm:px-4"
            aria-label="Dashboard sections"
          >
            <Tab value="standings" label="Standings" />
            {hasGroups && <Tab value="groups" label="Groups" />}
            <Tab value="results" label="Match Results" />
            <Tab value="breakdown" label="Points Breakdown" />
          </Tabs>
        </Paper>
      )}

      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6">
        {loading && <LoadingState />}

        {!snapshot && error && <ErrorState error={error} onRetry={refresh} />}

        {snapshot && error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={refresh}>
                Retry
              </Button>
            }
          >
            Latest refresh failed: {error.message} Showing data from {formatRefreshTime(lastRefreshed)}.
          </Alert>
        )}

        {snapshot && (
          <>
            {view === 'standings' && (
              <>
                <Paper className="overflow-hidden">
                  <Tabs
                    value={stage}
                    onChange={(_, s: Stage) => setStage(s)}
                    variant="scrollable"
                    allowScrollButtonsMobile
                    aria-label="Tournament stage"
                    sx={{ minHeight: 44, '& .MuiTab-root': { minHeight: 44 } }}
                  >
                    <Tab value="group" label="Overall" />
                    {KNOCKOUT_ROUNDS.map((r) => (
                      <Tab key={r} value={r} label={ROUND_LABELS[r]} />
                    ))}
                  </Tabs>
                </Paper>
                {stage === 'group' ? (
                  <>
                    <SummaryCards standings={snapshot.standings} matches={snapshot.matches} knockout={snapshot.data.knockout} />
                    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                      <Leaderboard standings={snapshot.standings} onSelectTeam={openTeam} />
                      <MatchResults
                        matches={snapshot.matches}
                        teamsById={teamsById}
                        onSelectTeam={openTeam}
                        limit={4}
                        onViewAll={() => setView('results')}
                        compact
                      />
                    </div>
                    <DataIssues matches={snapshot.matches} issues={snapshot.issues} />
                  </>
                ) : (
                  <KnockoutStage
                    round={stage}
                    matches={snapshot.data.knockout}
                    teamsById={teamsById}
                    pointsByTeam={pointsByTeam}
                    onSelectTeam={openTeam}
                    noKnockoutData={snapshot.data.knockout.length === 0}
                  />
                )}
              </>
            )}
            {view === 'groups' && (
              <GroupStandings teams={snapshot.data.teams} matches={snapshot.matches} onSelectTeam={openTeam} />
            )}
            {view === 'results' && (
              <MatchResults matches={snapshot.matches} teamsById={teamsById} onSelectTeam={openTeam} />
            )}
            {view === 'breakdown' && (
              <PointsBreakdown standings={snapshot.standings} teamsById={teamsById} onSelectTeam={openTeam} />
            )}

            <footer className="flex flex-col gap-1 pt-2 text-center text-xs text-slate-500">
              <p className="m-0 font-semibold text-slate-600">© 2026 4flow India 8-Ball Championship. All rights reserved.</p>
              <p className="m-0">Developed by Nishu Nishank</p>
              <p className="m-0">
                Source: {snapshot.data.meta.fileName} ·{' '}
                {snapshot.data.meta.teamSheet
                  ? `teams from “${snapshot.data.meta.teamSheet}”, results from “${snapshot.data.meta.matchSheet}”`
                  : `teams and results from “${snapshot.data.meta.matchSheet}”`}
              </p>
            </footer>
          </>
        )}
      </main>

      <TeamDetails
        open={detailsOpen}
        standing={selected}
        matches={snapshot?.matches ?? []}
        teamsById={teamsById}
        onClose={() => setDetailsOpen(false)}
      />
    </div>
  );
}
