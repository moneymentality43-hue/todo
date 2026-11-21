// Pure helpers for working with wall-clock time in an IANA timezone.

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  minuteOfDay: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function readParts(date: Date, timeZone: string) {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

export function localParts(date: Date, timeZone: string): LocalParts {
  const p = readParts(date, timeZone);
  return { year: p.year, month: p.month, day: p.day, minuteOfDay: p.hour * 60 + p.minute };
}

// Offset (ms) of the timezone from UTC at the given instant
function offsetMs(date: Date, timeZone: string): number {
  const p = readParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// The UTC instant at which the wall clock in `timeZone` reads y-m-d at `minuteOfDay`.
// Day overflow (e.g. day 32) is normalised by Date.UTC. Two passes settle the offset around DST changes.
export function zonedToUtc(year: number, month: number, day: number, minuteOfDay: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  let result = guess - offsetMs(new Date(guess), timeZone);
  result = guess - offsetMs(new Date(result), timeZone);
  return new Date(result);
}

export function localDateKey(parts: LocalParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
