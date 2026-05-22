import React, { useState } from 'react';
import useWorkflowStore from '../../store/useWorkflowStore';
import TagInput from '../TagInput/TagInput';
import { X, Save } from 'lucide-react';
import './SaveWorkflowDialog.scss';

const SaveWorkflowDialog = ({ mode, onClose, onSaved }) => {
  const {
    workflowId, workflowName, workflowDescription, workflowTags,
    saveWorkflow, saveWorkflowAs, setWorkflowMeta, isSaving,
  } = useWorkflowStore();

  const isNew = !workflowId || mode === 'saveAs';

  const [name, setName] = useState(isNew && mode === 'saveAs' ? `${workflowName} (Copy)` : workflowName);
  const [description, setDescription] = useState(workflowDescription);
  const [tags, setTags] = useState([...workflowTags]);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      let workflow;
      if (mode === 'saveAs' || !workflowId) {
        workflow = await saveWorkflowAs({ name: name.trim(), description, tags, thumbnail: null });
      } else {
        setWorkflowMeta({ name: name.trim(), description, tags });
        workflow = await saveWorkflow(null);
      }
      onSaved(workflow);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="save-dialog-overlay" onClick={onClose}>
      <div className="save-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="sd-header">
          <h2>{isNew ? 'Save New Workflow' : 'Save Workflow'}</h2>
          <button className="sd-close" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="sd-field">
            <label htmlFor="wf-name">Name *</label>
            <input
              id="wf-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="My Workflow"
              maxLength={100}
              autoFocus
            />
          </div>

          <div className="sd-field">
            <label htmlFor="wf-desc">Description</label>
            <textarea
              id="wf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              maxLength={500}
            />
          </div>

          <div className="sd-field">
            <label>Tags</label>
            <TagInput tags={tags} onChange={setTags} />
          </div>

          {error && <div className="sd-error">{error}</div>}

          <div className="sd-actions">
            <button type="button" className="sd-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="sd-save" disabled={isSaving}>
              <Save size={16} />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SaveWorkflowDialog;
