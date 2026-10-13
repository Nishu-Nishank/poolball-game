import { Paper, Skeleton } from '@mui/material';

/** Mirrors the dashboard layout so the page does not jump when data arrives. */
export function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading tournament data" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Paper key={i} className="p-4">
            <Skeleton width="55%" />
            <Skeleton width="40%" height={44} />
            <Skeleton width="65%" />
          </Paper>
        ))}
      </div>
      <Paper className="p-4">
        <div className="mb-3 flex justify-between">
          <Skeleton width={220} height={32} />
          <Skeleton width={240} height={40} />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-slate-100 py-3">
            <Skeleton variant="text" width={24} />
            <Skeleton variant="rounded" width={32} height={32} />
            <div className="flex-1">
              <Skeleton width="30%" />
              <Skeleton width="20%" />
            </div>
            <Skeleton width={120} />
            <Skeleton width={32} height={28} />
          </div>
        ))}
      </Paper>
    </div>
  );
}
