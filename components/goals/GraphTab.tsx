"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background, Controls, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow,
  type Edge, type Node, type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChevronDown, Network } from 'lucide-react';
import { getGoalTree } from '../../app/goals/actions';
import { useGoals } from '../../app/goals/GoalsProvider';
import type { GoalTree } from '../../types/goals';
import { layoutTree } from '../../lib/goals/treeLayout';
import GoalPicker from './GoalPicker';
import { GoalNode, TaskLeafNode, type GoalNodeData, type TaskNodeData } from './GoalNode';
import StatusBadge from './StatusBadge';

// Defined outside the component so React Flow does not remount nodes on every render
const nodeTypes = { goal: GoalNode, task: TaskLeafNode };

function buildFlow(tree: GoalTree): { nodes: Node[]; edges: Edge[] } {
  const positions = layoutTree(tree.rootId, tree.nodes.map(n => ({ id: n.id, level: n.level })), tree.edges);

  const nodes: Node[] = tree.nodes.map(n => {
    const position = positions.get(n.id) ?? { x: 0, y: 0 };
    if (n.kind === 'goal') {
      const data: GoalNodeData = {
        name: n.name, status: n.status, subGoalCount: n.subGoalCount, taskCount: n.taskCount, isRoot: n.id === tree.rootId,
      };
      return { id: n.id, type: 'goal', position, data };
    }
    const data: TaskNodeData = { title: n.title, metricType: n.metricType, unit: n.unit, current: n.current, target: n.target };
    return { id: n.id, type: 'task', position, data, draggable: true };
  });

  const taskIds = new Set(tree.nodes.filter(n => n.kind === 'task').map(n => n.id));
  const edges: Edge[] = tree.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    style: taskIds.has(e.target)
      ? { stroke: '#404040', strokeDasharray: '4 4' }
      : { stroke: '#737373', strokeWidth: 1.5 },
  }));

  return { nodes, edges };
}

interface FlowProps {
  tree: GoalTree;
  onGoalClick: (goalId: string) => void;
}

function Flow({ tree, onGoalClick }: FlowProps) {
  const { fitView } = useReactFlow();
  const built = useMemo(() => buildFlow(tree), [tree]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(built.nodes);

  useEffect(() => {
    setNodes(built.nodes);
    const t = setTimeout(() => fitView({ padding: 0.25, duration: 300, maxZoom: 1.1 }), 60);
    return () => clearTimeout(t);
  }, [built, setNodes, fitView]);

  const handleNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.type === 'goal') onGoalClick(node.id);
    else {
      const t = tree.nodes.find(n => n.id === node.id);
      if (t && t.kind === 'task') onGoalClick(t.goalId);
    }
  }, [onGoalClick, tree.nodes]);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={built.edges}
        onNodesChange={onNodesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        colorMode="dark"
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.2}
        maxZoom={1.6}
        fitView
        style={{ background: '#000000' }}
      >
        <Background color="#1f1f1f" gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </>
  );
}

export default function GraphTab() {
  const { goals, loading, version, openGoal, notify } = useGoals();

  const [chosenRootId, setChosenRootId] = useState<string | null>(null);
  const [depth, setDepth] = useState<1 | 2>(1);
  const [showTasks, setShowTasks] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [tree, setTree] = useState<GoalTree | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  // The user's pick wins while it still exists; otherwise fall back to a sensible default
  const rootId = useMemo(() => {
    if (chosenRootId && goals.some(g => g.id === chosenRootId)) return chosenRootId;
    const candidate =
      goals.find(g => !g.parentId && g.status !== 'COMPLETED' && g.subGoalCount > 0) ??
      goals.find(g => !g.parentId && g.status !== 'COMPLETED') ??
      goals[0] ?? null;
    return candidate?.id ?? null;
  }, [chosenRootId, goals]);

  const requestKey = rootId ? `${rootId}|${depth}|${showTasks}|${version}` : null;
  const fetching = requestKey !== null && loadedKey !== requestKey;

  useEffect(() => {
    if (!rootId || !requestKey) return;
    let cancelled = false;
    getGoalTree(rootId, depth, showTasks)
      .then(result => {
        if (cancelled) return;
        setTree(result);
        setLoadedKey(requestKey);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadedKey(requestKey);
        notify('Could not load the graph.');
      });
    return () => { cancelled = true; };
  }, [rootId, depth, showTasks, requestKey, notify]);

  const visibleTree = tree && tree.rootId === rootId ? tree : null;
  const root = goals.find(g => g.id === rootId) ?? null;
  const pickable = useMemo(
    () => goals.filter(g => showCompleted || g.status !== 'COMPLETED' || g.id === rootId),
    [goals, showCompleted, rootId],
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

        <div className="flex items-center gap-4 lg:ml-auto text-xs text-neutral-400">
          <label className="flex items-center gap-2 cursor-pointer select-none hover:text-white transition-colors">
            <input type="checkbox" checked={showTasks} onChange={e => setShowTasks(e.target.checked)} className="accent-white w-3.5 h-3.5" /> Show tasks
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none hover:text-white transition-colors">
            <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} className="accent-white w-3.5 h-3.5" /> Show completed
          </label>
        </div>
      </div>

      <div className="relative mt-4 h-[62vh] min-h-[380px] rounded-2xl border border-[#222222] overflow-hidden bg-black">
        {visibleTree && rootId ? (
          <>
            <ReactFlowProvider>
              <Flow tree={visibleTree} onGoalClick={id => openGoal(id)} />
            </ReactFlowProvider>
            {!hasChildren && !showTasks && !fetching && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded-full border border-neutral-800 bg-black/90 px-4 py-2 text-[11px] text-neutral-400 text-center">
                This goal has no sub-goals yet. Open it to create or link one.
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-xs font-mono text-neutral-600">
            {loading || fetching ? 'Building graph…' : 'Select a parent goal to see its branches.'}
          </div>
        )}
        {fetching && visibleTree && <div className="absolute top-3 left-3 z-10 text-[10px] font-mono text-neutral-500">Updating…</div>}
      </div>
    </div>
  );
}
