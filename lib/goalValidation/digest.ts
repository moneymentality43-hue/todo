import type { DueGoal } from './settings';

const MAX_BODY_CHARS = 900;

// One line per top-level goal: "Career: Learn Rust, Ship app". Groups are ordered by name, and inside a
// group by depth then name. A due top-level goal is listed first as "itself".
export function buildDigest(due: DueGoal[]): { count: number; body: string } {
  const groups = new Map<string, { name: string; items: DueGoal[] }>();
  for (const g of due) {
    const group = groups.get(g.rootId) ?? { name: g.rootName, items: [] };
    group.items.push(g);
    groups.set(g.rootId, group);
  }

  const lines = [...groups.entries()]
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([rootId, group]) => {
      const items = [...group.items].sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
      const labels = items.map((i) => (i.id === rootId ? 'itself' : i.name));
      const alone = items.length === 1 && items[0].id === rootId;
      return { count: items.length, text: alone ? group.name : `${group.name}: ${labels.join(', ')}` };
    });

  const kept: string[] = [];
  let used = 0;
  let shown = 0;
  for (const line of lines) {
    if (kept.length > 0 && used + line.text.length > MAX_BODY_CHARS) break;
    kept.push(line.text.slice(0, MAX_BODY_CHARS));
    used += line.text.length + 1;
    shown += line.count;
  }
  if (shown < due.length) kept.push(`+${due.length - shown} more`);

  return { count: due.length, body: kept.join('\n') };
}
