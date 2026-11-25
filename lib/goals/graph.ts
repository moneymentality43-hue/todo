import type {
  GoalSummary,
  GoalTaskDTO,
  GoalTree,
  GraphGoalNode,
  GraphTaskNode,
} from '../../types/goals';

// Pure client-side BFS to build the goal tree from GoalsProvider's in-memory goals and tasks.
export function buildGoalTree(
  goals: GoalSummary[],
  tasks: GoalTaskDTO[],
  rootId: string,
  depth: 1 | 2,
  includeTasks: boolean,
  onlyInProgress = false,
): GoalTree | null {
  const maxLevel = depth === 2 ? 2 : 1;
  const byId = new Map(goals.map(g => [g.id, g]));
  const root = byId.get(rootId);
  if (!root) return null;
  if (onlyInProgress && root.status !== 'IN_PROGRESS') return null;

  const childrenOf = new Map<string, GoalSummary[]>();
  for (const g of goals) {
    if (!g.parentId) continue;
    if (onlyInProgress && g.status !== 'IN_PROGRESS') continue;
    const list = childrenOf.get(g.parentId) ?? [];
    list.push(g);
    childrenOf.set(g.parentId, list);
  }

  const nodes: (GraphGoalNode | GraphTaskNode)[] = [];
  const edges: GoalTree['edges'] = [];
  const goalLevels = new Map<string, number>();
  const queue: { id: string; level: number }[] = [{ id: root.id, level: 0 }];

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    const g = byId.get(id);
    if (!g || goalLevels.has(id)) continue;

    goalLevels.set(id, level);
    nodes.push({
      kind: 'goal',
      id: g.id,
      name: g.name,
      status: g.status,
      level,
      subGoalCount: g.subGoalCount,
      taskCount: g.taskCount,
      deepMinutes: g.deepMinutes,
      shallowMinutes: g.shallowMinutes,
    });

    if (level < maxLevel) {
      for (const child of childrenOf.get(id) ?? []) {
        edges.push({ id: `e-${id}-${child.id}`, source: id, target: child.id });
        queue.push({ id: child.id, level: level + 1 });
      }
    }
  }

  if (includeTasks) {
    const visibleTasks = tasks
      .filter(t => t.goalId && goalLevels.has(t.goalId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const t of visibleTasks) {
      if (!t.goalId) continue;
      nodes.push({
        kind: 'task',
        id: t.id,
        title: t.title,
        metricType: t.metricType,
        unit: t.unit,
        current: t.current,
        target: t.target,
        goalId: t.goalId,
        level: (goalLevels.get(t.goalId) ?? 0) + 1,
      });
      edges.push({ id: `e-${t.goalId}-${t.id}`, source: t.goalId, target: t.id });
    }
  }

  return { rootId, nodes, edges };
}
