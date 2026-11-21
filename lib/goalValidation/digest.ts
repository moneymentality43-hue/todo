import type { DueGoal } from './settings';

const MAX_BODY_CHARS = 900;

// One goal per line: "Career" for a top-level goal, "Career › Learn Rust" for a nested one. Goals are
// ordered by top-level goal name, then depth, then name.
export function buildDigest(due: DueGoal[]): { count: number; body: string } {
  const lines = [...due]
    .sort((a, b) => a.rootName.localeCompare(b.rootName) || a.rootId.localeCompare(b.rootId) || a.depth - b.depth || a.name.localeCompare(b.name))
    .map((g) => (g.id === g.rootId ? g.name : `${g.rootName} › ${g.name}`));

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
