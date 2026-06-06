import React, { useState, useRef, useLayoutEffect } from 'react';
import useWorkflowStore from '../../store/useWorkflowStore';
import {
  Settings, Trash2, MessageSquare, Image as ImageIcon, Video,
  FileText, Zap, ChevronRight, Loader2, ExternalLink, Music, Crop, Film, Play,
  Upload, Mic, Wand2, Layers, Clapperboard, Speaker, PersonStanding,
  PackagePlus, Package, Pencil, Ungroup,
  Brain, Globe, Braces, Type, Timer, Repeat, GitBranch
} from 'lucide-react';
import { REFERENCE_NODE_TYPES } from '../../constants';
import { API_BASE_URL } from '../../config';
import './Node.scss';

const getGlobalReferences = (nodes) => {
  const refNodes = nodes.filter(pn => {
    return REFERENCE_NODE_TYPES.includes(pn.type) || pn.data?.refName || pn.data?.mediaId || (pn.data?.attachments && pn.data.attachments.length > 0);
  });

  // Tìm tất cả các refName có sẵn để làm fallback không trùng lặp
  let fallbackCount = 1;
  const refs = [];

  refNodes.forEach((pn) => {
    let refName = pn.data?.refName;
    if (!refName) {
      refName = `reference_${String(fallbackCount++).padStart(2, '0')}`;
    }
    const label = pn.data.label || pn.type;
    const preview = pn.data.previewUrl || pn.data.audioPreview || pn.data.resultUrl || pn.data.generatedImageUrl || pn.data.audioUrl || pn.data.cdnUrl || '';
    refs.push({
      name: refName,
      nodeId: pn.id,
      label: label,
      type: pn.type,
      preview: preview,
      filename: pn.data.filename || pn.data.fileName || `${pn.type.replace('meta_', '')}_output`,
      mediaId: pn.data?.mediaId,
      attachments: pn.data?.attachments
    });
  });

  // Sắp xếp các references theo thứ tự số tăng dần (ví dụ reference_01 < reference_02)
  refs.sort((a, b) => a.name.localeCompare(b.name));

  return refs;
};

const getParentReferences = (nodeId, nodes, edges) => {
  const incomingEdges = edges.filter(e => e.target === nodeId);
  // Sort edges by creation time (index in edges array) to preserve connection order
  // "nối trước sẽ là start frame, nối sau sẽ là end frame"
  const parentIds = incomingEdges.map(e => e.source);

  const globalRefs = getGlobalReferences(nodes);

  // Return references strictly matching the order they were connected (edge order)
  const orderedRefs = [];
  parentIds.forEach(id => {
    const ref = globalRefs.find(r => r.nodeId === id);
    if (ref) orderedRefs.push(ref);
  });

  return orderedRefs;
};

const Node = ({ node, transform, isSelected }) => {
  const { nodes, edges, updateNodePosition, updateNodeDimensions, updateNodeData, removeNode, setActiveConnection, activeConnection, addEdge, executingNodeIds, runSingleNode, stopWorkflow, toggleNodeSelection, unpackCustomNode } = useWorkflowStore();
  const [showCustomNodeEditor, setShowCustomNodeEditor] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editLabelValue, setEditLabelValue] = useState(node.data.label);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [promptValue, setPromptValue] = useState(node.data.prompt || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsList, setSuggestionsList] = useState([]);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [cursorIndex, setCursorIndex] = useState(0);
  const nodeRef = useRef(null);
  const fileInputRef = useRef(null);

  const isExecuting = executingNodeIds?.includes(node.id);
  const resultUrl = node.data.resultUrl;
  const previewUrl = node.data.previewUrl;

  useLayoutEffect(() => {
    if (!nodeRef.current) return;

    const observer = new ResizeObserver(() => {
      if (!nodeRef.current) return;
      // Use offsetWidth/offsetHeight — these are CSS layout pixels, unaffected by
      // parent CSS transforms (scale). This gives true world-space dimensions.
      const actualWidth = nodeRef.current.offsetWidth;
      const actualHeight = nodeRef.current.offsetHeight;

      if (node.dimensions?.width !== actualWidth || node.dimensions?.height !== actualHeight) {
        updateNodeDimensions(node.id, {
          width: actualWidth,
          height: actualHeight
        });
      }
    });

    observer.observe(nodeRef.current);
    return () => observer.disconnect();
  }, [node.id, node.dimensions?.width, node.dimensions?.height, updateNodeDimensions]);

  const onMouseDown = (e) => {
    if (e.target.closest('.delete-btn') || e.target.closest('.port') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('.result-view') || e.target.closest('.file-drop')) return;

    setIsDragging(true);
    const startX = e.clientX / transform.scale - node.position.x;
    const startY = e.clientY / transform.scale - node.position.y;

    const onMouseMove = (moveEvent) => {
      updateNodePosition(node.id, {
        x: moveEvent.clientX / transform.scale - startX,
        y: moveEvent.clientY / transform.scale - startY,
      });
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const onPortMouseDown = (e, type, handleId = null) => {
    e.stopPropagation();
    if (type === 'out' && nodeRef.current) {
      const portElement = e.currentTarget;
      const centerY = node.position.y + portElement.offsetTop + (portElement.offsetHeight / 2 || 6);

      setActiveConnection({
        source: node.id,
        sourceHandle: handleId,
        startX: node.position.x + nodeRef.current.offsetWidth,
        startY: centerY,
        currentX: node.position.x + nodeRef.current.offsetWidth,
        currentY: centerY,
      });
    }
  };

  const onPortMouseUp = (e, type, handleId = null) => {
    if (type === 'in' && activeConnection && activeConnection.source !== node.id) {
      addEdge({
        source: activeConnection.source,
        sourceHandle: activeConnection.sourceHandle,
        target: node.id,
        targetHandle: handleId
      });
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const globalRefs = getGlobalReferences(nodes);
    const myRef = globalRefs.find(r => r.nodeId === node.id);
    const suffix = myRef ? myRef.name.split('_')[1] : '01';
    const ext = file.name.split('.').pop() || 'jpg';
    const targetFilename = `reference_${suffix}.${ext}`;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result.split(',')[1];
      try {
        const response = await fetch(`${API_BASE_URL}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64Data,
            filename: targetFilename,
            mimeType: file.type
          })
        });
        const data = await response.json();
        if (data.success) {
          updateNodeData(node.id, {
            mediaId: data.mediaId,
            filename: targetFilename,
            mimeType: file.type,
            previewUrl: reader.result,
            refName: myRef ? myRef.name : `reference_${suffix}`
          });
        } else {
          alert('Upload failed: ' + data.error);
        }
      } catch (err) {
        alert('Upload failed: ' + err.message);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const getIcon = () => {
    switch (node.type) {
      case 'meta_chat': return <MessageSquare size={18} color="#38bdf8" />;
      case 'meta_imagine': return <ImageIcon size={18} color="#10b981" />;
      case 'meta_video_gen': return <Video size={18} color="#a855f7" />;
      case 'meta_video': return <Video size={18} color="#f59e0b" />;
      case 'meta_track': return <Music size={18} color="#ec4899" />;
      case 'extract_frame': return <Crop size={18} color="#06b6d4" />;
      case 'merge_videos': return <Film size={18} color="#84cc16" />;
      case 'text_input': return <FileText size={18} color="#818cf8" />;
      case 'file_input': return <Upload size={18} color="#38bdf8" />;
      case 'condition': return <GitBranch size={18} color="#f43f5e" />;
      case 'universal_llm': return <Brain size={18} color="#8b5cf6" />;
      case 'delay': return <Timer size={18} color="#fbbf24" />;
      case 'http_request': return <Globe size={18} color="#60a5fa" />;
      case 'json_extractor': return <Braces size={18} color="#2dd4bf" />;
      case 'text_transform': return <Type size={18} color="#a78bfa" />;
      case 'loop_node': return <Repeat size={18} color="#f97316" />;
      case 'vibes_upload_image': return <Upload size={18} color="#38bdf8" />;
      case 'vibes_upload_audio': return <Mic size={18} color="#f472b6" />;
      case 'vibes_generate_prompts': return <Wand2 size={18} color="#a78bfa" />;
      case 'vibes_generate_images': return <Layers size={18} color="#34d399" />;
      case 'vibes_generate_videos': return <Clapperboard size={18} color="#fb923c" />;
      // case 'vibes_tts':              return <Speaker size={18} color="#60a5fa" />;
      case 'vibes_animate': return <PersonStanding size={18} color="#f87171" />;
      case 'custom_node': return <Package size={18} color={node.data.color || '#f59e0b'} />;
      default: return <Settings size={18} color="#94a3b8" />;
    }
  };

  const handleSelectSuggestion = (s) => {
    if (!s) return;
    const textBeforeAt = promptValue.slice(0, cursorIndex - suggestionQuery.length - 1);
    const textAfterCursor = promptValue.slice(cursorIndex);
    const newValue = textBeforeAt + s.name + ' ' + textAfterCursor;
    setPromptValue(newValue);
    updateNodeData(node.id, { prompt: newValue });
    setShowSuggestions(false);
    setSuggestionIndex(0);

    setTimeout(() => {
      const textarea = document.querySelector(`.node-textarea-${node.id}`);
      if (textarea) {
        textarea.focus();
        const newPos = textBeforeAt.length + s.name.length + 1;
        textarea.setSelectionRange(newPos, newPos);
      }
    }, 50);
  };

  const renderContent = () => {
    if (node.type === 'custom_node') {
      return (
        <>
          <div className="node-custom-ui" style={{ padding: '8px 0' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 12px', background: 'rgba(245, 158, 11, 0.08)',
              borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.15)',
            }}>
              <Package size={16} color={node.data.color || '#f59e0b'} />
              <span style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>
                {node.data.subNodeCount || node.data.subNodes?.length || 0} nodes inside
              </span>
            </div>
            {node.data.description && (
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: '6px 0 0', lineHeight: '1.4' }}>
                {node.data.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCustomNodeEditor(!showCustomNodeEditor); }}
                style={{
                  padding: '6px 12px', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
                  color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.2s', flex: 1, justifyContent: 'center',
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseDown={e => e.stopPropagation()}
              >
                <Pencil size={12} /> {showCustomNodeEditor ? 'Hide' : 'Edit'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); unpackCustomNode(node.id); }}
                style={{
                  padding: '6px 12px', background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '6px',
                  color: '#38bdf8', fontSize: '0.75rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.2s', flex: 1, justifyContent: 'center',
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.2)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)'}
                title="Rã nhóm custom node này ra canvas để sửa flow"
              >
                <Ungroup size={12} /> Unpack Flow
              </button>
            </div>
          </div>
          {showCustomNodeEditor && node.data.subNodes && (
            <div className="node-custom-ui" style={{ marginTop: '8px' }} onMouseDown={e => e.stopPropagation()}>
              <label style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sub-nodes</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
                {node.data.subNodes.map((sn, idx) => {
                  const isInput = node.data.exposedInputs?.includes(sn.id);
                  const isOutput = node.data.exposedOutputs?.includes(sn.id);
                  return (
                    <div key={sn.id} style={{
                      display: 'flex', flexDirection: 'column', gap: '4px',
                      padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: '8px', fontSize: '0.75rem', color: '#cbd5e1',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#64748b', fontSize: '0.65rem', minWidth: '18px' }}>#{idx + 1}</span>
                        <input
                          type="text"
                          value={sn.data?.label || ''}
                          onChange={(e) => {
                            const newSubNodes = node.data.subNodes.map(n => n.id === sn.id ? { ...n, data: { ...n.data, label: e.target.value } } : n);
                            updateNodeData(node.id, { subNodes: newSubNodes });
                          }}
                          style={{
                            flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '4px', color: '#e2e8f0', fontSize: '0.75rem', padding: '2px 6px', outline: 'none'
                          }}
                          title="Tên node con"
                        />
                        {isInput && <span style={{ fontSize: '0.6rem', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>IN</span>}
                        {isOutput && <span style={{ fontSize: '0.6rem', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>OUT</span>}
                      </div>
                      {(sn.type === 'text_input' || sn.type === 'meta_chat' || sn.type === 'meta_imagine' || sn.type === 'meta_video_gen' || sn.type === 'meta_video') && (
                        <textarea
                          placeholder="Prompt..."
                          value={sn.data?.prompt || ''}
                          onChange={(e) => {
                            const newSubNodes = node.data.subNodes.map(n => n.id === sn.id ? { ...n, data: { ...n.data, prompt: e.target.value } } : n);
                            updateNodeData(node.id, { subNodes: newSubNodes });
                          }}
                          style={{
                            width: '100%', minHeight: '60px', padding: '6px', background: 'rgba(0,0,0,0.3)', boxSizing: 'border-box',
                            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#f1f5f9',
                            fontSize: '0.75rem', outline: 'none', resize: 'vertical', marginTop: '4px'
                          }}
                          onMouseDown={e => e.stopPropagation()}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {resultUrl && (
            <div className="result-view" onMouseDown={e => e.stopPropagation()} style={{ marginTop: '8px' }}>
              <label>Result</label>
              {resultUrl.endsWith('.mp4') || resultUrl.endsWith('.webm') ? (
                <video src={resultUrl} controls autoPlay loop muted style={{ width: '100%', maxWidth: '100%', height: 'auto', borderRadius: '4px' }} />
              ) : resultUrl.endsWith('.mp3') || resultUrl.endsWith('.wav') ? (
                <audio src={resultUrl} controls style={{ width: '100%' }} />
              ) : (
                <img src={resultUrl} alt="Result" style={{ width: '100%', maxWidth: '100%', height: 'auto', borderRadius: '4px' }} />
              )}
            </div>
          )}
          {node.data.error && (
            <div className="node-custom-ui error-view" onMouseDown={e => e.stopPropagation()} style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fee2e2', borderLeft: '4px solid #ef4444', borderRadius: '6px', fontSize: '0.7rem', color: '#b91c1c', marginTop: '8px' }}>
              <label style={{ color: '#991b1b', fontWeight: 'bold', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.65rem' }}>Execution Error</label>
              <span style={{ lineHeight: '1.4', display: 'block', overflowWrap: 'break-word' }}>{node.data.error}</span>
            </div>
          )}
        </>
      );
    }

    return (
      <>
        {(node.type === 'text_input' || node.type === 'meta_chat' || node.type === 'meta_imagine' || node.type === 'meta_video_gen' || node.type === 'meta_video' || node.type === 'universal_llm') && (
          <div className="node-custom-ui" style={{ position: 'relative' }}>
            <label>Prompt</label>
            <textarea
              className={`node-textarea-${node.id}`}
              placeholder="Type something..."
              value={promptValue}
              onChange={(e) => {
                const val = e.target.value;
                setPromptValue(val);
                updateNodeData(node.id, { prompt: val });

                // Tìm gợi ý @reference_
                const selectionStart = e.target.selectionStart;
                const textBeforeCursor = val.slice(0, selectionStart);
                const lastAtIndex = textBeforeCursor.lastIndexOf('@');

                if (lastAtIndex !== -1 && lastAtIndex >= textBeforeCursor.lastIndexOf(' ')) {
                  const query = textBeforeCursor.slice(lastAtIndex + 1);
                  setSuggestionQuery(query);
                  setCursorIndex(selectionStart);

                  const refs = getParentReferences(node.id, nodes, edges);
                  const matchingRefs = refs.filter(r => r.name.toLowerCase().includes(query.toLowerCase()));
                  if (matchingRefs.length > 0) {
                    setSuggestionsList(matchingRefs);
                    setShowSuggestions(true);
                  } else {
                    setShowSuggestions(false);
                  }
                } else {
                  setShowSuggestions(false);
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
            {showSuggestions && suggestionsList.length > 0 && (
              <div className="suggestions-overlay" style={{
                position: 'absolute',
                background: '#0f172a',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                zIndex: 100,
                left: '0',
                right: '0',
                maxHeight: '120px',
                overflowY: 'auto',
                padding: '4px',
                marginTop: '2px'
              }}
                onMouseDown={e => e.preventDefault()}
              >
                {suggestionsList.map(s => (
                  <div
                    key={s.name}
                    onClick={() => {
                      const textBeforeAt = promptValue.slice(0, cursorIndex - suggestionQuery.length - 1);
                      const textAfterCursor = promptValue.slice(cursorIndex);
                      const newValue = textBeforeAt + s.name + ' ' + textAfterCursor;
                      setPromptValue(newValue);
                      updateNodeData(node.id, { prompt: newValue });
                      setShowSuggestions(false);

                      setTimeout(() => {
                        const textarea = document.querySelector(`.node-textarea-${node.id}`);
                        if (textarea) {
                          textarea.focus();
                          const newPos = textBeforeAt.length + s.name.length + 1;
                          textarea.setSelectionRange(newPos, newPos);
                        }
                      }, 50);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      color: '#e2e8f0',
                      transition: 'background 0.2s'
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {s.preview && <img src={s.preview} alt="p" style={{ width: '16px', height: '16px', borderRadius: '4px', objectFit: 'cover' }} />}
                    <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>@{s.name}</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>({s.label})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Display References Section immediately under Prompt if they exist */}
            {(() => {
              const refs = getParentReferences(node.id, nodes, edges);
              if (refs.length > 0) {
                return (
                  <div className="node-references-section" style={{
                    marginTop: '8px',
                    padding: '8px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <label style={{ fontSize: '0.6rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0' }}>
                      References ({refs.length})
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {refs.map(r => (
                        <div key={r.name} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '2px 6px',
                          background: 'rgba(56, 189, 248, 0.08)',
                          border: '1px solid rgba(56, 189, 248, 0.15)',
                          borderRadius: '4px',
                          fontSize: '0.65rem',
                          color: '#e2e8f0'
                        }}
                          title={`${r.label} (${r.filename})`}
                        >
                          {r.preview && (
                            <img src={r.preview} alt="ref" style={{ width: '12px', height: '12px', borderRadius: '2px', objectFit: 'cover' }} />
                          )}
                          <strong style={{ color: '#38bdf8' }}>{r.name}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* MODE_FAST toggle for Meta Chat node */}
            {node.type === 'meta_chat' && (
              <div
                onMouseDown={e => e.stopPropagation()}
                style={{
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px',
                  background: node.data.modeFast ? 'rgba(250, 204, 21, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                  border: `1px solid ${node.data.modeFast ? 'rgba(250, 204, 21, 0.3)' : 'rgba(255, 255, 255, 0.05)'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => updateNodeData(node.id, { modeFast: !node.data.modeFast })}
              >
                <div style={{
                  width: '32px',
                  height: '18px',
                  borderRadius: '9px',
                  background: node.data.modeFast ? '#facc15' : 'rgba(255, 255, 255, 0.15)',
                  position: 'relative',
                  transition: 'background 0.2s',
                  flexShrink: 0
                }}>
                  <div style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: '2px',
                    left: node.data.modeFast ? '16px' : '2px',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                  }} />
                </div>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: '600',
                  color: node.data.modeFast ? '#facc15' : '#94a3b8',
                  letterSpacing: '0.3px'
                }}>
                  {node.data.modeFast ? '\u26A1 MODE_FAST' : 'MODE_FAST'}
                </span>
                <span style={{ fontSize: '0.6rem', color: '#64748b', marginLeft: 'auto' }}>
                  {node.data.modeFast ? 'Text-only, faster response' : 'Off'}
                </span>
              </div>
            )}

            {/* Universal LLM specific controls */}
            {node.type === 'universal_llm' && (
              <div
                onMouseDown={e => e.stopPropagation()}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}
              >
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>Provider</label>
                    <select
                      value={node.data.provider || 'openai'}
                      onChange={e => updateNodeData(node.id, { provider: e.target.value, model: '' })}
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
                    >
                      <option value="openai">OpenAI</option>
                      <option value="gemini">Google Gemini</option>
                      <option value="anthropic">Anthropic Claude</option>
                      <option value="ollama">Ollama (Local)</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>Model</label>
                    <select
                      value={
                        !node.data.model ? '' :
                          ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'mimo-v2-omni',
                            'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash',
                            'claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-3-5-sonnet-20241022',
                            'llama3', 'mistral', 'codellama', 'phi3'].includes(node.data.model) ? node.data.model : 'custom'
                      }
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          updateNodeData(node.id, { model: 'custom-model' });
                        } else {
                          updateNodeData(node.id, { model: val });
                        }
                      }}
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
                    >
                      <option value="">Auto</option>
                      {({
                        openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'mimo-v2-omni'],
                        gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
                        anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-3-5-sonnet-20241022'],
                        ollama: ['llama3', 'mistral', 'codellama', 'phi3'],
                      }[node.data.provider || 'openai'] || []).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      <option value="custom">Custom...</option>
                    </select>
                  </div>
                </div>
                {!['', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'mimo-v2-omni',
                  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash',
                  'claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-3-5-sonnet-20241022',
                  'llama3', 'mistral', 'codellama', 'phi3'].includes(node.data.model ?? '') && (
                    <div>
                      <label style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>Custom Model Name</label>
                      <input
                        type="text"
                        value={node.data.model || ''}
                        onChange={e => updateNodeData(node.id, { model: e.target.value })}
                        placeholder="e.g. mimo-v2-omni"
                        style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}
                <div>
                  <label style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>System Prompt <span style={{ color: '#64748b', fontWeight: 'normal', textTransform: 'none' }}>(optional)</span></label>
                  <textarea
                    placeholder="You are a helpful assistant..."
                    value={node.data.systemPrompt || ''}
                    onChange={e => updateNodeData(node.id, { systemPrompt: e.target.value })}
                    style={{ width: '100%', minHeight: '40px', padding: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#f1f5f9', fontSize: '0.75rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                    onMouseDown={e => e.stopPropagation()}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Temperature: {node.data.temperature ?? 0.7}</label>
                    <input
                      type="range" min="0" max="2" step="0.1"
                      value={node.data.temperature ?? 0.7}
                      onChange={e => updateNodeData(node.id, { temperature: parseFloat(e.target.value) })}
                      style={{ width: '100%', accentColor: '#8b5cf6' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Max Tokens</label>
                    <input
                      type="number" min="1" max="128000"
                      value={node.data.maxTokens ?? 2048}
                      onChange={e => updateNodeData(node.id, { maxTokens: parseInt(e.target.value) || 2048 })}
                      style={{ width: '100%', padding: '4px 6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {node.type === 'add_audio' && (
          <div className="node-custom-ui file-drop" style={{ cursor: 'pointer', position: 'relative' }} onMouseDown={e => e.stopPropagation()} onClick={() => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'audio/*';
            inp.onchange = (ev) => {
              const f = ev.target.files[0]; if (!f) return;
              const reader = new FileReader();
              reader.onload = () => {
                const b64 = reader.result.split(',')[1];
                updateNodeData(node.id, { base64Data: b64, fileName: f.name, mimeType: f.type, audioPreview: reader.result });
              };
              reader.readAsDataURL(f);
            };
            inp.click();
          }}>
            {node.data.audioPreview ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <audio src={node.data.audioPreview} controls style={{ width: '100%', height: '32px' }} />
                <span style={{ fontSize: '0.65rem', color: '#ec4899', wordBreak: 'break-all' }}>Attached: {node.data.fileName}</span>
              </div>
            ) : (
              <>
                <Mic size={20} />
                <span style={{ fontSize: '0.75rem' }}>Click to upload audio (or connect Audio node)</span>
              </>
            )}
          </div>
        )}
        {node.type === 'extract_frame' && (
          <div className="node-custom-ui" onMouseDown={(e) => e.stopPropagation()}>
            <label>Extraction Strategy</label>
            <select
              value={node.data.frameType || 'last'}
              onChange={(e) => updateNodeData(node.id, { frameType: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(0, 0, 0, 0.2)',
                color: '#fff',
                fontSize: '0.75rem',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: '8px'
              }}
            >
              <option value="last">Last Frame (Đuôi video)</option>
              <option value="first">First Frame (Đầu video)</option>
              <option value="custom">Custom Timestamp (Mốc thời gian)</option>
            </select>

            {node.data.frameType === 'custom' && (
              <>
                <label style={{ display: 'block', marginBottom: '4px' }}>Time Offset (Seconds)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g. 2.5"
                  value={node.data.timeOffset === undefined ? 0 : node.data.timeOffset}
                  onChange={(e) => updateNodeData(node.id, { timeOffset: parseFloat(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    background: 'rgba(0, 0, 0, 0.2)',
                    color: '#fff',
                    fontSize: '0.75rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </>
            )}
            <span style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '6px', display: 'block', lineHeight: '1.3' }}>
              Extracts a static frame from parent video and uploads it to Meta AI.
            </span>
          </div>
        )}
        {node.type === 'merge_videos' && (
          <div className="node-custom-ui" onMouseDown={(e) => e.stopPropagation()}>
            <label>Timeline Order</label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px',
              background: 'rgba(132, 204, 22, 0.1)',
              border: '1px solid rgba(132, 204, 22, 0.2)',
              borderRadius: '6px',
              color: '#84cc16',
              fontSize: '0.7rem',
              fontWeight: '500',
              lineHeight: '1.3',
              marginBottom: '6px'
            }}>
              <Film size={14} />
              <span>Timeline: Trái sang Phải (X-axis)</span>
            </div>
            <span style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '4px', display: 'block', lineHeight: '1.3' }}>
              Nối tất cả video đầu vào thành một video dài duy nhất theo thứ tự từ trái sang phải trên Canvas!
            </span>
          </div>
        )}
        {node.type === 'file_input' && (
          <div
            className="node-custom-ui file-drop"
            onClick={() => fileInputRef.current.click()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ cursor: 'pointer', position: 'relative' }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              style={{ display: 'none' }}
            />
            {isUploading ? (
              <>
                <Loader2 size={20} className="spin" />
                <span>Uploading to Meta AI...</span>
              </>
            ) : previewUrl ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <img src={previewUrl} alt="Preview" style={{ width: '100%', borderRadius: '6px', maxHeight: '500px', objectFit: 'cover' }} />
                <span style={{ fontSize: '0.65rem', color: '#10b981', wordBreak: 'break-all' }}>Attached: {node.data.filename}</span>
              </div>
            ) : (
              <>
                <Upload size={20} />
                <span style={{ fontSize: '0.75rem' }}>Click to upload image</span>
              </>
            )}
          </div>
        )}

        {/* ── Vibes AI: Upload Image ── */}
        {node.type === 'vibes_upload_image' && (
          <>
            <div
              className="node-custom-ui file-drop"
              style={{ cursor: 'pointer', position: 'relative' }}
              onMouseDown={e => e.stopPropagation()}
              onClick={() => {
                const inp = document.createElement('input');
                inp.type = 'file'; inp.accept = 'image/*';
                inp.onchange = (ev) => {
                  const f = ev.target.files[0]; if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const b64 = reader.result.split(',')[1];
                    updateNodeData(node.id, { base64Data: b64, fileName: f.name, mimeType: f.type, previewUrl: reader.result });
                  };
                  reader.readAsDataURL(f);
                };
                inp.click();
              }}
            >
              {node.data.previewUrl ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <img src={node.data.previewUrl} alt="Preview" style={{ width: '100%', borderRadius: '6px', maxHeight: '500px', objectFit: 'cover' }} />
                  <span style={{ fontSize: '0.65rem', color: '#38bdf8', wordBreak: 'break-all' }}>Attached: {node.data.fileName}</span>
                </div>
              ) : (
                <>
                  <Upload size={20} />
                  <span style={{ fontSize: '0.75rem' }}>Click to upload image</span>
                </>
              )}
            </div>
            {node.data.url && (
              <div className="node-custom-ui" onMouseDown={e => e.stopPropagation()} style={{ paddingTop: 0, marginTop: '-8px' }}>
                <label style={{ fontSize: '0.6rem', color: '#94a3b8' }}>CDN URL</label>
                <a href={node.data.url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: '0.6rem', color: '#38bdf8', wordBreak: 'break-all', marginTop: '2px' }}>
                  {node.data.url.slice(0, 60)}…
                </a>
              </div>
            )}
          </>
        )}

        {/* ── Vibes AI: Upload Audio ── */}
        {node.type === 'vibes_upload_audio' && (
          <>
            <div
              className="node-custom-ui file-drop"
              style={{ cursor: 'pointer', position: 'relative' }}
              onMouseDown={e => e.stopPropagation()}
              onClick={() => {
                const inp = document.createElement('input');
                inp.type = 'file'; inp.accept = 'audio/*';
                inp.onchange = (ev) => {
                  const f = ev.target.files[0]; if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const b64 = reader.result.split(',')[1];
                    updateNodeData(node.id, { base64Data: b64, fileName: f.name, mimeType: f.type, audioPreview: reader.result });
                  };
                  reader.readAsDataURL(f);
                };
                inp.click();
              }}
            >
              {node.data.audioPreview ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <audio src={node.data.audioPreview} controls style={{ width: '100%', height: '32px' }} />
                  <span style={{ fontSize: '0.65rem', color: '#f472b6', wordBreak: 'break-all' }}>Attached: {node.data.fileName}</span>
                </div>
              ) : (
                <>
                  <Mic size={20} />
                  <span style={{ fontSize: '0.75rem' }}>Click to upload audio</span>
                </>
              )}
            </div>
            {node.data.cdnUrl && (
              <div className="node-custom-ui" onMouseDown={e => e.stopPropagation()} style={{ paddingTop: 0, marginTop: '-8px' }}>
                <label style={{ fontSize: '0.6rem', color: '#94a3b8' }}>CDN URL</label>
                <a href={node.data.cdnUrl} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: '0.6rem', color: '#f472b6', wordBreak: 'break-all', marginTop: '2px' }}>
                  {node.data.cdnUrl.slice(0, 60)}…
                </a>
              </div>
            )}
          </>
        )}

        {/* ── Vibes AI: Enhance Prompt ── */}
        {node.type === 'vibes_generate_prompts' && (
          <div className="node-custom-ui" onMouseDown={e => e.stopPropagation()}>
            <label>Seed Prompt</label>
            <textarea
              placeholder="Describe your scene…"
              value={promptValue}
              onChange={e => { setPromptValue(e.target.value); updateNodeData(node.id, { prompt: e.target.value }); }}
              onMouseDown={e => e.stopPropagation()}
            />
            <label style={{ marginTop: '6px' }}>Batch Type</label>
            <select
              value={node.data.batchType || 'images'}
              onChange={e => updateNodeData(node.id, { batchType: e.target.value })}
              style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
            >
              <option value="images">Images</option>
              <option value="videos">Videos</option>
            </select>
            {node.data.variations && node.data.variations.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.6rem', color: '#a78bfa', fontWeight: 'bold', textTransform: 'uppercase' }}>Enhanced Prompts ({node.data.variations.length})</label>
                {node.data.variations.map((v, i) => (
                  <div key={i} style={{ fontSize: '0.7rem', color: '#e2e8f0', padding: '6px 8px', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '6px', lineHeight: '1.4' }}>
                    {v.image ?? v.video ?? JSON.stringify(v)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Vibes AI: Generate Images ── */}
        {node.type === 'vibes_generate_images' && (
          <div className="node-custom-ui" onMouseDown={e => e.stopPropagation()}>
            <label>Prompt</label>
            <div className="prompt-wrapper" style={{ position: 'relative' }}>
              <textarea
                placeholder="Describe the image…"
                value={promptValue}
                onChange={e => {
                  const val = e.target.value;
                  setPromptValue(val);
                  updateNodeData(node.id, { prompt: val });

                  // Tìm gợi ý @reference_
                  const selectionStart = e.target.selectionStart;
                  const textBeforeCursor = val.slice(0, selectionStart);
                  const lastAtIndex = textBeforeCursor.lastIndexOf('@');
                  if (lastAtIndex !== -1) {
                    const query = textBeforeCursor.slice(lastAtIndex + 1);
                    setSuggestionQuery(query);
                    setCursorIndex(selectionStart);

                    const refs = getParentReferences(node.id, nodes, edges);
                    const matchingRefs = refs.filter(r => r.name.toLowerCase().includes(query.toLowerCase()));
                    if (matchingRefs.length > 0) {
                      setSuggestionsList(matchingRefs);
                      setShowSuggestions(true);
                    } else {
                      setShowSuggestions(false);
                    }
                  } else {
                    setShowSuggestions(false);
                  }
                }}
                onKeyDown={e => {
                  if (showSuggestions) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionIndex(i => (i < suggestionsList.length - 1 ? i + 1 : i)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestionIndex(i => (i > 0 ? i - 1 : 0)); }
                    else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      handleSelectSuggestion(suggestionsList[suggestionIndex]);
                    }
                    else if (e.key === 'Escape') { setShowSuggestions(false); }
                  }
                }}
              />
              {showSuggestions && (
                <div className="suggestions-dropdown" style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 1000, background: '#1e293b',
                  border: '1px solid #334155', borderRadius: '6px', padding: '4px', marginTop: '2px', width: '100%',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)', maxHeight: '150px', overflowY: 'auto'
                }}>
                  {suggestionsList.map((s, idx) => (
                    <div
                      key={s.name}
                      style={{
                        padding: '6px 8px', cursor: 'pointer', borderRadius: '4px', fontSize: '0.75rem',
                        background: idx === suggestionIndex ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        display: 'flex', alignItems: 'center', gap: '8px'
                      }}
                      onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                      onMouseEnter={() => setSuggestionIndex(idx)}
                    >
                      {s.preview && <img src={s.preview} alt="p" style={{ width: '16px', height: '16px', borderRadius: '4px', objectFit: 'cover' }} />}
                      <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>@{s.name}</span>
                      <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>({s.label})</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Display References Section immediately under Prompt if they exist */}
              {(() => {
                const refs = getParentReferences(node.id, nodes, edges);
                if (refs.length > 0) {
                  return (
                    <div className="node-references-section" style={{
                      marginTop: '8px',
                      padding: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      <label style={{ fontSize: '0.6rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0' }}>
                        References ({refs.length})
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {refs.map(r => (
                          <div key={r.name} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(56, 189, 248, 0.1)',
                            border: '1px solid rgba(56, 189, 248, 0.2)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.65rem'
                          }}>
                            <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>@{r.name}</span>
                            <span style={{ color: '#94a3b8' }}>{r.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            {/* <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <label style={{ flex: '0 0 auto' }}>Count</label>
              <input
                type="number" min="1" max="4"
                value={node.data.count ?? 2}
                onChange={e => updateNodeData(node.id, { count: Number(e.target.value) })}
                style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
              />
            </div> */}
          </div>
        )}

        {/* ── Vibes AI: Generate Videos ── */}
        {node.type === 'vibes_generate_videos' && (
          <div className="node-custom-ui" onMouseDown={e => e.stopPropagation()}>
            <label>Prompt</label>
            <div className="prompt-wrapper" style={{ position: 'relative' }}>
              <textarea
                placeholder="Describe the video…"
                value={promptValue}
                onChange={e => {
                  const val = e.target.value;
                  setPromptValue(val);
                  updateNodeData(node.id, { prompt: val });

                  // Tìm gợi ý @reference_
                  const selectionStart = e.target.selectionStart;
                  const textBeforeCursor = val.slice(0, selectionStart);
                  const lastAtIndex = textBeforeCursor.lastIndexOf('@');
                  if (lastAtIndex !== -1) {
                    const query = textBeforeCursor.slice(lastAtIndex + 1);
                    setSuggestionQuery(query);
                    setCursorIndex(selectionStart);

                    const refs = getParentReferences(node.id, nodes, edges);
                    const matchingRefs = refs.filter(r => r.name.toLowerCase().includes(query.toLowerCase()));
                    if (matchingRefs.length > 0) {
                      setSuggestionsList(matchingRefs);
                      setShowSuggestions(true);
                    } else {
                      setShowSuggestions(false);
                    }
                  } else {
                    setShowSuggestions(false);
                  }
                }}
                onKeyDown={e => {
                  if (showSuggestions) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionIndex(i => (i < suggestionsList.length - 1 ? i + 1 : i)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestionIndex(i => (i > 0 ? i - 1 : 0)); }
                    else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      handleSelectSuggestion(suggestionsList[suggestionIndex]);
                    }
                    else if (e.key === 'Escape') { setShowSuggestions(false); }
                  }
                }}
              />
              {showSuggestions && (
                <div className="suggestions-dropdown" style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 1000, background: '#1e293b',
                  border: '1px solid #334155', borderRadius: '6px', padding: '4px', marginTop: '2px', width: '100%',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)', maxHeight: '150px', overflowY: 'auto'
                }}>
                  {suggestionsList.map((s, idx) => (
                    <div
                      key={s.name}
                      style={{
                        padding: '6px 8px', cursor: 'pointer', borderRadius: '4px', fontSize: '0.75rem',
                        background: idx === suggestionIndex ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        display: 'flex', alignItems: 'center', gap: '8px'
                      }}
                      onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                      onMouseEnter={() => setSuggestionIndex(idx)}
                    >
                      {s.preview && <img src={s.preview} alt="p" style={{ width: '16px', height: '16px', borderRadius: '4px', objectFit: 'cover' }} />}
                      <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>@{s.name}</span>
                      <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>({s.label})</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Display References Section immediately under Prompt if they exist */}
              {(() => {
                const refs = getParentReferences(node.id, nodes, edges);
                if (refs.length > 0) {
                  return (
                    <div className="node-references-section" style={{
                      marginTop: '8px',
                      padding: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      <label style={{ fontSize: '0.6rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0' }}>
                        Frame References ({refs.length}/2)
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {refs.map((r, i) => {
                          let frameLabel = '';
                          if (i === 0) frameLabel = 'Start Frame';
                          else if (i === 1) frameLabel = 'End Frame';
                          else frameLabel = 'Extra (Ignored)';

                          return (
                            <div key={r.name} style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'rgba(251, 146, 60, 0.08)',
                              border: '1px solid rgba(251, 146, 60, 0.2)',
                              padding: '4px 6px',
                              borderRadius: '4px',
                              fontSize: '0.65rem'
                            }}>
                              {r.preview && (
                                <img src={r.preview} alt="ref" style={{ width: '16px', height: '16px', borderRadius: '2px', objectFit: 'cover' }} />
                              )}
                              <span style={{ color: '#fb923c', fontWeight: 'bold', fontSize: '0.6rem' }}>[{frameLabel}]</span>
                              <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>@{r.name}</span>
                              <span style={{ color: '#94a3b8' }}>{r.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            <label style={{ marginTop: '6px' }}>Video Model</label>
            <select
              value={node.data.videoModel || 'midjen-short'}
              onChange={e => updateNodeData(node.id, { videoModel: e.target.value })}
              style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
            >
              <option value="midjen-short">Midjen Short</option>
              <option value="midjen">Midjen</option>
            </select>
          </div>
        )}

        {/* ── Vibes AI: TTS ── */}
        {node.type === 'vibes_tts' && (
          <div className="node-custom-ui" onMouseDown={e => e.stopPropagation()}>
            <label>Text</label>
            <textarea
              placeholder="Text to speak…"
              value={promptValue}
              onChange={e => { setPromptValue(e.target.value); updateNodeData(node.id, { text: e.target.value, prompt: e.target.value }); }}
              onMouseDown={e => e.stopPropagation()}
            />
            <label style={{ marginTop: '6px' }}>Voice ID <span style={{ color: '#64748b', fontWeight: 'normal' }}>(optional)</span></label>
            <input
              type="text"
              placeholder="Leave blank to auto-select"
              value={node.data.voiceId || ''}
              onChange={e => updateNodeData(node.id, { voiceId: e.target.value })}
              onMouseDown={e => e.stopPropagation()}
              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        )}

        {/* ── Vibes AI: Animate (Lip-sync) ── */}
        {node.type === 'vibes_animate' && (
          <div className="node-custom-ui" onMouseDown={e => e.stopPropagation()}>
            <label>Script / Prompt</label>
            <div className="prompt-wrapper" style={{ position: 'relative' }}>
              <textarea
                placeholder="Script for lip-sync…"
                value={promptValue}
                onChange={e => {
                  const val = e.target.value;
                  setPromptValue(val);
                  updateNodeData(node.id, { script: val, prompt: val });

                  // Tìm gợi ý @reference_
                  const selectionStart = e.target.selectionStart;
                  const textBeforeCursor = val.slice(0, selectionStart);
                  const lastAtIndex = textBeforeCursor.lastIndexOf('@');
                  if (lastAtIndex !== -1) {
                    const query = textBeforeCursor.slice(lastAtIndex + 1);
                    setSuggestionQuery(query);
                    setCursorIndex(selectionStart);

                    const refs = getParentReferences(node.id, nodes, edges);
                    const matchingRefs = refs.filter(r => r.name.toLowerCase().includes(query.toLowerCase()));
                    if (matchingRefs.length > 0) {
                      setSuggestionsList(matchingRefs);
                      setShowSuggestions(true);
                    } else {
                      setShowSuggestions(false);
                    }
                  } else {
                    setShowSuggestions(false);
                  }
                }}
                onKeyDown={e => {
                  if (showSuggestions) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionIndex(i => (i < suggestionsList.length - 1 ? i + 1 : i)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestionIndex(i => (i > 0 ? i - 1 : 0)); }
                    else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      handleSelectSuggestion(suggestionsList[suggestionIndex]);
                    }
                    else if (e.key === 'Escape') { setShowSuggestions(false); }
                  }
                }}
                onMouseDown={e => e.stopPropagation()}
              />
              {showSuggestions && (
                <div className="suggestions-dropdown" style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 1000, background: '#1e293b',
                  border: '1px solid #334155', borderRadius: '6px', padding: '4px', marginTop: '2px', width: '100%',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)', maxHeight: '150px', overflowY: 'auto'
                }}>
                  {suggestionsList.map((s, idx) => (
                    <div
                      key={s.name}
                      style={{
                        padding: '6px 8px', cursor: 'pointer', borderRadius: '4px', fontSize: '0.75rem',
                        background: idx === suggestionIndex ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        display: 'flex', alignItems: 'center', gap: '8px'
                      }}
                      onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                      onMouseEnter={() => setSuggestionIndex(idx)}
                    >
                      {s.preview && <img src={s.preview} alt="p" style={{ width: '16px', height: '16px', borderRadius: '4px', objectFit: 'cover' }} />}
                      <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>@{s.name}</span>
                      <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>({s.label})</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Display References Section immediately under Prompt if they exist */}
              {(() => {
                const refs = getParentReferences(node.id, nodes, edges);
                const audioRef = refs.find(r => r.type === 'vibes_upload_audio' || r.type === 'vibes_tts' || (r.label && r.label.toLowerCase().includes('audio')) || r.preview?.startsWith('data:audio') || r.preview?.endsWith('.mp3'));
                const imageRefs = refs.filter(r => r.name !== audioRef?.name);

                if (refs.length > 0) {
                  return (
                    <div className="node-references-section" style={{
                      marginTop: '8px',
                      padding: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      <label style={{ fontSize: '0.6rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0' }}>
                        Source References ({refs.length})
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {refs.map((r, i) => {
                          const isAudio = r.name === audioRef?.name;
                          const isAvatar = !isAudio && imageRefs[0]?.name === r.name;

                          let labelText = isAudio ? 'Audio Source' : (isAvatar ? 'Avatar Face' : 'Ignored');
                          let tagColor = isAudio ? '#f472b6' : (isAvatar ? '#10b981' : '#94a3b8');

                          return (
                            <div key={r.name} style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: `rgba(${isAudio ? '244,114,182' : (isAvatar ? '16,185,129' : '148,163,184')}, 0.1)`,
                              border: `1px solid rgba(${isAudio ? '244,114,182' : (isAvatar ? '16,185,129' : '148,163,184')}, 0.2)`,
                              padding: '4px 6px',
                              borderRadius: '4px',
                              fontSize: '0.65rem'
                            }}>
                              {r.preview && !isAudio && (
                                <img src={r.preview} alt="ref" style={{ width: '16px', height: '16px', borderRadius: '2px', objectFit: 'cover' }} />
                              )}
                              {isAudio && <Mic size={14} color={tagColor} />}
                              <span style={{ color: tagColor, fontWeight: 'bold', fontSize: '0.6rem' }}>[{labelText}]</span>
                              <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>@{r.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            {/* <label style={{ marginTop: '6px' }}>Audio URL <span style={{ color: '#64748b', fontWeight: 'normal' }}>(or connect Upload Audio node)</span></label>
            <input
              type="text"
              placeholder="https://cdn.vibes.ai/…"
              value={node.data.audioUrl || ''}
              onChange={e => updateNodeData(node.id, { audioUrl: e.target.value })}
              onMouseDown={e => e.stopPropagation()}
              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
            />
            <label style={{ marginTop: '6px' }}>Audio Duration (ms)</label>
            <input
              type="number" min="1000" step="500"
              value={node.data.audioDurationMs ?? 5000}
              onChange={e => updateNodeData(node.id, { audioDurationMs: Number(e.target.value) })}
              onMouseDown={e => e.stopPropagation()}
              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
            /> */}
          </div>
        )}

        {(resultUrl || (['meta_chat', 'universal_llm', 'http_request', 'json_extractor', 'text_transform'].includes(node.type) && node.data.text)) && (
          <div className="node-custom-ui result-view" onMouseDown={e => e.stopPropagation()}>
            {node.type === 'universal_llm' && node.data.text ? (
              <div style={{
                padding: '12px',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(124, 58, 237, 0.05) 100%)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(139, 92, 246, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8b5cf6', fontWeight: 'bold', fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                  <Brain size={14} />
                  <span>{(node.data.provider || 'AI').toUpperCase()} RESPONSE</span>
                </div>
                <textarea
                  value={node.data.text}
                  readOnly
                  style={{ width: '100%', minHeight: '60px', maxHeight: '120px', border: 'none', background: 'transparent', color: '#e2e8f0', fontSize: '0.8rem', lineHeight: '1.5', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
            ) : (['http_request', 'json_extractor', 'text_transform'].includes(node.type) && node.data.text) ? (
              <div style={{
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontWeight: 'bold', fontSize: '0.65rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  <span>Output</span>
                </div>
                <textarea
                  value={node.data.text}
                  readOnly
                  style={{ width: '100%', minHeight: '40px', maxHeight: '100px', border: 'none', background: 'transparent', color: '#e2e8f0', fontSize: '0.75rem', lineHeight: '1.4', resize: 'vertical', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>
            ) : node.type === 'meta_chat' && node.data.text ? (
              <div style={{
                padding: '12px',
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(14, 165, 233, 0.05) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(56, 189, 248, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontWeight: 'bold', fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                  <MessageSquare size={14} />
                  <span>META AI RESPONSE</span>
                </div>
                <div style={{
                  fontSize: '0.85rem',
                  color: '#e2e8f0',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  maxHeight: '100px'
                }}
                  title={node.data.text}
                >
                  <textarea
                    value={node.data.text}
                    readOnly
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      background: 'transparent',
                      color: '#e2e8f0',
                      fontSize: '0.85rem',
                      maxHeight: '100px'
                    }}
                  />
                </div>
              </div>
            ) : node.type === 'add_audio' ? (
              <video src={resultUrl} controls style={{ width: '100%', borderRadius: '4px', outline: 'none' }} />
            ) : node.type === 'vibes_tts' ? (
              <audio src={resultUrl} controls style={{ width: '100%', height: '32px', borderRadius: '4px', outline: 'none' }} />
            ) : ((resultUrl.includes('.mp4') || node.type === 'meta_video_gen' || node.type === 'meta_video' || node.type === 'merge_videos' || node.type === 'vibes_generate_videos' || node.type === 'vibes_animate') && resultUrl.startsWith('http')) ? (
              <video
                src={resultUrl}

                controls
                autoPlay
                loop
                muted
                playsInline
                style={{ width: '100%', borderRadius: '6px', background: '#000', display: 'block', objectFit: 'cover' }}
              />
            ) : resultUrl.startsWith('fbid://') ? (
              <div style={{
                padding: '14px',
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(124, 58, 237, 0.05) 100%)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(168, 85, 247, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a855f7', fontWeight: 'bold', fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                  <Video size={14} style={{ animation: 'pulse 1.5s infinite' }} />
                  <span>META AI VIDEO READY</span>
                </div>

                <div style={{ fontSize: '0.65rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                  Video đã được sinh thành công trên cụm GPU của Meta AI!
                </div>

                <div style={{
                  padding: '6px 8px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '4px',
                  fontSize: '0.6rem',
                  color: '#94a3b8',
                  fontFamily: 'monospace',
                  border: '1px solid rgba(255,255,255,0.05)',
                  wordBreak: 'break-all'
                }}>
                  fbid: {resultUrl.replace('fbid://', '')}
                </div>

                <div style={{ fontSize: '0.6rem', color: '#a855f7', opacity: 0.9, lineHeight: '1.3', borderLeft: '2px solid #a855f7', paddingLeft: '6px' }}>
                  Luồng đã được đồng bộ với tài khoản Meta AI của bạn.
                </div>

                <a
                  href="https://www.meta.ai/"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontSize: '0.65rem',
                    fontWeight: '600',
                    color: '#ffffff',
                    background: '#a855f7',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    marginTop: '4px',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                    boxShadow: '0 2px 6px rgba(168, 85, 247, 0.3)'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = '#9333ea'}
                  onMouseOut={e => e.currentTarget.style.background = '#a855f7'}
                >
                  <ExternalLink size={12} /> Mở Meta.ai Để Xem & Tải Video
                </a>
              </div>
            ) : (
              <img src={resultUrl} alt="Result" />
            )}
            <a href={resultUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.6rem', marginTop: '6px', color: '#38bdf8' }}>
              <ExternalLink size={10} /> View Full Source
            </a>
          </div>
        )}

        {node.data.error && (
          <div className="node-custom-ui error-view" onMouseDown={e => e.stopPropagation()} style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fee2e2', borderLeft: '4px solid #ef4444', borderRadius: '6px', fontSize: '0.7rem', color: '#b91c1c', marginTop: '8px' }}>
            <label style={{ color: '#991b1b', fontWeight: 'bold', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.65rem' }}>Execution Error</label>
            <span style={{ lineHeight: '1.4', display: 'block' }}>{node.data.error}</span>
          </div>
        )}

        {/* ── Condition Node (If/Else) ── */}
        {node.type === 'condition' && (
          <div className="node-custom-ui" onMouseDown={e => e.stopPropagation()}>
            <label>Condition</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Field (dot path)</label>
                <input
                  type="text"
                  placeholder="e.g. text, status, body.result"
                  value={node.data.field || ''}
                  onChange={e => updateNodeData(node.id, { field: e.target.value })}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Operator</label>
                <select
                  value={node.data.operator || 'is_truthy'}
                  onChange={e => updateNodeData(node.id, { operator: e.target.value })}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
                >
                  <option value="equals">Equals</option>
                  <option value="not_equals">Not Equals</option>
                  <option value="contains">Contains</option>
                  <option value="not_contains">Not Contains</option>
                  <option value="greater_than">Greater Than</option>
                  <option value="less_than">Less Than</option>
                  <option value="is_empty">Is Empty</option>
                  <option value="is_not_empty">Is Not Empty</option>
                  <option value="is_truthy">Is Truthy</option>
                </select>
              </div>
              {!['is_empty', 'is_not_empty', 'is_truthy'].includes(node.data.operator || 'is_truthy') && (
                <div>
                  <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Compare Value</label>
                  <input
                    type="text"
                    placeholder="Value to compare..."
                    value={node.data.value || ''}
                    onChange={e => updateNodeData(node.id, { value: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Delay Node ── */}
        {node.type === 'delay' && (
          <div className="node-custom-ui" onMouseDown={e => e.stopPropagation()}>
            <label>Delay (seconds)</label>
            <input
              type="number" min="0.1" step="0.5"
              value={node.data.seconds ?? 1}
              onChange={e => updateNodeData(node.id, { seconds: parseFloat(e.target.value) || 1 })}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
            />
            <span style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '6px', display: 'block' }}>Pauses workflow execution for the specified duration.</span>
          </div>
        )}

        {/* ── HTTP Request Node ── */}
        {node.type === 'http_request' && (
          <div className="node-custom-ui" onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <div style={{ flex: '0 0 90px' }}>
                <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Method</label>
                <select
                  value={node.data.method || 'GET'}
                  onChange={e => updateNodeData(node.id, { method: e.target.value })}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>URL</label>
                <input
                  type="text"
                  placeholder="https://api.example.com/data"
                  value={node.data.url || ''}
                  onChange={e => updateNodeData(node.id, { url: e.target.value })}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            {(node.data.method === 'POST' || node.data.method === 'PUT') && (
              <div>
                <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Body (JSON)</label>
                <textarea
                  placeholder='{"key": "{{input.text}}"}'
                  value={node.data.body || ''}
                  onChange={e => updateNodeData(node.id, { body: e.target.value })}
                  style={{ width: '100%', minHeight: '50px', padding: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#f1f5f9', fontSize: '0.75rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'monospace' }}
                />
              </div>
            )}
            <span style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '6px', display: 'block' }}>Supports {'{{input.text}}'} template variables.</span>
          </div>
        )}

        {/* ── JSON Extractor Node ── */}
        {node.type === 'json_extractor' && (
          <div className="node-custom-ui" onMouseDown={e => e.stopPropagation()}>
            <label>JSON Path</label>
            <input
              type="text"
              placeholder="e.g. data.items[0].url"
              value={node.data.path || ''}
              onChange={e => updateNodeData(node.id, { path: e.target.value })}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }}
            />
            <span style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '6px', display: 'block' }}>Extracts a value from JSON using dot notation. Supports array indices: items[0].name</span>
          </div>
        )}

        {/* ── Text Transform Node ── */}
        {node.type === 'text_transform' && (
          <div className="node-custom-ui" onMouseDown={e => e.stopPropagation()}>
            <label>Operation</label>
            <select
              value={node.data.operation || 'template'}
              onChange={e => updateNodeData(node.id, { operation: e.target.value })}
              style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', marginBottom: '8px' }}
            >
              <option value="template">Template</option>
              <option value="regex">Regex Replace</option>
              <option value="uppercase">Uppercase</option>
              <option value="lowercase">Lowercase</option>
              <option value="trim">Trim</option>
              <option value="split">Split</option>
              <option value="join">Join</option>
            </select>
            {node.data.operation === 'template' && (
              <div>
                <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Template</label>
                <textarea
                  placeholder="Hello {{input1}}, your result is {{input2}}"
                  value={node.data.template || ''}
                  onChange={e => updateNodeData(node.id, { template: e.target.value })}
                  style={{ width: '100%', minHeight: '50px', padding: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#f1f5f9', fontSize: '0.75rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            )}
            {node.data.operation === 'regex' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>
                  <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Pattern</label>
                  <input type="text" placeholder="\d+" value={node.data.pattern || ''} onChange={e => updateNodeData(node.id, { pattern: e.target.value })} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Replacement</label>
                  <input type="text" placeholder="***" value={node.data.replacement || ''} onChange={e => updateNodeData(node.id, { replacement: e.target.value })} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            )}
            {(node.data.operation === 'split' || node.data.operation === 'join') && (
              <div>
                <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Delimiter</label>
                <input type="text" placeholder="\n" value={node.data.delimiter || ''} onChange={e => updateNodeData(node.id, { delimiter: e.target.value })} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            )}
          </div>
        )}

        {/* ── Loop Node ── */}
        {node.type === 'loop_node' && (
          <div className="node-custom-ui" onMouseDown={e => e.stopPropagation()}>
            <label>Loop Configuration</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Max Iterations</label>
                <input
                  type="number" min="1" max="1000"
                  value={node.data.maxIterations ?? 100}
                  onChange={e => updateNodeData(node.id, { maxIterations: parseInt(e.target.value) || 100 })}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Execution</label>
                <select
                  value={node.data.parallel ? 'parallel' : 'sequential'}
                  onChange={e => updateNodeData(node.id, { parallel: e.target.value === 'parallel' })}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
                >
                  <option value="sequential">Sequential</option>
                  <option value="parallel">Parallel</option>
                </select>
              </div>
            </div>
            <span style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '6px', display: 'block', lineHeight: '1.3' }}>Iterates over input array. Each item is processed through the sub-graph.</span>
          </div>
        )}
      </>
    );
  };

  return (
    <div
      ref={nodeRef}
      id={node.id}
      className={`workflow-node node-type-${node.type} ${isDragging ? 'dragging' : ''} ${isExecuting ? 'executing' : ''} ${isSelected ? 'selected' : ''}`}
      style={{
        transform: `translate(${node.position.x}px, ${node.position.y}px)`,
        ...(isSelected ? { boxShadow: '0 0 0 2px #38bdf8, 0 0 20px rgba(56, 189, 248, 0.3)' } : {}),
        ...(node.type === 'custom_node' ? { borderColor: node.data.color || '#f59e0b' } : {}),
      }}
      onMouseDown={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.stopPropagation();
          toggleNodeSelection(node.id);
          return;
        }
        onMouseDown(e);
      }}
    >
      <div className="node-ports-container">
        {node.type === 'custom_node' && node.data.exposedInputs?.length > 0 ? (
          node.data.exposedInputs.map((inputId, i) => {
            const subNode = node.data.subNodes?.find(sn => sn.id === inputId);
            const label = subNode?.data?.label || `Input ${i + 1}`;
            const percentage = ((i + 1) * 100) / (node.data.exposedInputs.length + 1);
            return (
              <div
                key={inputId}
                data-handle={inputId}
                className={`port port-in ${activeConnection ? 'port-active' : ''}`}
                style={{ top: `${percentage}%` }}
                onMouseUp={(e) => onPortMouseUp(e, 'in', inputId)}
              >
                <span className="port-label port-label-in">{label}</span>
              </div>
            );
          })
        ) : (
          <div className={`port port-in ${activeConnection ? 'port-active' : ''}`} onMouseUp={(e) => onPortMouseUp(e, 'in')}>
            {node.type === 'custom_node' && <span className="port-label port-label-in">IN</span>}
          </div>
        )}

        {node.type === 'condition' ? (
          /* Condition node: 2 output ports — true (green) and false (red) */
          <>
            <div
              data-handle="true"
              className="port port-out"
              style={{ top: '33%' }}
              onMouseDown={(e) => onPortMouseDown(e, 'out', 'true')}
            >
              <span className="port-label port-label-out" style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.6rem' }}>✓ True</span>
            </div>
            <div
              data-handle="false"
              className="port port-out"
              style={{ top: '66%' }}
              onMouseDown={(e) => onPortMouseDown(e, 'out', 'false')}
            >
              <span className="port-label port-label-out" style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.6rem' }}>✗ False</span>
            </div>
          </>
        ) : node.type === 'custom_node' && node.data.exposedOutputs?.length > 0 ? (
          node.data.exposedOutputs.map((outputId, i) => {
            const subNode = node.data.subNodes?.find(sn => sn.id === outputId);
            const label = subNode?.data?.label || `Output ${i + 1}`;
            const percentage = ((i + 1) * 100) / (node.data.exposedOutputs.length + 1);
            return (
              <div
                key={outputId}
                data-handle={outputId}
                className="port port-out"
                style={{ top: `${percentage}%` }}
                onMouseDown={(e) => onPortMouseDown(e, 'out', outputId)}
              >
                <span className="port-label port-label-out">{label}</span>
              </div>
            );
          })
        ) : (
          <div className="port port-out" onMouseDown={(e) => onPortMouseDown(e, 'out')}>
            {node.type === 'custom_node' && <span className="port-label port-label-out">OUT</span>}
          </div>
        )}
      </div>

      <div className="node-header">
        <span className="node-icon">{isExecuting ? <Loader2 size={18} className="spin" /> : getIcon()}</span>

        {isEditingLabel ? (
          <input
            type="text"
            className="node-label-edit"
            value={editLabelValue}
            onChange={(e) => setEditLabelValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setIsEditingLabel(false);
                updateNodeData(node.id, { label: editLabelValue });
              }
            }}
            onBlur={() => {
              setIsEditingLabel(false);
              updateNodeData(node.id, { label: editLabelValue });
            }}
            autoFocus
            onMouseDown={e => e.stopPropagation()}
            style={{
              flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid #38bdf8', borderRadius: '4px',
              color: '#fff', fontSize: '0.85rem', padding: '2px 4px', outline: 'none', width: '100%', minWidth: '80px'
            }}
          />
        ) : (
          <span
            className="node-label"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditLabelValue(node.data.label);
              setIsEditingLabel(true);
            }}
            title="Double click to rename"
            style={{ cursor: 'text' }}
          >
            {node.data.label}
          </span>
        )}

        <div className="node-actions">
          {isExecuting ? (
            <button
              className="run-single-btn"
              onClick={(e) => {
                e.stopPropagation();
                stopWorkflow();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                transition: 'all 0.2s',
                marginRight: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Dừng node này"
            >
              <div style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px' }} />
            </button>
          ) : (
            <button
              className="run-single-btn"
              onClick={(e) => {
                e.stopPropagation();
                runSingleNode(node.id);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#10b981',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                transition: 'all 0.2s',
                marginRight: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Chạy riêng node này"
            >
              <Play size={14} fill="#10b981" />
            </button>
          )}
          <button className="delete-btn" onClick={() => removeNode(node.id)}><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="node-content">
        {renderContent()}
      </div>

      <div className="node-footer">
        <ChevronRight size={12} />
        <span>{isExecuting ? 'Processing...' : (resultUrl || node.data.text) ? 'Completed' : 'Ready'}</span>
      </div>
    </div>
  );
};

export default Node;
