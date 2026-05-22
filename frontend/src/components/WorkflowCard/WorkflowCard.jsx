import React, { useState } from 'react';
import { MoreHorizontal, Copy, Trash2, GitBranch, Clock } from 'lucide-react';
import './WorkflowCard.scss';

function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

const WorkflowCard = ({ workflow, onClick, onDuplicate, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);

  const handleMenuClick = (e) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleAction = (e, action) => {
    e.stopPropagation();
    setShowMenu(false);
    action();
  };

  return (
    <div className="workflow-card" onClick={onClick}>
      <div className="wc-thumbnail">
        {workflow.thumbnail ? (
          <img src={workflow.thumbnail} alt={workflow.name} />
        ) : (
          <div className="wc-thumbnail-placeholder">
            <GitBranch size={32} />
          </div>
        )}
      </div>

      <div className="wc-body">
        <div className="wc-header">
          <h3 className="wc-name">{workflow.name}</h3>
          <button className="wc-menu-btn" onClick={handleMenuClick}>
            <MoreHorizontal size={16} />
          </button>

          {showMenu && (
            <div className="wc-menu">
              <button onClick={(e) => handleAction(e, onDuplicate)}>
                <Copy size={14} /> Duplicate
              </button>
              <button className="wc-menu-danger" onClick={(e) => handleAction(e, onDelete)}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>

        {workflow.description && (
          <p className="wc-description">{workflow.description}</p>
        )}

        {workflow.tags && workflow.tags.length > 0 && (
          <div className="wc-tags">
            {workflow.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="wc-tag">{tag}</span>
            ))}
            {workflow.tags.length > 3 && (
              <span className="wc-tag wc-tag-more">+{workflow.tags.length - 3}</span>
            )}
          </div>
        )}

        <div className="wc-footer">
          <span className="wc-stats">
            {workflow.nodeCount} nodes · {workflow.edgeCount} edges
          </span>
          <span className="wc-time">
            <Clock size={12} /> {timeAgo(workflow.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default WorkflowCard;
