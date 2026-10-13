import { Box, Tooltip } from '@mui/material';
import type { FormResult } from '../../types/tournament';
import { colors } from '../../theme';

/** Last few results as W/L tiles, most recent on the right. */
export function FormChips({ form, max = 5 }: { form: FormResult[]; max?: number }) {
  const recent = form.slice(-max);
  if (recent.length === 0) return <span className="text-sm text-slate-400">—</span>;
  return (
    <Tooltip title={`Last ${recent.length}: ${recent.map((r) => (r === 'W' ? 'Won' : 'Lost')).join(', ')}`}>
      <div className="inline-flex gap-1" role="img" aria-label={`Recent form ${recent.join(' ')}`}>
        {recent.map((r, i) => (
          <Box
            key={i}
            sx={{
              width: 20,
              height: 20,
              borderRadius: 0.75,
              bgcolor: r === 'W' ? colors.win : colors.loss,
              color: '#fff',
              fontSize: '0.6875rem',
              fontWeight: 700,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {r}
          </Box>
        ))}
      </div>
    </Tooltip>
  );
}
