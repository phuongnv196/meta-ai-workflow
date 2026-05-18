import { create } from 'zustand';
import { REFERENCE_NODE_TYPES } from '../constants';
import { executeViaSSE } from '../utils/sse-client';

// ── Helpers ──────────────────────────────────────────────────────────────

function topologicalSort(nodesList, edgesList) {
  const adj = {};
  const inDegree = {};
  nodesList.forEach(n => { adj[n.id] = []; inDegree[n.id] = 0; });
  edgesList.forEach(e => {
    if (adj[e.source]) { adj[e.source].push(e.target); inDegree[e.target]++; }
  });
  const queue = nodesList.filter(n => inDegree[n.id] === 0).map(n => n.id);
  const order = [];
  while (queue.length > 0) {
    const curr = queue.shift();
    order.push(curr);
    (adj[curr] || []).forEach(nb => { inDegree[nb]--; if (inDegree[nb] === 0) queue.push(nb); });
  }
  return order;
}

/**
 * Builds the shared SSE event callbacks used by all three run modes.
 */
function buildSSECallbacks(get, set) {
  const { addLog, updateNodeData } = get();

  function handleNodeResult(nodeId, result, label) {
    const updateData = { error: null, ...result };
    if (result.videoUrl) updateData.resultUrl = result.videoUrl;
    updateNodeData(nodeId, updateData);

    if (result.videoUrl) {
      addLog({ type: 'image', message: `Result for ${label}: ${result.videoUrl}` });
    } else {
      addLog({ type: 'success', message: `✅ Completed: ${label}` });
    }
  }

  return {
    onWorkflowStarted: (data) => {
      addLog({ type: 'info', message: `Workflow started (${data.totalNodes} nodes).` });
    },
    onNodeStarted: (data) => {
      set({ executingNodeId: data.nodeId });
      addLog({ type: 'info', message: `⚡ Executing: ${data.label} (${data.type})...` });
    },
    onNodeCompleted: (data) => {
      handleNodeResult(data.nodeId, data.result, data.label);
    },
    onNodeFailed: (data) => {
      updateNodeData(data.nodeId, { resultUrl: null, error: data.error });
      addLog({ type: 'error', message: `❌ Failed: ${data.label} - ${data.error}` });
    },
    onWorkflowCompleted: () => {
      addLog({ type: 'success', message: '🎉 Execution completed successfully!' });
    },
    onWorkflowFailed: (data) => {
      throw new Error(data.error || 'Execution failed');
    },
  };
}

// ── Store ────────────────────────────────────────────────────────────────

const useWorkflowStore = create((set, get) => ({
  nodes: [],
  edges: [],
  activeConnection: null,
  isRunning: false,
  executingNodeId: null,
  logs: [],

  setActiveConnection: (connection) => set({ activeConnection: connection }),

  addNode: (node) => set((state) => {
    let updatedNode = { ...node };
    if (REFERENCE_NODE_TYPES.includes(node.type)) {
      let maxNum = 0;
      state.nodes.forEach(n => {
        if (n.data?.refName && n.data.refName.startsWith('reference_')) {
          const num = parseInt(n.data.refName.split('_')[1], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      updatedNode.data = {
        ...updatedNode.data,
        refName: `reference_${String(maxNum + 1).padStart(2, '0')}`,
      };
    }
    return { nodes: [...state.nodes, updatedNode] };
  }),

  updateNodePosition: (id, position) => set((state) => ({
    nodes: state.nodes.map((n) => n.id === id ? { ...n, position } : n),
  })),

  updateNodeData: (id, data) => set((state) => ({
    nodes: state.nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...data } } : n),
  })),

  updateNodeDimensions: (id, dimensions) => set((state) => ({
    nodes: state.nodes.map((n) => n.id === id ? { ...n, dimensions } : n),
  })),

  addEdge: (edge) => set((state) => ({
    edges: [...state.edges, { ...edge, id: `e${edge.source}-${edge.target}` }],
    activeConnection: null,
  })),

  removeNode: (id) => set((state) => ({
    nodes: state.nodes.filter((n) => n.id !== id),
    edges: state.edges.filter((e) => e.source !== id && e.target !== id),
  })),

  removeEdge: (id) => set((state) => ({
    edges: state.edges.filter((e) => e.id !== id),
  })),

  setExecutingNode: (id) => set({ executingNodeId: id }),
  setRunning: (val) => set({ isRunning: val }),
  addLog: (log) => set((state) => ({ logs: [...state.logs, { id: Date.now(), ...log }] })),
  clearLogs: () => set({ logs: [] }),

  // ── Run all nodes ───────────────────────────────────────────────────

  runWorkflow: async () => {
    const { nodes, edges, addLog, clearLogs } = get();
    if (nodes.length === 0) return;

    clearLogs();
    set({ isRunning: true });
    addLog({ type: 'info', message: 'Starting workflow execution...' });

    try {
      await executeViaSSE({ nodes, edges }, buildSSECallbacks(get, set));
    } catch (error) {
      addLog({ type: 'error', message: `Execution Error: ${error.message}` });
      console.error('Workflow Execution Error:', error);
    } finally {
      set({ executingNodeId: null, isRunning: false });
    }
  },

  // ── Run next unfinished step ────────────────────────────────────────

  runStep: async () => {
    const { nodes, edges, addLog } = get();
    if (nodes.length === 0) return;

    const order = topologicalSort(nodes, edges);
    const nextNodeId = order.find(id => {
      const n = nodes.find(nd => nd.id === id);
      return n && !n.data.resultUrl && !n.data.error;
    });

    if (!nextNodeId) {
      addLog({ type: 'info', message: 'Tất cả các node đã được chạy xong!' });
      return;
    }

    const targetNode = nodes.find(n => n.id === nextNodeId);
    set({ isRunning: true, executingNodeId: nextNodeId });
    addLog({ type: 'info', message: `🎬 [Step] ${targetNode.data.label}...` });

    try {
      await executeViaSSE({ nodes, edges, targetNodeId: nextNodeId }, buildSSECallbacks(get, set));
    } catch (error) {
      addLog({ type: 'error', message: `Lỗi khi chạy step: ${error.message}` });
    } finally {
      set({ executingNodeId: null, isRunning: false });
    }
  },

  // ── Run a single node by ID ─────────────────────────────────────────

  runSingleNode: async (nodeId) => {
    const { nodes, edges, addLog } = get();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    set({ isRunning: true, executingNodeId: nodeId });
    addLog({ type: 'info', message: `🎬 Running: ${node.data.label}...` });

    try {
      await executeViaSSE({ nodes, edges, targetNodeId: nodeId }, buildSSECallbacks(get, set));
    } catch (error) {
      addLog({ type: 'error', message: `Lỗi khi chạy node: ${error.message}` });
    } finally {
      set({ executingNodeId: null, isRunning: false });
    }
  },
}));

export default useWorkflowStore;
