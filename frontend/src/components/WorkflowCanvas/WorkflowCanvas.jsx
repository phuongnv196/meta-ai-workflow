import React, { useRef, useState, useCallback, useEffect } from 'react';
import useWorkflowStore from '../../store/useWorkflowStore';
import Node from '../Node/Node';
import { Play, RotateCcw, ZoomIn, ZoomOut, SkipForward, Save, SaveAll, ArrowLeft, MessageSquare, Image as ImageIcon, Video, Upload, Crop, Film, Music, FileText, Mic, Layers, Clapperboard, PersonStanding, Zap, Database } from 'lucide-react';
import './WorkflowCanvas.scss';

const NODE_CATEGORIES = [
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
      { type: 'meta_track', icon: <Music size={14} />, label: 'Track Resolver', color: '#ec4899' },
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
    name: 'Logic',
    items: [
      { type: 'condition', icon: <Zap size={14} />, label: 'Condition', color: '#f43f5e' },
      { type: 'database', icon: <Database size={14} />, label: 'Store Result', color: '#6366f1' },
    ]
  }
];

const WorkflowCanvas = ({ onSave, onBack }) => {
  const { nodes, edges, activeConnection, setActiveConnection, addNode, removeEdge, isRunning, runWorkflow, runStep, workflowId, workflowName, isDirty, isSaving } = useWorkflowStore();
  const canvasRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState(null);
  const [contextMenuSearch, setContextMenuSearch] = useState('');

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
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
  }, [addNode, transform]);

  const onMouseDown = (e) => {
    if (contextMenu) setContextMenu(null);
    if (e.target.classList.contains('workflow-canvas') || e.target.id === 'canvas-grid' || e.target.classList.contains('canvas-content')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
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
    setIsPanning(false);
    if (activeConnection) {
      setActiveConnection(null);
    }
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

  const getPortPosition = (nodeId, type) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };

    // Use world-space coordinates only.
    // node.dimensions stores offsetWidth/offsetHeight (CSS layout pixels = world pixels),
    // and node.position is in world coordinates — so this is always correct regardless
    // of zoom level or node resize, and never reads stale DOM during render.
    const nodeWidth = node.dimensions?.width || 220;
    const nodeHeight = node.dimensions?.height || 150;

    return {
      x: type === 'out' ? node.position.x + nodeWidth : node.position.x,
      y: node.position.y + nodeHeight / 2,
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
            const start = getPortPosition(edge.source, 'out');
            const end = getPortPosition(edge.target, 'in');
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
            />
          )}
        </svg>

        <div className="nodes-layer">
          {nodes.map((node) => (
            <Node key={node.id} node={node} transform={transform} />
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
            <span>Run Workflow</span>
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
          <span>Execute Step</span>
        </button>
        <div className="divider" />
        <button onClick={() => handleZoom(1.1)} title="Zoom In"><ZoomIn size={18} /></button>
        <button onClick={() => handleZoom(0.9)} title="Zoom Out"><ZoomOut size={18} /></button>
        <button onClick={handleReset} title="Reset View"><RotateCcw size={18} /></button>
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
