import { Alert, AlertTitle, Button, Paper, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { NoPublishedDataError, WorkbookAccessError, WorkbookStructureError } from '../../services/errors';

interface Props {
  error: Error;
  onRetry: () => void;
}

export function ErrorState({ error, onRetry }: Props) {
  const hint = error instanceof WorkbookAccessError ? error.hint : null;
  const structure = error instanceof WorkbookStructureError ? error : null;

  // Not a failure: the source works but an administrator has not published results yet.
  if (error instanceof NoPublishedDataError) {
    return (
      <Paper className="mx-auto w-full max-w-3xl p-6 text-center sm:p-8" role="status">
        <Typography variant="h1" component="h2" className="!mb-1">
          No results published yet
        </Typography>
        <Typography color="text.secondary" className="!mb-4">
          Standings, groups and match results will appear here as soon as an administrator publishes the first
          tournament file. This page checks for updates automatically.
        </Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRetry}>
          Check now
        </Button>
      </Paper>
    );
  }

  return (
    <Paper className="mx-auto w-full max-w-3xl p-5 sm:p-6" role="alert">
      <Typography variant="h1" component="h2" className="!mb-1">
        Tournament data is unavailable
      </Typography>
      <Typography color="text.secondary" className="!mb-4">
        The dashboard could not read the tournament workbook. No standings are shown until real data is available. It
        keeps retrying automatically.
      </Typography>

      <Alert severity="error" className="!mb-4 [overflow-wrap:anywhere]">
        <AlertTitle>{structure ? 'Unrecognized workbook layout' : 'Could not load the workbook'}</AlertTitle>
        {error.message}
        {hint && <div className="mt-1">{hint}</div>}
      </Alert>

      {structure && (
        <div className="mb-4">
          <Typography variant="body2" sx={{ fontWeight: 600 }} className="!mb-1">
            Sheets found in the workbook:
          </Typography>
          <ul className="m-0 list-disc pl-5 text-sm">
            {structure.sheets.map((s) => (
              <li key={s.name}>
                <strong>{s.name}</strong>: {s.headers.length ? s.headers.join(' | ') : '(empty)'}
              </li>
            ))}
          </ul>
          <Typography variant="body2" color="text.secondary" className="!mt-2">
            Add the matching header names to <code>src/services/workbookMapping.ts</code>.
          </Typography>
        </div>
      )}

      <Button variant="contained" startIcon={<RefreshIcon />} onClick={onRetry}>
        Retry now
      </Button>
    </Paper>
  );
}
