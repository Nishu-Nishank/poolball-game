import { useCallback, useEffect, useRef, useState } from 'react';
import { loadTournament, type TournamentSnapshot } from '../services/tournamentService';
import { sourceFromEnv, type WorkbookSource } from '../services/workbookSource';

const REFRESH_INTERVAL_MS = Number(import.meta.env.VITE_REFRESH_INTERVAL_MS ?? 60_000) || 0;
/** Configured once per page load; the data is fetched automatically, with no user action. */
const source = sourceFromEnv();

export interface TournamentDataState {
  snapshot: TournamentSnapshot | null;
  /** True only while nothing has been loaded yet. */
  loading: boolean;
  /** True during any request, including background refreshes. */
  refreshing: boolean;
  error: Error | null;
  /** When the tournament data last changed: the file's modification time, or when the change was detected. */
  lastUpdated: Date | null;
  /** Time of the last successful check against the source (even if the workbook was unchanged). */
  lastRefreshed: Date | null;
  source: WorkbookSource;
  refresh: () => void;
}

export function useTournamentData(): TournamentDataState {
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const versionRef = useRef<string | null>(null);
  /** Prevents overlapping requests (manual refresh during a background poll, etc.). */
  const inFlight = useRef(false);

  const fetchNow = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const result = await loadTournament(source, versionRef.current);
      if (result !== 'unchanged') {
        versionRef.current = result.version;
        setSnapshot(result);
        setLastUpdated(result.lastModified ?? new Date());
      }
      setError(null);
      setLastRefreshed(new Date());
    } catch (e) {
      // Keep showing the last good data; the error is surfaced alongside it.
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchNow();
    if (REFRESH_INTERVAL_MS <= 0) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void fetchNow();
    };
    const timer = window.setInterval(tick, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [fetchNow]);

  return {
    snapshot,
    loading: snapshot === null && error === null,
    refreshing,
    error,
    lastUpdated,
    lastRefreshed,
    source,
    refresh: () => void fetchNow(),
  };
}
