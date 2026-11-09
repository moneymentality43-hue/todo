// Shared input limits and validators. Safe to import from client and server code.

export const FIELD_LIMITS = {
  usernameMin: 3,
  usernameMax: 30,
  passwordMin: 10,
  passwordMax: 64,
  passwordMaxBytes: 72, // bcrypt ignores everything past 72 bytes
  title: 120,
  microStep: 200,
  longText: 6000, // roughly 1000 words
  score: 20,
  completedAt: 40,
  dateString: 20,
  metricName: 60,
  maxValue: 1_000_000_000,
  maxMinutes: 10_080, // one week
} as const;

export const TASK_RAILS = ['urgent', 'exploration'] as const;
export const LIGHT_COLORS = ['white', 'red', 'amber', 'yellow'] as const;

const USERNAME_PATTERN = /^[a-z0-9_.-]+$/;

export function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateUsername(value: unknown): { ok: true; username: string } | { ok: false; error: string } {
  const username = normalizeUsername(value);
  const { usernameMin: min, usernameMax: max } = FIELD_LIMITS;
  if (username.length < min || username.length > max) {
    return { ok: false, error: `Username must be ${min}-${max} characters.` };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, error: 'Username may only contain letters, numbers, underscore, dot and hyphen.' };
  }
  return { ok: true, username };
}

export const PASSWORD_RULES = [
  { id: 'length', label: `${FIELD_LIMITS.passwordMin}-${FIELD_LIMITS.passwordMax} characters`, test: (p: string) => p.length >= FIELD_LIMITS.passwordMin && p.length <= FIELD_LIMITS.passwordMax },
  { id: 'lower', label: 'A lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { id: 'upper', label: 'An uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'digit', label: 'A number', test: (p: string) => /[0-9]/.test(p) },
  { id: 'symbol', label: 'A symbol', test: (p: string) => /[^A-Za-z0-9\s]/.test(p) },
] as const;

// Used on signup only; sign-in just caps the length so older accounts keep working
export function validateNewPassword(value: unknown, username?: string): { ok: true } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Password is required.' };
  if (/\s/.test(value)) return { ok: false, error: 'Password must not contain spaces.' };
  if (new TextEncoder().encode(value).length > FIELD_LIMITS.passwordMaxBytes) {
    return { ok: false, error: `Password is too long (max ${FIELD_LIMITS.passwordMax} characters).` };
  }
  const failed = PASSWORD_RULES.find(r => !r.test(value));
  if (failed) return { ok: false, error: `Password needs: ${failed.label.toLowerCase()}.` };
  if (username && value.toLowerCase().includes(username)) {
    return { ok: false, error: 'Password must not contain your username.' };
  }
  return { ok: true };
}

export function isPasswordWithinLimit(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= FIELD_LIMITS.passwordMax &&
    new TextEncoder().encode(value).length <= FIELD_LIMITS.passwordMaxBytes
  );
}

// Trims and bounds a string. Throws so server actions reject tampered input instead of storing it.
export function requireText(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} is required`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${label} is required`);
  if (trimmed.length > max) throw new Error(`${label} is too long (max ${max} characters)`);
  return trimmed;
}

export function optionalText(value: unknown, max: number, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`${label} is invalid`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`${label} is too long (max ${max} characters)`);
  return trimmed;
}

export function requireInt(value: unknown, min: number, max: number, label: string): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${label} must be a whole number between ${min} and ${max}`);
  }
  return n;
}

export function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as T;
}

export function requireDate(value: unknown, label: string): Date {
  if (typeof value !== 'string' && !(value instanceof Date)) throw new Error(`${label} is invalid`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`${label} is invalid`);
  return d;
}
