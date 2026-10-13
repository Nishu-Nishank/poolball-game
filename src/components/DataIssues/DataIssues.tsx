import { useState } from 'react';
import { Alert, Button, Collapse } from '@mui/material';
import type { DataIssue, EvaluatedMatch } from '../../types/tournament';
import { plural } from '../../utils/format';

interface Props {
  matches: EvaluatedMatch[];
  issues: DataIssue[];
}

/** Lists records excluded from the standings so organisers can correct the workbook. */
export function DataIssues({ matches, issues }: Props) {
  const [open, setOpen] = useState(false);
  const flagged = matches.filter((m) => m.state === 'flagged');
  const duplicates = matches.filter((m) => m.state === 'duplicate');
  if (flagged.length === 0 && duplicates.length === 0 && issues.length === 0) return null;

  const summary = [
    flagged.length > 0 && `${plural(flagged.length, 'match record')} excluded from the standings pending review`,
    duplicates.length > 0 && `${plural(duplicates.length, 'duplicate row')} ignored`,
    issues.length > 0 && plural(issues.length, 'data note'),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Alert
      severity={flagged.length > 0 ? 'warning' : 'info'}
      action={
        <Button color="inherit" size="small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide' : 'Details'}
        </Button>
      }
    >
      <strong>Data review:</strong> {summary}.
      <Collapse in={open}>
        <ul className="mt-2 mb-0 list-disc space-y-1 pl-5 text-sm">
          {[...flagged, ...duplicates].map((m) => (
            <li key={`${m.source.sheet}-${m.source.row}`}>
              <strong>
                {m.source.sheet}, row {m.source.row}
              </strong>{' '}
              ({m.teamARaw || '?'} vs {m.teamBRaw || '?'}): {m.reasons.join(' ')}
            </li>
          ))}
          {issues.map((issue, i) => (
            <li key={i}>
              {issue.source && (
                <strong>
                  {issue.source.sheet}, row {issue.source.row}:{' '}
                </strong>
              )}
              {issue.message}
            </li>
          ))}
        </ul>
      </Collapse>
    </Alert>
  );
}
