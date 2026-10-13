/**
 * Timestamps are stored in UTC and shown in VITE_DISPLAY_TIMEZONE (an IANA zone such as
 * "Asia/Kolkata"), so every viewer sees the tournament's local time. Unset: the viewer's own zone.
 */
export const DISPLAY_TIMEZONE = validTimeZone(import.meta.env.VITE_DISPLAY_TIMEZONE);

function validTimeZone(zone: string | undefined): string | undefined {
  if (!zone) return undefined;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

const dayKey = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: DISPLAY_TIMEZONE });

export function formatRefreshTime(date: Date | null): string {
  if (!date) return 'Not yet loaded';
  const sameDay = dayKey(date) === dayKey(new Date());
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: DISPLAY_TIMEZONE });
  return sameDay
    ? time
    : `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: DISPLAY_TIMEZONE })}, ${time}`;
}

/** Always includes the date, e.g. "13 Oct 2026, 2:05 PM" (plus the zone when one is configured). */
export function formatDateTime(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DISPLAY_TIMEZONE,
    ...(DISPLAY_TIMEZONE && { timeZoneName: 'short' }),
  });
}

export function formatMatchDate(date: Date | null): string | null {
  return date ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
}

/** "Match 12" when the workbook id is a bare number, otherwise the id as written. */
export function matchTitle(id: string, hasWorkbookId: boolean): string | null {
  if (!hasWorkbookId) return null;
  return /^\d+$/.test(id) ? `Match ${id}` : id;
}

export const plural = (n: number, word: string, pluralWord = `${word}s`) => `${n} ${n === 1 ? word : pluralWord}`;

/** "G01 · Group A · Round 1 · 12 Oct 2026" — whichever parts the workbook provides. */
export function matchHeading(m: {
  id: string;
  hasWorkbookId: boolean;
  group: string | null;
  round: string | null;
  date: Date | null;
}): string {
  return [matchTitle(m.id, m.hasWorkbookId), m.group && `Group ${m.group}`, m.round, formatMatchDate(m.date)]
    .filter(Boolean)
    .join(' · ');
}
