import React, { useEffect, useState } from 'react';
import useWorkflowStore from '../../store/useWorkflowStore';
import {
  Play,
  Settings,
  Database,
  Plus,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Zap,
  FileText,
  Search,
  Music,
  Crop,
  Film,
  Upload,
  Mic,
  Wand2,
  Layers,
  Clapperboard,
  Speaker,
  PersonStanding,
  Package,
  Trash2
} from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog';
import './Sidebar.scss';

const Sidebar = () => {
  const addNode = useWorkflowStore(s => s.addNode);
  const customNodeLibrary = useWorkflowStore(s => s.customNodeLibrary);
  const loadCustomNodeLibrary = useWorkflowStore(s => s.loadCustomNodeLibrary);
  const addCustomNodeFromTemplate = useWorkflowStore(s => s.addCustomNodeFromTemplate);
  const deleteCustomNodeTemplate = useWorkflowStore(s => s.deleteCustomNodeTemplate);
  const updateCustomNodeTemplate = useWorkflowStore(s => s.updateCustomNodeTemplate);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [editingTemplateName, setEditingTemplateName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadCustomNodeLibrary();
  }, [loadCustomNodeLibrary]);

  const nodeCategories = [
    {
      name: 'Meta AI Core',
      items: [
        { type: 'meta_chat', icon: <MessageSquare size={18} />, label: 'Meta Chat', color: '#38bdf8' },
        { type: 'meta_imagine', icon: <ImageIcon size={18} />, label: 'Meta Imagine (Image)', color: '#10b981' },
        { type: 'meta_video_gen', icon: <Video size={18} />, label: 'Meta Imagine (Video)', color: '#a855f7' },
        { type: 'file_input', icon: <Upload size={18} />, label: 'Meta Upload Image', color: '#38bdf8' },
      ]
    },
    {
      name: 'Utilities',
      items: [
        { type: 'extract_frame', icon: <Crop size={18} />, label: 'Extract Frame', color: '#06b6d4' },
        { type: 'merge_videos', icon: <Film size={18} />, label: 'Merge Videos', color: '#84cc16' },
        { type: 'meta_track', icon: <Music size={18} />, label: 'Track Resolver', color: '#ec4899' },
      ]
    },
    {
      name: 'Inputs & Data',
      items: [
        { type: 'text_input', icon: <FileText size={18} />, label: 'Text Prompt', color: '#818cf8' },
        
      ]
    },
    {
      name: 'Vibes AI',
      items: [
        { type: 'vibes_upload_image',     icon: <Upload size={18} />,         label: 'Vibes Upload Image',      color: '#38bdf8' },
        { type: 'vibes_upload_audio',     icon: <Mic size={18} />,            label: 'Vibes Upload Audio',      color: '#f472b6' },
        { type: 'vibes_generate_images',  icon: <Layers size={18} />,         label: 'Vibes Generate Images',   color: '#34d399' },
        { type: 'vibes_generate_videos',  icon: <Clapperboard size={18} />,   label: 'Vibes Generate Videos',   color: '#fb923c' },
        { type: 'vibes_animate',          icon: <PersonStanding size={18} />, label: 'Vibes Animate (Lip-sync)', color: '#f87171' },
      ]
    },
    {
      name: 'Logic',
      items: [
        { type: 'condition', icon: <Zap size={18} />, label: 'Condition', color: '#f43f5e' },
        { type: 'database', icon: <Database size={18} />, label: 'Store Result', color: '#6366f1' },
      ]
    }
  ];

  const onDragStart = (e, type, label) => {
    e.dataTransfer.setData('application/node-type', type);
    e.dataTransfer.setData('application/node-label', label);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleAddNode = (type, label) => {
    const id = Math.random().toString(36).substr(2, 9);
    addNode({
      id,
      type,
      position: { x: 100, y: 100 },
      data: { label },
    });
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Vibes AI Flow</h2>
        <div className="search-bar">
          <Search size={14} />
          <input type="text" placeholder="Search nodes..." />
        </div>
      </div>

      <div className="sidebar-content">
        {nodeCategories.map((cat) => (
          <div key={cat.name} className="node-category">
            <h3>{cat.name}</h3>
            <div className="node-palette">
              {cat.items.map((item) => (
                <div
                  key={item.type}
                  className="palette-item"
                  draggable
                  onDragStart={(e) => onDragStart(e, item.type, item.label)}
                  onClick={() => handleAddNode(item.type, item.label)}
                >
                  <div className="palette-icon" style={{ color: item.color }}>{item.icon}</div>
                  <span>{item.label}</span>
                  <Plus size={14} className="add-icon" />
                </div>
              ))}
            </div>
          </div>
        ))}

        {customNodeLibrary.length > 0 && (
          <div className="node-category">
            <h3>Custom Nodes</h3>
            <div className="node-palette">
              {customNodeLibrary.map((tpl) => (
                <div
                  key={tpl.id}
                  className="palette-item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/custom-node-id', tpl.id);
                    e.dataTransfer.setData('application/node-label', tpl.name);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => {
                    if (editingTemplateId === tpl.id) return;
                    addCustomNodeFromTemplate(tpl.id);
                  }}
                >
                  <div className="palette-icon" style={{ color: tpl.color || '#f59e0b' }}><Package size={18} /></div>
                  
                  {editingTemplateId === tpl.id ? (
                    <input 
                      autoFocus
                      type="text"
                      value={editingTemplateName}
                      onChange={e => setEditingTemplateName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          updateCustomNodeTemplate(tpl.id, { name: editingTemplateName });
                          setEditingTemplateId(null);
                        } else if (e.key === 'Escape') {
                          setEditingTemplateId(null);
                        }
                      }}
                      onBlur={() => {
                        updateCustomNodeTemplate(tpl.id, { name: editingTemplateName });
                        setEditingTemplateId(null);
                      }}
                      style={{
                        background: 'rgba(0,0,0,0.5)', border: '1px solid #38bdf8', 
                        color: '#fff', fontSize: '0.85rem', padding: '2px 4px', 
                        borderRadius: '4px', width: '100%', outline: 'none'
                      }}
                    />
                  ) : (
                    <span 
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingTemplateName(tpl.name);
                        setEditingTemplateId(tpl.id);
                      }}
                      title="Double click to rename"
                      style={{ flex: 1, cursor: 'text' }}
                    >
                      {tpl.name}
                    </span>
                  )}

                  {editingTemplateId !== tpl.id && (
                    <>
                      <span style={{ fontSize: '0.65rem', color: '#64748b', marginLeft: 'auto', marginRight: '20px' }}>{tpl.subNodeCount}n</span>
                      <button
                        className="add-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(tpl);
                        }}
                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px' }}
                        title="Delete template"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        Interactive Flow v1.1 • Meta AI Ready
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Custom Node"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={async () => {
            await deleteCustomNodeTemplate(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default Sidebar;
