import type { EvaluatedMatch } from '../types/tournament';

/** Most recent first: by date when both matches have one, otherwise by workbook position. */
export function recentFirst(a: EvaluatedMatch, b: EvaluatedMatch): number {
  if (a.date && b.date && a.date.getTime() !== b.date.getTime()) return b.date.getTime() - a.date.getTime();
  return b.order - a.order;
}
