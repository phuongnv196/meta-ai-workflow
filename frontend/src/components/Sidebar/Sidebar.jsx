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
  Trash2,
  Brain,
  Globe,
  Braces,
  Type,
  Timer,
  Repeat,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Palette,
  Brush,
  Maximize2,
  ImagePlus
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
  const [expandedCategories, setExpandedCategories] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  const toggleCategory = (categoryName) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryName]: !prev[categoryName]
    }));
  };

  useEffect(() => {
    loadCustomNodeLibrary();
  }, [loadCustomNodeLibrary]);

  const nodeCategories = [
    {
      name: 'AI Models',
      items: [
        { type: 'universal_llm', icon: <Brain size={18} />, label: 'Universal LLM', color: '#8b5cf6' },
      ]
    },
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
        { type: 'add_audio', icon: <Music size={18} />, label: 'Add Audio to Video', color: '#ec4899' },
        { type: 'image_resize', icon: <Maximize2 size={18} />, label: 'Image Resize (Ratio)', color: '#f59e0b' },
      ]
    },
    {
      name: 'Inputs & Data',
      items: [
        { type: 'text_input', icon: <FileText size={18} />, label: 'Text Prompt', color: '#818cf8' },
        { type: 'add_image',  icon: <ImagePlus size={18} />, label: 'Add Image', color: '#10b981' },
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
      name: 'Flow Control',
      items: [
        { type: 'condition', icon: <GitBranch size={18} />, label: 'Condition (If/Else)', color: '#f43f5e' },
        { type: 'delay', icon: <Timer size={18} />, label: 'Delay', color: '#fbbf24' },
        { type: 'loop_node', icon: <Repeat size={18} />, label: 'Loop (ForEach)', color: '#f97316' },
      ]
    },
    {
      name: 'Data & Utils',
      items: [
        { type: 'text_transform', icon: <Type size={18} />, label: 'Text Transform', color: '#a78bfa' },
        { type: 'json_extractor', icon: <Braces size={18} />, label: 'JSON Extractor', color: '#2dd4bf' },
      ]
    },
    {
      name: 'Google Stitch',
      items: [
        { type: 'stitch_upload',   icon: <Upload size={18} />,  label: 'Stitch Upload',   color: '#ea4335' },
        { type: 'stitch_generate', icon: <Palette size={18} />, label: 'Stitch Generate', color: '#4285f4' },
        { type: 'stitch_edit',     icon: <Brush size={18} />,   label: 'Stitch Edit',     color: '#34a853' },
      ]
    },
    {
      name: 'Google Gemini',
      items: [
        { type: 'gemini_upload_image', icon: <Upload size={18} />, label: 'Gemini Upload Image', color: '#8b5cf6' },
        { type: 'gemini_image_gen', icon: <Wand2 size={18} />, label: 'Gemini Image Gen', color: '#8b5cf6' },
      ]
    },
    {
      name: 'Integrations',
      items: [
        { type: 'http_request', icon: <Globe size={18} />, label: 'HTTP Request', color: '#60a5fa' },
      ]
    },
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
          <input 
            type="text" 
            placeholder="Search nodes..." 
            value={searchTerm}
            onChange={(e) => {
              const val = e.target.value;
              setSearchTerm(val);
              
              if (val.trim() !== '') {
                const lowerVal = val.toLowerCase();
                const newExpanded = { ...expandedCategories };
                
                nodeCategories.forEach(cat => {
                  if (cat.items.some(item => 
                    item.label.toLowerCase().includes(lowerVal) || 
                    item.type.toLowerCase().includes(lowerVal)
                  )) {
                    newExpanded[cat.name] = true;
                  }
                });

                if (customNodeLibrary.some(tpl => 
                  tpl.name.toLowerCase().includes(lowerVal)
                )) {
                  newExpanded['Custom Nodes'] = true;
                }
                
                setExpandedCategories(newExpanded);
              }
            }}
          />
        </div>
      </div>

      <div className="sidebar-content">
        {nodeCategories.map((cat) => {
          const filteredItems = cat.items.filter(item => 
            item.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
            item.type.toLowerCase().includes(searchTerm.toLowerCase())
          );

          if (searchTerm && filteredItems.length === 0) return null;

          return (
            <div key={cat.name} className="node-category">
              <div 
                className="category-header" 
                onClick={() => toggleCategory(cat.name)}
              >
                {expandedCategories[cat.name] ? <ChevronDown size={14} className="category-icon" /> : <ChevronRight size={14} className="category-icon" />}
                <h3>{cat.name}</h3>
              </div>
              
              {expandedCategories[cat.name] && (
                <div className="node-palette">
                  {filteredItems.map((item) => (
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
              )}
            </div>
          );
        })}

        {customNodeLibrary.length > 0 && (() => {
          const filteredCustom = customNodeLibrary.filter(tpl => 
            tpl.name.toLowerCase().includes(searchTerm.toLowerCase())
          );

          if (searchTerm && filteredCustom.length === 0) return null;

          return (
            <div className="node-category">
              <div 
                className="category-header" 
                onClick={() => toggleCategory('Custom Nodes')}
              >
                {expandedCategories['Custom Nodes'] ? <ChevronDown size={14} className="category-icon" /> : <ChevronRight size={14} className="category-icon" />}
                <h3>Custom Nodes</h3>
              </div>
              
              {expandedCategories['Custom Nodes'] && (
                <div className="node-palette">
                  {filteredCustom.map((tpl) => (
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
            )}
          </div>
        );
        })()}
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
