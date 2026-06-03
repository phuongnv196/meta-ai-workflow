import React, { useRef, useState, useCallback, useEffect } from 'react';
import useWorkflowStore from '../../store/useWorkflowStore';
import Node from '../Node/Node';
import { Play, RotateCcw, ZoomIn, ZoomOut, SkipForward, Save, SaveAll, ArrowLeft } from 'lucide-react';
import './WorkflowCanvas.scss';

const WorkflowCanvas = ({ onSave, onBack }) => {
  const { nodes, edges, activeConnection, setActiveConnection, addNode, removeEdge, isRunning, runWorkflow, runStep, workflowId, workflowName, isDirty, isSaving } = useWorkflowStore();
  const canvasRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

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
    if (e.target.classList.contains('workflow-canvas') || e.target.id === 'canvas-grid' || e.target.classList.contains('canvas-content')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
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

      <div className="canvas-toolbar">
        {onBack && (
          <button className="back-btn" onClick={onBack} title="Back to Workflows">
            <ArrowLeft size={18} />
          </button>
        )}
        {workflowName && <span className="toolbar-name">{workflowName}{isDirty ? ' •' : ''}</span>}
        <button className={`run-btn ${isRunning ? 'running' : ''}`} onClick={runWorkflow} disabled={isRunning}>
          {isRunning ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
          <span>{isRunning ? 'Running Flow...' : 'Run Workflow'}</span>
        </button>
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
