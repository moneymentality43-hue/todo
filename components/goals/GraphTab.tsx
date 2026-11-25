"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, Controls, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow,
  type Edge, type Node, type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChevronDown, Network } from 'lucide-react';
import { useGoals } from '../../app/goals/GoalsProvider';
import type { GoalSummary, GoalTree } from '../../types/goals';
import { buildGoalTree } from '../../lib/goals/graph';
import { layoutTree } from '../../lib/goals/treeLayout';
import GoalPicker from './GoalPicker';
import { GoalNode, TaskLeafNode, type GoalNodeData, type TaskNodeData } from './GoalNode';
import StatusBadge from './StatusBadge';

// Defined outside the component so React Flow does not remount nodes on every render
const nodeTypes = { goal: GoalNode, task: TaskLeafNode };

function buildNodeData(tree: GoalTree): Map<string, GoalNodeData | TaskNodeData> {
  const map = new Map<string, GoalNodeData | TaskNodeData>();
  for (const n of tree.nodes) {
    if (n.kind === 'goal') {
      map.set(n.id, {
        name: n.name,
        status: n.status,
        subGoalCount: n.subGoalCount,
        taskCount: n.taskCount,
        isRoot: n.id === tree.rootId,
        deepMinutes: n.deepMinutes,
        shallowMinutes: n.shallowMinutes,
      });
    } else {
      map.set(n.id, {
        title: n.title,
        metricType: n.metricType,
        unit: n.unit,
        current: n.current,
        target: n.target,
        goalId: n.goalId,
      });
    }
  }
  return map;
}

function buildFlowNodes(tree: GoalTree): Node[] {
  const positions = layoutTree(tree.rootId, tree.nodes.map(n => ({ id: n.id, level: n.level })), tree.edges);
  const dataById = buildNodeData(tree);

  return tree.nodes.map(n => {
    const position = positions.get(n.id) ?? { x: 0, y: 0 };
    const data = dataById.get(n.id)!;
    if (n.kind === 'goal') {
      return { id: n.id, type: 'goal', position, data };
    }
    return { id: n.id, type: 'task', position, data, draggable: true };
  });
}

function getTopologyKey(tree: GoalTree): string {
  const nodeIds = tree.nodes.map(n => `${n.kind}:${n.id}:${n.level}`).sort().join(',');
  const edgeIds = tree.edges.map(e => `${e.source}->${e.target}`).sort().join(',');
  return `${tree.rootId}|${nodeIds}|${edgeIds}`;
}

interface FlowProps {
  tree: GoalTree;
  onGoalClick: (goalId: string) => void;
}

function Flow({ tree, onGoalClick }: FlowProps) {
  const { fitView } = useReactFlow();
  const topologyKey = useMemo(() => getTopologyKey(tree), [tree]);

  const edges = useMemo<Edge[]>(() => {
    const taskIds = new Set(tree.nodes.filter(n => n.kind === 'task').map(n => n.id));
    return tree.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      style: taskIds.has(e.target)
        ? { stroke: '#404040', strokeDasharray: '4 4' }
        : { stroke: '#737373', strokeWidth: 1.5 },
    }));
  }, [tree.nodes, tree.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const lastTopology = useRef<string | null>(null);

  useEffect(() => {
    if (lastTopology.current !== topologyKey) {
      // Structure changed (or initial mount): compute layout and frame the graph
      lastTopology.current = topologyKey;
      setNodes(buildFlowNodes(tree));
      const t = setTimeout(() => fitView({ padding: 0.25, duration: 300, maxZoom: 1.1 }), 60);
      return () => clearTimeout(t);
    }
    // Data-only change (e.g., +15m or rename): skip layoutTree() and preserve dragged positions + camera
    const dataById = buildNodeData(tree);
    setNodes(prev => prev.map(n => {
      const nextData = dataById.get(n.id);
      return nextData ? { ...n, data: nextData } : n;
    }));
  }, [tree, topologyKey, setNodes, fitView]);

  const handleNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.type === 'goal') onGoalClick(node.id);
    else {
      const data = node.data as TaskNodeData;
      if (data?.goalId) onGoalClick(data.goalId);
    }
  }, [onGoalClick]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onNodeClick={handleNodeClick}
      nodeTypes={nodeTypes}
      colorMode="dark"
      nodesConnectable={false}
      elementsSelectable={false}
      minZoom={0.2}
      maxZoom={1.6}
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
      style={{ background: '#000000' }}
    >
      <Background color="#1f1f1f" gap={24} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export default function GraphTab() {
  const { goals, tasks, loading, openGoal } = useGoals();
  const [chosenRootId, setChosenRootId] = useState<string | null>(null);
  const [depth, setDepth] = useState<1 | 2>(1);
  const [showTasks, setShowTasks] = useState(false);
  const [onlyInProgress, setOnlyInProgress] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // The user's pick wins while it still exists and matches the filter; otherwise fall back to a sensible default
  const rootId = useMemo(() => {
    const matchesFilter = (g: GoalSummary) => !onlyInProgress || g.status === 'IN_PROGRESS';
    if (chosenRootId) {
      const chosen = goals.find(g => g.id === chosenRootId);
      if (chosen && matchesFilter(chosen)) return chosen.id;
    }
    const pool = goals.filter(matchesFilter);
    const candidate =
      pool.find(g => !g.parentId && g.status !== 'COMPLETED' && g.subGoalCount > 0) ??
      pool.find(g => !g.parentId && g.status !== 'COMPLETED') ??
      pool[0] ?? null;
    return candidate?.id ?? null;
  }, [chosenRootId, goals, onlyInProgress]);

  const visibleTree = useMemo(
    () => (rootId ? buildGoalTree(goals, tasks, rootId, depth, showTasks, onlyInProgress) : null),
    [goals, tasks, rootId, depth, showTasks, onlyInProgress],
  );

  const root = goals.find(g => g.id === rootId) ?? null;

  const pickable = useMemo(
    () => goals.filter(g => {
      if (onlyInProgress) return g.status === 'IN_PROGRESS';
      return showCompleted || g.status !== 'COMPLETED' || g.id === rootId;
    }),
    [goals, onlyInProgress, showCompleted, rootId],
  );

  if (!loading && goals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-800 py-14 text-center">
        <Network className="w-8 h-8 mx-auto text-neutral-700" />
        <p className="mt-3 text-sm text-neutral-300">Nothing to show yet</p>
        <p className="mt-1 text-xs text-neutral-600">Create goals and link sub-goals to see them as a graph.</p>
      </div>
    );
  }

  const hasChildren = !!visibleTree && visibleTree.nodes.some(n => n.kind === 'goal' && n.id !== visibleTree.rootId);

  return (
    <div>
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        {/* Root selector */}
        <div className="relative lg:w-80">
          <button
            onClick={() => setPickerOpen(o => !o)}
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            className="w-full flex items-center justify-between gap-3 rounded-xl border border-[#262626] bg-[#141414] px-3.5 py-2.5 text-left hover:border-neutral-500 transition-colors"
          >
            <span className="min-w-0">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500">Parent goal</span>
              <span className="block text-sm text-white truncate">{root?.name ?? 'Select a goal'}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {root && <StatusBadge status={root.status} />}
              <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
            </span>
          </button>

          {pickerOpen && (
            <>
              <button aria-label="Close" className="fixed inset-0 z-20 cursor-default" onClick={() => setPickerOpen(false)} />
              <div className="absolute z-30 mt-2 w-full shadow-2xl">
                <GoalPicker
                  goals={pickable}
                  onPick={g => { setChosenRootId(g.id); setPickerOpen(false); }}
                  placeholder="Search goals…"
                  emptyText={onlyInProgress ? 'No in-progress goals found.' : undefined}
                />
              </div>
            </>
          )}
        </div>

        {/* Depth */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">Branching</span>
          <div role="radiogroup" aria-label="Branching level" className="inline-flex p-0.5 rounded-full bg-neutral-950 border border-neutral-800">
            {([1, 2] as const).map(d => (
              <button
                key={d}
                role="radio"
                aria-checked={depth === d}
                onClick={() => setDepth(d)}
                className={`w-10 py-1 rounded-full text-xs font-semibold transition-all ${depth === d ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 lg:ml-auto text-xs text-neutral-400">
          <label className="flex items-center gap-2 cursor-pointer select-none hover:text-white transition-colors">
            <input type="checkbox" checked={showTasks} onChange={e => setShowTasks(e.target.checked)} className="accent-white w-3.5 h-3.5" /> Show tasks
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={onlyInProgress}
              onChange={e => {
                const next = e.target.checked;
                setOnlyInProgress(next);
                if (next) setShowCompleted(false);
              }}
              className="accent-white w-3.5 h-3.5"
            /> In progress only
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={e => {
                const next = e.target.checked;
                setShowCompleted(next);
                if (next) setOnlyInProgress(false);
              }}
              className="accent-white w-3.5 h-3.5"
            /> Show completed
          </label>
        </div>
      </div>

      <div className="relative mt-4 h-[62vh] min-h-[380px] rounded-2xl border border-[#222222] overflow-hidden bg-black">
        {visibleTree && rootId ? (
          <>
            <ReactFlowProvider>
              <Flow tree={visibleTree} onGoalClick={id => openGoal(id)} />
            </ReactFlowProvider>
            {!hasChildren && !showTasks && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded-full border border-neutral-800 bg-black/90 px-4 py-2 text-[11px] text-neutral-400 text-center">
                {onlyInProgress && (root?.subGoalCount ?? 0) > 0
                  ? 'No in-progress sub-goals under this goal.'
                  : 'This goal has no sub-goals yet. Open it to create or link one.'}
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-xs font-mono text-neutral-600">
            {loading
              ? 'Building graph…'
              : onlyInProgress
                ? 'No in-progress goals to display.'
                : 'Select a parent goal to see its branches.'}
          </div>
        )}
      </div>
    </div>
  );
}
