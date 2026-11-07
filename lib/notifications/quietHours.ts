// Pure helpers for quiet hours. Times are minutes from midnight in the user's IANA timezone.

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function minuteOfDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export interface QuietWindow {
  timezone: string;
  quietStart: number | null;
  quietEnd: number | null;
}

function hasWindow(w: QuietWindow): w is QuietWindow & { quietStart: number; quietEnd: number } {
  return w.quietStart !== null && w.quietEnd !== null && w.quietStart !== w.quietEnd;
}

// Window may wrap past midnight (e.g. 22:00 -> 07:00)
export function isQuietNow(now: Date, w: QuietWindow): boolean {
  if (!hasWindow(w)) return false;
  const cur = minuteOfDay(now, w.timezone);
  return w.quietStart < w.quietEnd
    ? cur >= w.quietStart && cur < w.quietEnd
    : cur >= w.quietStart || cur < w.quietEnd;
}

// The moment quiet hours end, or null if not currently quiet
export function quietEndsAt(now: Date, w: QuietWindow): Date | null {
  if (!isQuietNow(now, w) || !hasWindow(w)) return null;
  const cur = minuteOfDay(now, w.timezone);
  const minutesLeft = (w.quietEnd - cur + 1440) % 1440 || 1440;
  const msIntoMinute = now.getUTCSeconds() * 1000 + now.getUTCMilliseconds();
  return new Date(now.getTime() - msIntoMinute + minutesLeft * 60_000);
}
