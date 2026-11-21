import type { DueGoal } from './settings';

const MAX_BODY_CHARS = 900;

// One bullet per goal, using just the goal name, sorted alphabetically.
export function buildDigest(due: DueGoal[]): { count: number; body: string } {
  const lines = due.map((g) => `• ${g.name}`).sort((a, b) => a.localeCompare(b));

  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (kept.length > 0 && used + line.length > MAX_BODY_CHARS) break;
    kept.push(line.slice(0, MAX_BODY_CHARS));
    used += line.length + 1;
  }
  if (kept.length < due.length) kept.push(`+${due.length - kept.length} more`);

  return { count: due.length, body: kept.join('\n') };
}
