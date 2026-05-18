import React from 'react';
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
  Film
} from 'lucide-react';
import './Sidebar.scss';

const Sidebar = () => {
  const addNode = useWorkflowStore(s => s.addNode);

  const nodeCategories = [
    {
      name: 'Meta AI Core',
      items: [
        { type: 'meta_chat', icon: <MessageSquare size={18} />, label: 'Meta AI Chat', color: '#38bdf8' },
        { type: 'meta_imagine', icon: <ImageIcon size={18} />, label: 'Imagine (Image)', color: '#10b981' },
        { type: 'meta_video_gen', icon: <Video size={18} />, label: 'Imagine (Video)', color: '#a855f7' },
        // { type: 'meta_video', icon: <Video size={18} />, label: 'Extend Video', color: '#f59e0b' },
        { type: 'extract_frame', icon: <Crop size={18} />, label: 'Extract Frame', color: '#06b6d4' },
        { type: 'merge_videos', icon: <Film size={18} />, label: 'Merge Videos', color: '#84cc16' },
        { type: 'meta_track', icon: <Music size={18} />, label: 'Track Resolver', color: '#ec4899' },
      ]
    },
    {
      name: 'Inputs & Data',
      items: [
        { type: 'text_input', icon: <FileText size={18} />, label: 'Text Prompt', color: '#818cf8' },
        { type: 'file_input', icon: <Zap size={18} />, label: 'Attachments', color: '#ec4899' },
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

  const onDragStart = (e, type) => {
    e.dataTransfer.setData('application/node-type', type);
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
                  onDragStart={(e) => onDragStart(e, item.type)}
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
      </div>

      <div className="sidebar-footer">
        Interactive Flow v1.1 • Meta AI Ready
      </div>
    </div>
  );
};

export default Sidebar;
