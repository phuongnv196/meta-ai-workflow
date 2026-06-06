import { create } from 'zustand';
import { REFERENCE_NODE_TYPES } from '../constants';
import { executeViaSSE } from '../utils/sse-client';
import { workflowApi } from '../api/workflow-api';
import { customNodeApi } from '../api/custom-node-api';

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
    
    // Protect HTTP Request node's request body configuration from being overwritten by the response body
    const node = get().nodes?.find(n => n.id === nodeId);
    if (node && node.type === 'http_request') {
      delete updateData.body;
      updateData.responseBody = result.body;
    }
    
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
      set((state) => ({ executingNodeIds: [...state.executingNodeIds, data.nodeId] }));
      addLog({ type: 'info', message: `⚡ Executing: ${data.label} (${data.type})...` });
    },
    onNodeCompleted: (data) => {
      set((state) => ({ executingNodeIds: state.executingNodeIds.filter(id => id !== data.nodeId) }));
      handleNodeResult(data.nodeId, data.result, data.label);
    },
    onNodeFailed: (data) => {
      set((state) => ({ executingNodeIds: state.executingNodeIds.filter(id => id !== data.nodeId) }));
      updateNodeData(data.nodeId, { resultUrl: null, error: data.error });
      addLog({ type: 'error', message: `❌ Failed: ${data.label} - ${data.error}` });
    },
    onWorkflowCompleted: () => {
      addLog({ type: 'success', message: '🎉 Execution completed successfully!' });
    },
    onWorkflowFailed: (data) => {
      throw new Error(data.error || 'Execution failed');
    },
    onNodeSkipped: (data) => {
      addLog({ type: 'info', message: `⏭ Skipped: ${data.label} (branch: ${data.branchId})` });
    },
  };
}

// ── Store ────────────────────────────────────────────────────────────────

const useWorkflowStore = create((set, get) => ({
  nodes: [],
  edges: [],
  activeConnection: null,
  isRunning: false,
  executingNodeIds: [],
  logs: [],
  abortController: null,
  selectedNodeIds: [],
  customNodeLibrary: [],

  // Workflow management
  workflowId: null,
  workflowName: '',
  workflowDescription: '',
  workflowTags: [],
  isSaving: false,
  isDirty: false,

  setActiveConnection: (connection) => set({ activeConnection: connection }),

  // ── Selection ──────────────────────────────────────────────────────
  setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
  toggleNodeSelection: (id) => set((state) => {
    const isSelected = state.selectedNodeIds.includes(id);
    return {
      selectedNodeIds: isSelected
        ? state.selectedNodeIds.filter(nid => nid !== id)
        : [...state.selectedNodeIds, id],
    };
  }),
  clearSelection: () => set({ selectedNodeIds: [] }),

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
    return { nodes: [...state.nodes, updatedNode], isDirty: true };
  }),

  updateNodePosition: (id, position) => set((state) => ({
    nodes: state.nodes.map((n) => n.id === id ? { ...n, position } : n),
    isDirty: true,
  })),

  updateNodeData: (id, data) => set((state) => ({
    nodes: state.nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...data } } : n),
    isDirty: true,
  })),

  updateNodeDimensions: (id, dimensions) => set((state) => ({
    nodes: state.nodes.map((n) => n.id === id ? { ...n, dimensions } : n),
  })),

  addEdge: (edge) => set((state) => {
    const edgeId = `e${edge.source}${edge.sourceHandle ? '-'+edge.sourceHandle : ''}-${edge.target}${edge.targetHandle ? '-'+edge.targetHandle : ''}`;
    // check duplicate edge
    if (state.edges.some(e => e.id === edgeId)) {
      return { activeConnection: null };
    }
    return {
      edges: [...state.edges, { ...edge, id: edgeId }],
      activeConnection: null,
      isDirty: true,
    };
  }),

  removeNode: (id) => set((state) => ({
    nodes: state.nodes.filter((n) => n.id !== id),
    edges: state.edges.filter((e) => e.source !== id && e.target !== id),
    isDirty: true,
  })),

  removeNodes: (ids) => set((state) => ({
    nodes: state.nodes.filter((n) => !ids.includes(n.id)),
    edges: state.edges.filter((e) => !ids.includes(e.source) && !ids.includes(e.target)),
    selectedNodeIds: state.selectedNodeIds.filter(id => !ids.includes(id)),
    isDirty: true,
  })),

  removeEdge: (id) => set((state) => ({
    edges: state.edges.filter((e) => e.id !== id),
    isDirty: true,
  })),

  setExecutingNode: (id) => set({ executingNodeIds: id ? [id] : [] }),
  setRunning: (val) => set({ isRunning: val }),
  addLog: (log) => set((state) => ({ logs: [...state.logs, { id: Date.now(), ...log }] })),
  clearLogs: () => set({ logs: [] }),

  stopWorkflow: () => {
    const { abortController, addLog } = get();
    if (abortController) {
      abortController.abort();
      addLog({ type: 'error', message: '🛑 Workflow execution stopped by user.' });
      set({ isRunning: false, executingNodeIds: [], abortController: null });
    }
  },

  // ── Run all nodes ───────────────────────────────────────────────────

  runWorkflow: async () => {
    const { nodes, edges, addLog, clearLogs } = get();
    if (nodes.length === 0) return;

    clearLogs();
    const abortController = new AbortController();
    set({ isRunning: true, executingNodeIds: [], abortController });
    addLog({ type: 'info', message: 'Starting workflow execution...' });

    try {
      await executeViaSSE({ nodes, edges }, buildSSECallbacks(get, set), abortController.signal);
    } catch (error) {
      if (error.name === 'AbortError') return;
      addLog({ type: 'error', message: `Execution Error: ${error.message}` });
      console.error('Workflow Execution Error:', error);
    } finally {
      set({ executingNodeIds: [], isRunning: false, abortController: null });
    }
  },

  // ── Run next unfinished step ────────────────────────────────────────

  runStep: async () => {
    const { nodes, edges, addLog } = get();
    if (nodes.length === 0) return;

    const order = topologicalSort(nodes, edges);
    const nextNodeId = order.find(id => {
      const n = nodes.find(nd => nd.id === id);
      return n && !n.data.resultUrl && !n.data.text && !n.data.error;
    });

    if (!nextNodeId) {
      addLog({ type: 'info', message: 'Tất cả các node đã được chạy xong!' });
      return;
    }

    const targetNode = nodes.find(n => n.id === nextNodeId);
    const abortController = new AbortController();
    set({ isRunning: true, executingNodeIds: [nextNodeId], abortController });
    addLog({ type: 'info', message: `🎬 [Step] ${targetNode.data.label}...` });

    try {
      await executeViaSSE({ nodes, edges, targetNodeId: nextNodeId }, buildSSECallbacks(get, set), abortController.signal);
    } catch (error) {
      if (error.name === 'AbortError') return;
      addLog({ type: 'error', message: `Lỗi khi chạy step: ${error.message}` });
    } finally {
      set({ executingNodeIds: [], isRunning: false, abortController: null });
    }
  },

  // ── Run a single node by ID ─────────────────────────────────────────

  runSingleNode: async (nodeId) => {
    const { nodes, edges, addLog } = get();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const abortController = new AbortController();
    set({ isRunning: true, executingNodeIds: [nodeId], abortController });
    addLog({ type: 'info', message: `🎬 Running: ${node.data.label}...` });

    try {
      await executeViaSSE({ nodes, edges, targetNodeId: nodeId }, buildSSECallbacks(get, set), abortController.signal);
    } catch (error) {
      if (error.name === 'AbortError') return;
      addLog({ type: 'error', message: `Lỗi khi chạy node: ${error.message}` });
    } finally {
      set({ executingNodeIds: [], isRunning: false, abortController: null });
    }
  },

  // ── Workflow Management ─────────────────────────────────────────────

  loadWorkflow: async (id) => {
    try {
      const workflow = await workflowApi.getById(id);
      set({
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowDescription: workflow.description || '',
        workflowTags: workflow.tags || [],
        nodes: workflow.nodes || [],
        edges: workflow.edges || [],
        isDirty: false,
        logs: [],
        executingNodeIds: [],
        isRunning: false,
      });
      return workflow;
    } catch (error) {
      console.error('Failed to load workflow:', error);
      throw error;
    }
  },

  saveWorkflow: async (thumbnail) => {
    const { workflowId, workflowName, workflowDescription, workflowTags, nodes, edges } = get();
    set({ isSaving: true });

    try {
      const payload = { name: workflowName, description: workflowDescription, tags: workflowTags, thumbnail, nodes, edges };
      let workflow;
      if (workflowId) {
        workflow = await workflowApi.update(workflowId, payload);
      } else {
        workflow = await workflowApi.create(payload);
        set({ workflowId: workflow.id });
      }
      set({ isDirty: false, isSaving: false });
      return workflow;
    } catch (error) {
      set({ isSaving: false });
      throw error;
    }
  },

  saveWorkflowAs: async ({ name, description, tags, thumbnail }) => {
    const { nodes, edges } = get();
    set({ isSaving: true });

    try {
      const workflow = await workflowApi.create({ name, description, tags, thumbnail, nodes, edges });
      set({
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowDescription: workflow.description || '',
        workflowTags: workflow.tags || [],
        isDirty: false,
        isSaving: false,
      });
      return workflow;
    } catch (error) {
      set({ isSaving: false });
      throw error;
    }
  },

  resetWorkflow: () => set({
    workflowId: null,
    workflowName: '',
    workflowDescription: '',
    workflowTags: [],
    nodes: [],
    edges: [],
    isDirty: false,
    logs: [],
    executingNodeIds: [],
    isRunning: false,
  }),

  setWorkflowMeta: (meta) => set((state) => ({
    workflowName: meta.name !== undefined ? meta.name : state.workflowName,
    workflowDescription: meta.description !== undefined ? meta.description : state.workflowDescription,
    workflowTags: meta.tags !== undefined ? meta.tags : state.workflowTags,
    isDirty: true,
  })),

  // ── Custom Node Library ───────────────────────────────────────────

  loadCustomNodeLibrary: async () => {
    try {
      const result = await customNodeApi.list();
      set({ customNodeLibrary: result.data || [] });
    } catch (error) {
      console.error('Failed to load custom node library:', error);
    }
  },

  createCustomNodeFromSelection: async ({ name, description, icon, color }) => {
    const { nodes, edges, selectedNodeIds, addNode, addLog } = get();
    if (selectedNodeIds.length < 2) return null;

    const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));
    const selectedIdSet = new Set(selectedNodeIds);

    // Internal edges: both source and target are in the selection
    const internalEdges = edges.filter(e => selectedIdSet.has(e.source) && selectedIdSet.has(e.target));

    // Exposed inputs: selected nodes that have NO incoming edge from inside the selection
    const nodesWithInternalIncoming = new Set(internalEdges.map(e => e.target));
    const exposedInputs = selectedNodeIds.filter(id => !nodesWithInternalIncoming.has(id));

    // Exposed outputs: selected nodes that have NO outgoing edge to inside the selection
    const nodesWithInternalOutgoing = new Set(internalEdges.map(e => e.source));
    const exposedOutputs = selectedNodeIds.filter(id => !nodesWithInternalOutgoing.has(id));

    // Normalize positions relative to top-left of the group
    const minX = Math.min(...selectedNodes.map(n => n.position.x));
    const minY = Math.min(...selectedNodes.map(n => n.position.y));
    const subNodes = selectedNodes.map(n => ({
      ...n,
      position: { x: n.position.x - minX, y: n.position.y - minY },
    }));
    const subEdges = internalEdges.map(e => ({ source: e.source, target: e.target }));

    try {
      // Save to library
      const template = await customNodeApi.create({
        name,
        description: description || '',
        icon: icon || 'Layers',
        color: color || '#f59e0b',
        subNodes,
        subEdges,
        exposedInputs,
        exposedOutputs,
      });

      // Compute center of selected nodes for placement
      const centerX = (Math.min(...selectedNodes.map(n => n.position.x)) + Math.max(...selectedNodes.map(n => n.position.x))) / 2;
      const centerY = (Math.min(...selectedNodes.map(n => n.position.y)) + Math.max(...selectedNodes.map(n => n.position.y))) / 2;

      // External edges: edges going into or out of the selection from outside nodes
      const externalEdgesIn = edges.filter(e => !selectedIdSet.has(e.source) && selectedIdSet.has(e.target));
      const externalEdgesOut = edges.filter(e => selectedIdSet.has(e.source) && !selectedIdSet.has(e.target));

      // Remove selected nodes and their edges
      const remainingNodes = nodes.filter(n => !selectedIdSet.has(n.id));
      const remainingEdges = edges.filter(e => !selectedIdSet.has(e.source) && !selectedIdSet.has(e.target));

      // Create the custom node instance
      const customNodeId = Math.random().toString(36).substr(2, 9);
      const customNode = {
        id: customNodeId,
        type: 'custom_node',
        position: { x: centerX - 110, y: centerY - 40 },
        data: {
          label: name,
          templateId: template.id,
          icon: template.icon,
          color: template.color,
          subNodes: template.subNodes,
          subEdges: template.subEdges,
          exposedInputs: template.exposedInputs,
          exposedOutputs: template.exposedOutputs,
          subNodeCount: template.subNodes.length,
        },
      };

      // Rewire external edges to the custom node, preserving handle mapping
      const newEdges = [
        ...remainingEdges,
        ...externalEdgesIn.map(e => {
          // e.target is the original sub-node ID (now an exposed input)
          const targetHandle = exposedInputs.includes(e.target) ? e.target : null;
          return {
            ...e,
            target: customNodeId,
            targetHandle,
            id: `e${e.source}${e.sourceHandle ? '-'+e.sourceHandle : ''}-${customNodeId}${targetHandle ? '-'+targetHandle : ''}`,
          };
        }),
        ...externalEdgesOut.map(e => {
          // e.source is the original sub-node ID (now an exposed output)
          const sourceHandle = exposedOutputs.includes(e.source) ? e.source : null;
          return {
            ...e,
            source: customNodeId,
            sourceHandle,
            id: `e${customNodeId}${sourceHandle ? '-'+sourceHandle : ''}-${e.target}${e.targetHandle ? '-'+e.targetHandle : ''}`,
          };
        }),
      ];

      set({
        nodes: [...remainingNodes, customNode],
        edges: newEdges,
        selectedNodeIds: [],
        isDirty: true,
      });

      addLog({ type: 'info', message: `Created custom node: ${name} (${subNodes.length} nodes inside)` });

      // Refresh library
      get().loadCustomNodeLibrary();

      return template;
    } catch (error) {
      addLog({ type: 'error', message: `Failed to create custom node: ${error.message}` });
      return null;
    }
  },

  addCustomNodeFromTemplate: async (templateId) => {
    const { addNode, addLog } = get();
    try {
      const template = await customNodeApi.getById(templateId);
      const id = Math.random().toString(36).substr(2, 9);
      addNode({
        id,
        type: 'custom_node',
        position: { x: 200, y: 200 },
        data: {
          label: template.name,
          templateId: template.id,
          icon: template.icon,
          color: template.color,
          subNodes: template.subNodes,
          subEdges: template.subEdges,
          exposedInputs: template.exposedInputs,
          exposedOutputs: template.exposedOutputs,
          subNodeCount: template.subNodes.length,
        },
      });
      return id;
    } catch (error) {
      addLog({ type: 'error', message: `Failed to add custom node: ${error.message}` });
      return null;
    }
  },

  unpackCustomNode: (nodeId) => {
    const { nodes, edges, addLog } = get();
    const targetNode = nodes.find(n => n.id === nodeId);
    if (!targetNode || targetNode.type !== 'custom_node') return;

    const { subNodes, subEdges, exposedInputs, exposedOutputs, label } = targetNode.data;
    if (!subNodes || subNodes.length === 0) return;

    // Generate mapping old ID -> new ID for unpacked nodes
    const idMap = {};
    subNodes.forEach(sn => {
      idMap[sn.id] = Math.random().toString(36).substr(2, 9);
    });

    const baseX = targetNode.position.x;
    const baseY = targetNode.position.y;

    const unpackedNodes = subNodes.map(sn => ({
      ...sn,
      id: idMap[sn.id],
      position: {
        x: baseX + (sn.position?.x || 0),
        y: baseY + (sn.position?.y || 0)
      }
    }));

    const unpackedEdges = (subEdges || []).map(se => ({
      ...se,
      id: `e${idMap[se.source]}-${idMap[se.target]}`,
      source: idMap[se.source],
      target: idMap[se.target]
    }));

    // Rewire external edges connected to the custom node
    const newEdges = [];

    edges.forEach(e => {
      if (e.target === nodeId) {
        // Rewire incoming edge to the specific exposed input if targeted, else fallback
        const targetHandleId = e.targetHandle && exposedInputs?.includes(e.targetHandle) 
          ? idMap[e.targetHandle] 
          : (exposedInputs && exposedInputs.length > 0 ? idMap[exposedInputs[0]] : unpackedNodes[0].id);
          
        newEdges.push({ 
          ...e, 
          target: targetHandleId, 
          targetHandle: null,
          id: `e${e.source}${e.sourceHandle ? '-'+e.sourceHandle : ''}-${targetHandleId}` 
        });
      } else if (e.source === nodeId) {
        // Rewire outgoing edge from the specific exposed output if targeted, else fallback
        const sourceHandleId = e.sourceHandle && exposedOutputs?.includes(e.sourceHandle)
          ? idMap[e.sourceHandle]
          : (exposedOutputs && exposedOutputs.length > 0 ? idMap[exposedOutputs[0]] : unpackedNodes[unpackedNodes.length - 1].id);
          
        newEdges.push({ 
          ...e, 
          source: sourceHandleId, 
          sourceHandle: null,
          id: `e${sourceHandleId}-${e.target}${e.targetHandle ? '-'+e.targetHandle : ''}` 
        });
      } else {
        newEdges.push(e);
      }
    });

    const remainingNodes = nodes.filter(n => n.id !== nodeId);

    set({
      nodes: [...remainingNodes, ...unpackedNodes],
      edges: [...newEdges, ...unpackedEdges],
      isDirty: true,
      selectedNodeIds: unpackedNodes.map(n => n.id) // Automatically select the unpacked nodes
    });

    addLog({ type: 'info', message: `Unpacked custom node "${label}"` });
  },

  deleteCustomNodeTemplate: async (templateId) => {
    try {
      await customNodeApi.delete(templateId);
      get().loadCustomNodeLibrary();
    } catch (error) {
      console.error('Failed to delete custom node template:', error);
    }
  },

  updateCustomNodeTemplate: async (templateId, data) => {
    try {
      await customNodeApi.update(templateId, data);
      get().loadCustomNodeLibrary();
    } catch (error) {
      console.error('Failed to update custom node template:', error);
    }
  },
}));

export default useWorkflowStore;
