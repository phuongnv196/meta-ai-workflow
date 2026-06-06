import React, { useRef, useState, useCallback, useEffect } from 'react';
import useWorkflowStore from '../../store/useWorkflowStore';
import Node from '../Node/Node';
import { Play, RotateCcw, ZoomIn, ZoomOut, SkipForward, Save, SaveAll, ArrowLeft, MessageSquare, Image as ImageIcon, Video, Upload, Crop, Film, Music, FileText, Mic, Layers, Clapperboard, PersonStanding, Zap, Database, PackagePlus, Trash2, X, Brain, Globe, Braces, Type, Timer, Repeat, GitBranch } from 'lucide-react';
import './WorkflowCanvas.scss';

const NODE_CATEGORIES = [
  {
    name: 'AI Models',
    items: [
      { type: 'universal_llm', icon: <Brain size={14} />, label: 'Universal LLM', color: '#8b5cf6' },
    ]
  },
  {
    name: 'Meta AI Core',
    items: [
      { type: 'meta_chat', icon: <MessageSquare size={14} />, label: 'Meta Chat', color: '#38bdf8' },
      { type: 'meta_imagine', icon: <ImageIcon size={14} />, label: 'Meta Imagine (Image)', color: '#10b981' },
      { type: 'meta_video_gen', icon: <Video size={14} />, label: 'Meta Imagine (Video)', color: '#a855f7' },
      { type: 'file_input', icon: <Upload size={14} />, label: 'Meta Upload Image', color: '#38bdf8' },
    ]
  },
  {
    name: 'Utilities',
    items: [
      { type: 'extract_frame', icon: <Crop size={14} />, label: 'Extract Frame', color: '#06b6d4' },
      { type: 'merge_videos', icon: <Film size={14} />, label: 'Merge Videos', color: '#84cc16' },
      { type: 'add_audio', icon: <Music size={14} />, label: 'Add Audio to Video', color: '#ec4899' },
    ]
  },
  {
    name: 'Inputs & Data',
    items: [
      { type: 'text_input', icon: <FileText size={14} />, label: 'Text Prompt', color: '#818cf8' },
    ]
  },
  {
    name: 'Vibes AI',
    items: [
      { type: 'vibes_upload_image',     icon: <Upload size={14} />,         label: 'Vibes Upload Image',      color: '#38bdf8' },
      { type: 'vibes_upload_audio',     icon: <Mic size={14} />,            label: 'Vibes Upload Audio',      color: '#f472b6' },
      { type: 'vibes_generate_images',  icon: <Layers size={14} />,         label: 'Vibes Generate Images',   color: '#34d399' },
      { type: 'vibes_generate_videos',  icon: <Clapperboard size={14} />,   label: 'Vibes Generate Videos',   color: '#fb923c' },
      { type: 'vibes_animate',          icon: <PersonStanding size={14} />, label: 'Vibes Animate (Lip-sync)', color: '#f87171' },
    ]
  },
  {
    name: 'Flow Control',
    items: [
      { type: 'condition', icon: <GitBranch size={14} />, label: 'Condition (If/Else)', color: '#f43f5e' },
      { type: 'delay', icon: <Timer size={14} />, label: 'Delay', color: '#fbbf24' },
      { type: 'loop_node', icon: <Repeat size={14} />, label: 'Loop (ForEach)', color: '#f97316' },
    ]
  },
  {
    name: 'Data & Utils',
    items: [
      { type: 'text_transform', icon: <Type size={14} />, label: 'Text Transform', color: '#a78bfa' },
      { type: 'json_extractor', icon: <Braces size={14} />, label: 'JSON Extractor', color: '#2dd4bf' },
    ]
  },
  {
    name: 'Integrations',
    items: [
      { type: 'http_request', icon: <Globe size={14} />, label: 'HTTP Request', color: '#60a5fa' },
    ]
  }
];

const WorkflowCanvas = ({ onSave, onBack }) => {
  const { nodes, edges, activeConnection, setActiveConnection, addNode, removeEdge, removeNodes, isRunning, runWorkflow, runStep, workflowId, workflowName, isDirty, isSaving, selectedNodeIds, setSelectedNodeIds, toggleNodeSelection, clearSelection, createCustomNodeFromSelection, customNodeLibrary } = useWorkflowStore();
  const canvasRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState(null);
  const [contextMenuSearch, setContextMenuSearch] = useState('');
  const [selectionRect, setSelectionRect] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [showCreateCustomNodeDialog, setShowCreateCustomNodeDialog] = useState(false);
  const [customNodeForm, setCustomNodeForm] = useState({ name: '', description: '', color: '#f59e0b' });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsSpacePressed(true);
      }
      
      // Handle delete key
      if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        const { selectedNodeIds, removeNodes } = useWorkflowStore.getState();
        if (selectedNodeIds.length > 0) {
          e.preventDefault();
          removeNodes(selectedNodeIds);
        }
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const addCustomNodeFromTemplate = useWorkflowStore(s => s.addCustomNodeFromTemplate);

  const onDrop = useCallback((e) => {
    e.preventDefault();

    // Handle custom node template drop
    const customNodeId = e.dataTransfer.getData('application/custom-node-id');
    if (customNodeId) {
      addCustomNodeFromTemplate(customNodeId);
      return;
    }

    const type = e.dataTransfer.getData('application/node-type');
    const label = e.dataTransfer.getData('application/node-label');
    if (!type) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const position = {
      x: (e.clientX - rect.left - transform.x) / transform.scale - 110,
      y: (e.clientY - rect.top - transform.y) / transform.scale - 40,
    };

    const id = Math.random().toString(36).substr(2, 9);
    addNode({
      id,
      type,
      position,
      data: { label: label || `${type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}` },
    });
  }, [addNode, addCustomNodeFromTemplate, transform]);

  const onMouseDown = (e) => {
    if (contextMenu) setContextMenu(null);
    const isCanvas = e.target.classList.contains('workflow-canvas') || e.target.id === 'canvas-grid' || e.target.classList.contains('canvas-content');
    if (!isCanvas) return;

    // Pan with Middle Mouse Button or Spacebar
    if (e.button === 1 || isSpacePressed) {
      if (selectedNodeIds.length > 0 && !e.shiftKey) clearSelection();
      setIsPanning(true);
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
      return;
    }

    // Left click on background starts rectangle selection
    if (e.button === 0) {
      if (!e.shiftKey && selectedNodeIds.length > 0) clearSelection();
      const rect = canvasRef.current.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
      const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
      setIsSelecting(true);
      setSelectionRect({ startX: worldX, startY: worldY, endX: worldX, endY: worldY });
    }
  };

  const onContextMenu = (e) => {
    if (e.target.classList.contains('workflow-canvas') || e.target.id === 'canvas-grid' || e.target.classList.contains('canvas-content')) {
      e.preventDefault();
      
      const rect = canvasRef.current.getBoundingClientRect();
      // Store world coordinates for the node spawn position, and screen coordinates for the menu popup
      const worldPos = {
        x: (e.clientX - rect.left - transform.x) / transform.scale,
        y: (e.clientY - rect.top - transform.y) / transform.scale,
      };

      setContextMenu({
        screenX: e.clientX,
        screenY: e.clientY,
        worldX: worldPos.x,
        worldY: worldPos.y
      });
      setContextMenuSearch('');
    }
  };

  const handleAddNodeFromMenu = (type, label) => {
    if (!contextMenu) return;
    
    const id = Math.random().toString(36).substr(2, 9);
    addNode({
      id,
      type,
      position: { x: contextMenu.worldX, y: contextMenu.worldY },
      data: { label },
    });
    setContextMenu(null);
  };

  const onMouseMove = (e) => {
    if (isSelecting && selectionRect) {
      const rect = canvasRef.current.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
      const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
      setSelectionRect(prev => ({ ...prev, endX: worldX, endY: worldY }));
      return;
    }
    if (activeConnection) {
      const rect = canvasRef.current.getBoundingClientRect();
      setActiveConnection({
        ...activeConnection,
        currentX: (e.clientX - rect.left - transform.x) / transform.scale,
        currentY: (e.clientY - rect.top - transform.y) / transform.scale,
      });
    } else if (isPanning) {
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      }));
    }
  };

  const onMouseUp = () => {
    if (isSelecting && selectionRect) {
      // Compute which nodes fall inside the selection rectangle
      const minX = Math.min(selectionRect.startX, selectionRect.endX);
      const maxX = Math.max(selectionRect.startX, selectionRect.endX);
      const minY = Math.min(selectionRect.startY, selectionRect.endY);
      const maxY = Math.max(selectionRect.startY, selectionRect.endY);

      const selected = nodes.filter(n => {
        const nw = n.dimensions?.width || 220;
        const nh = n.dimensions?.height || 150;
        return n.position.x + nw > minX && n.position.x < maxX &&
               n.position.y + nh > minY && n.position.y < maxY;
      }).map(n => n.id);

      setSelectedNodeIds(selected);
      setIsSelecting(false);
      setSelectionRect(null);
      return;
    }
    setIsPanning(false);
    if (activeConnection) {
      setActiveConnection(null);
    }
  };

  const handleCreateCustomNode = async () => {
    if (!customNodeForm.name.trim()) return;
    await createCustomNodeFromSelection(customNodeForm);
    setShowCreateCustomNodeDialog(false);
    setCustomNodeForm({ name: '', description: '', color: '#f59e0b' });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e) => {
      if (e.target.closest('.canvas-context-menu')) return; // Allow normal scrolling inside context menu
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.2, Math.min(3, transform.scale * delta));
      setTransform(prev => ({ ...prev, scale: newScale }));
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [transform.scale]);

  const getPortPosition = (nodeId, type, handleId = null) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };

    const nodeWidth = node.dimensions?.width || 220;
    const nodeHeight = node.dimensions?.height || 150;

    let portY = node.position.y + nodeHeight / 2;

    // Condition node: 2 output ports (true/false)
    if (node.type === 'condition') {
      if (type === 'out' && handleId) {
        const handles = ['true', 'false'];
        const index = handles.indexOf(handleId);
        if (index !== -1) {
          portY = node.position.y + ((index + 1) * nodeHeight) / (handles.length + 1);
        }
      }
    }

    if (node.type === 'custom_node') {
      const handles = type === 'out' ? node.data.exposedOutputs : node.data.exposedInputs;
      if (handles && handles.length > 0 && handleId) {
        const index = handles.indexOf(handleId);
        if (index !== -1) {
          portY = node.position.y + ((index + 1) * nodeHeight) / (handles.length + 1);
        }
      }
    }

    return {
      x: type === 'out' ? node.position.x + nodeWidth : node.position.x,
      y: portY,
    };
  };

  useEffect(() => {
    if (!onSave) return;
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onSave(e.shiftKey ? 'saveAs' : 'save');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSave]);

  const handleZoom = (delta) => {
    setTransform(prev => ({ ...prev, scale: Math.max(0.2, Math.min(3, prev.scale * delta)) }));
  };

  const handleReset = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  return (
    <div
      className="workflow-canvas"
      style={{ cursor: isSpacePressed ? (isPanning ? 'grabbing' : 'grab') : (isSelecting ? 'crosshair' : 'default') }}
      ref={canvasRef}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onContextMenu={onContextMenu}
    >
      <div
        id="canvas-grid"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 1px, transparent 0)',
          backgroundSize: `${40 * transform.scale}px ${40 * transform.scale}px`,
          backgroundPosition: `${transform.x}px ${transform.y}px`,
          pointerEvents: 'none',
          zIndex: 0
        }}
      />

      <div
        className="canvas-content"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          width: '100%',
          height: '100%',
          zIndex: 1
        }}
      >
        <svg className="edges-layer" style={{ width: '10000px', height: '10000px', overflow: 'visible' }}>
          {/* <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#38bdf8" />
            </marker>
          </defs> */}

          {edges.map((edge) => {
            const start = getPortPosition(edge.source, 'out', edge.sourceHandle);
            const end = getPortPosition(edge.target, 'in', edge.targetHandle);
            const dx = Math.abs(end.x - start.x) * 0.5;
            const d = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;

            return (
              <g key={edge.id} className="edge-group" onClick={() => removeEdge(edge.id)}>
                <path d={d} stroke="transparent" strokeWidth="15" fill="none" style={{ cursor: 'pointer', pointerEvents: 'all' }} />
                <path d={d} className="edge-path" stroke="#38bdf8" strokeWidth="2" fill="none" /*markerEnd="url(#arrowhead)"*/ style={{ pointerEvents: 'none' }} />
              </g>
            );
          })}

          {activeConnection && (
            <path
              d={`M ${activeConnection.startX} ${activeConnection.startY} C ${activeConnection.startX + 50} ${activeConnection.startY}, ${activeConnection.currentX - 50} ${activeConnection.currentY}, ${activeConnection.currentX} ${activeConnection.currentY}`}
              stroke="#818cf8"
              strokeWidth="2"
              strokeDasharray="5,5"
              fill="none"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>

        {/* Selection rectangle */}
        {isSelecting && selectionRect && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(selectionRect.startX, selectionRect.endX),
              top: Math.min(selectionRect.startY, selectionRect.endY),
              width: Math.abs(selectionRect.endX - selectionRect.startX),
              height: Math.abs(selectionRect.endY - selectionRect.startY),
              border: '2px dashed #38bdf8',
              background: 'rgba(56, 189, 248, 0.08)',
              borderRadius: '4px',
              pointerEvents: 'none',
              zIndex: 9998,
            }}
          />
        )}

        <div className="nodes-layer">
          {nodes.map((node) => (
            <Node key={node.id} node={node} transform={transform} isSelected={selectedNodeIds.includes(node.id)} />
          ))}
        </div>
      </div>

      {contextMenu && (
        <div 
          className="canvas-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.screenX,
            top: contextMenu.screenY,
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            padding: '8px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '400px',
            overflow: 'hidden'
          }}
          onMouseDown={(e) => e.stopPropagation()} // Prevent closing when clicking inside
        >
          <input 
            type="text" 
            placeholder="Search nodes..." 
            value={contextMenuSearch}
            onChange={(e) => setContextMenuSearch(e.target.value)}
            autoFocus
            style={{
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              padding: '6px 8px',
              color: '#fff',
              fontSize: '0.85rem',
              outline: 'none',
              width: '100%',
              flexShrink: 0
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setContextMenu(null);
            }}
          />
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
          {NODE_CATEGORIES.map(cat => {
            const filteredItems = cat.items.filter(item => 
              item.label.toLowerCase().includes(contextMenuSearch.toLowerCase()) || 
              item.type.toLowerCase().includes(contextMenuSearch.toLowerCase())
            );
            if (filteredItems.length === 0) return null;
            
            return (
              <div key={cat.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 8px' }}>
                  {cat.name}
                </span>
                {filteredItems.map(item => (
                  <div
                    key={item.type}
                    className="context-menu-item"
                    onClick={() => handleAddNodeFromMenu(item.type, item.label)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: '#e2e8f0',
                      fontSize: '0.85rem',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ color: item.color, display: 'flex' }}>{item.icon}</div>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {/* Dynamic custom nodes category */}
          {(() => {
            const filteredCustom = customNodeLibrary.filter(tpl =>
              tpl.name.toLowerCase().includes(contextMenuSearch.toLowerCase())
            );
            if (filteredCustom.length === 0) return null;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 8px' }}>
                  Custom Nodes
                </span>
                {filteredCustom.map(tpl => (
                  <div
                    key={tpl.id}
                    className="context-menu-item"
                    onClick={() => {
                      addCustomNodeFromTemplate(tpl.id);
                      setContextMenu(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: '#e2e8f0',
                      fontSize: '0.85rem',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ color: tpl.color || '#f59e0b', display: 'flex' }}><PackagePlus size={14} /></div>
                    <span>{tpl.name}</span>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', marginLeft: 'auto' }}>{tpl.subNodeCount}n</span>
                  </div>
                ))}
              </div>
            );
          })()}
          </div>
        </div>
      )}

      {/* Create Custom Node dialog */}
      {showCreateCustomNodeDialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onClick={() => setShowCreateCustomNodeDialog(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1e293b', borderRadius: '16px', padding: '24px',
              border: '1px solid rgba(255,255,255,0.1)', width: '400px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: '#f1f5f9', margin: 0, fontSize: '1.1rem' }}>Create Custom Node</h3>
              <button onClick={() => setShowCreateCustomNodeDialog(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Name *</label>
                <input
                  type="text" autoFocus
                  value={customNodeForm.name}
                  onChange={(e) => setCustomNodeForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Clothing Transfer"
                  style={{
                    width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                    color: '#f1f5f9', fontSize: '0.9rem', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCustomNode(); }}
                />
              </div>
              <div>
                <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Description</label>
                <input
                  type="text"
                  value={customNodeForm.description}
                  onChange={(e) => setCustomNodeForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                  style={{
                    width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                    color: '#f1f5f9', fontSize: '0.9rem', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Color</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'].map(c => (
                    <button
                      key={c}
                      onClick={() => setCustomNodeForm(prev => ({ ...prev, color: c }))}
                      style={{
                        width: '28px', height: '28px', borderRadius: '50%', background: c,
                        border: customNodeForm.color === c ? '3px solid #fff' : '2px solid transparent',
                        cursor: 'pointer', transition: 'border 0.2s',
                      }}
                    />
                  ))}
                </div>
              </div>
              <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '4px' }}>
                {selectedNodeIds.length} nodes selected
              </div>
              <button
                onClick={handleCreateCustomNode}
                disabled={!customNodeForm.name.trim()}
                style={{
                  marginTop: '8px', padding: '12px', background: customNodeForm.name.trim() ? '#f59e0b' : '#334155',
                  color: customNodeForm.name.trim() ? '#000' : '#64748b',
                  border: 'none', borderRadius: '10px', fontWeight: '600',
                  fontSize: '0.9rem', cursor: customNodeForm.name.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                }}
              >
                Create Custom Node
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="canvas-toolbar">
        {onBack && (
          <button className="back-btn" onClick={onBack} title="Back to Workflows">
            <ArrowLeft size={18} />
          </button>
        )}
        {workflowName && <span className="toolbar-name">{workflowName}{isDirty ? ' •' : ''}</span>}
        
        {isRunning ? (
          <button 
            className="run-btn running" 
            onClick={() => useWorkflowStore.getState().stopWorkflow()}
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
          >
            <Loader2 className="spin" size={18} />
            <span>Stop Workflow</span>
          </button>
        ) : (
          <button className="run-btn" onClick={runWorkflow}>
            <Play size={18} />
          </button>
        )}

        <button className="step-btn" onClick={runStep} disabled={isRunning} style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#38bdf8',
          padding: '0.6rem 1rem',
          borderRadius: '10px',
          fontWeight: '500',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          transition: 'all 0.2s',
          cursor: 'pointer'
        }}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)'}
        onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
        title="Chạy từng node đơn lẻ theo thứ tự"
        >
          <SkipForward size={18} />
        </button>
        <div className="divider" />
        <button onClick={() => handleZoom(1.1)} title="Zoom In"><ZoomIn size={18} /></button>
        <button onClick={() => handleZoom(0.9)} title="Zoom Out"><ZoomOut size={18} /></button>
        <button onClick={handleReset} title="Reset View"><RotateCcw size={18} /></button>
        {selectedNodeIds.length > 0 && (
          <>
            <div className="divider" />
            <button
              onClick={() => removeNodes(selectedNodeIds)}
              title="Delete Selected Nodes"
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#ef4444',
                padding: '0.6rem 1rem',
                borderRadius: '10px',
                fontWeight: '500',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
            >
              <Trash2 size={18} />
              <span>({selectedNodeIds.length})</span>
            </button>
            {selectedNodeIds.length >= 2 && (
              <button
                onClick={() => setShowCreateCustomNodeDialog(true)}
                title="Create Custom Node from selection"
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  color: '#f59e0b',
                  padding: '0.6rem 1rem',
                  borderRadius: '10px',
                  fontWeight: '500',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  marginLeft: '0.5rem',
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(245, 158, 11, 0.25)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(245, 158, 11, 0.15)'}
              >
                <PackagePlus size={18} />
                <span>Group</span>
              </button>
            )}
          </>
        )}
        {onSave && (
          <>
            <div className="divider" />
            <button onClick={() => onSave('save')} disabled={isSaving} title="Save (Ctrl+S)">
              <Save size={18} />
            </button>
            <button onClick={() => onSave('saveAs')} disabled={isSaving} title="Save As (Ctrl+Shift+S)">
              <SaveAll size={18} />
            </button>
          </>
        )}
      </div>

      <div className="canvas-controls">
        <div className="control-item">Zoom: {Math.round(transform.scale * 100)}% | Nodes: {nodes.length}</div>
      </div>
    </div>
  );
};

const Loader2 = ({ className, size }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export default WorkflowCanvas;
