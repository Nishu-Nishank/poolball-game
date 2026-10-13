import { useCallback, useEffect, useState } from 'react';

/**
 * Loads data on mount and on demand. A failed reload keeps the last good data and exposes the
 * error message. `fetcher` must be stable (e.g. a module-level function) or the data reloads
 * on every render.
 */
export function useRemoteData<T>(fetcher: () => Promise<T>, fallbackMessage = 'The data could not be loaded.') {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      fetcher().then(
        (result) => {
          setData(result);
          setError(null);
        },
        (e: unknown) => setError(e instanceof Error ? e.message : fallbackMessage),
      ),
    [fetcher, fallbackMessage],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}
