// Pure tidy-tree layout: every parent is centred above its children, leaves never overlap

export interface LayoutNode { id: string; level: number }
export interface LayoutEdge { source: string; target: string }

export const NODE_WIDTH = 220;
export const H_GAP = 36;
export const V_GAP = 150;

export function layoutTree(rootId: string, nodes: LayoutNode[], edges: LayoutEdge[]): Map<string, { x: number; y: number }> {
  const children = new Map<string, string[]>();
  for (const e of edges) {
    const list = children.get(e.source) ?? [];
    list.push(e.target);
    children.set(e.source, list);
  }
  const levelOf = new Map(nodes.map(n => [n.id, n.level]));

  const slot = NODE_WIDTH + H_GAP;
  const widths = new Map<string, number>();
  const measure = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return slot;
    seen.add(id);
    const kids = children.get(id) ?? [];
    const w = kids.length === 0 ? slot : Math.max(slot, kids.reduce((sum, k) => sum + measure(k, seen), 0));
    widths.set(id, w);
    return w;
  };
  measure(rootId, new Set());

  const positions = new Map<string, { x: number; y: number }>();
  const place = (id: string, left: number) => {
    const w = widths.get(id) ?? slot;
    positions.set(id, { x: left + w / 2 - NODE_WIDTH / 2, y: (levelOf.get(id) ?? 0) * V_GAP });
    let cursor = left;
    for (const k of children.get(id) ?? []) {
      place(k, cursor);
      cursor += widths.get(k) ?? slot;
    }
  };
  place(rootId, 0);

  return positions;
}
