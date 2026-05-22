import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar/Sidebar';
import WorkflowCanvas from '../../components/WorkflowCanvas/WorkflowCanvas';
import Console from '../../components/Console/Console';
import SaveWorkflowDialog from '../../components/SaveWorkflowDialog/SaveWorkflowDialog';
import useWorkflowStore from '../../store/useWorkflowStore';
import './CanvasPage.scss';

const CanvasPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const loadWorkflow = useWorkflowStore(s => s.loadWorkflow);
  const resetWorkflow = useWorkflowStore(s => s.resetWorkflow);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveMode, setSaveMode] = useState('save');
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (id) {
      loadWorkflow(id).catch((err) => {
        setLoadError(err.message);
      });
    } else {
      resetWorkflow();
    }
  }, [id]);

  const handleOpenSave = (mode = 'save') => {
    setSaveMode(mode);
    setShowSaveDialog(true);
  };

  const handleBack = () => {
    navigate('/');
  };

  if (loadError) {
    return (
      <div className="canvas-page-error">
        <p>Failed to load workflow: {loadError}</p>
        <button onClick={handleBack}>← Back to Workflows</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar />
      <main>
        <WorkflowCanvas onSave={handleOpenSave} onBack={handleBack} />
        <Console />
      </main>
      {showSaveDialog && (
        <SaveWorkflowDialog
          mode={saveMode}
          onClose={() => setShowSaveDialog(false)}
          onSaved={(workflow) => {
            setShowSaveDialog(false);
            if (!id && workflow?.id) {
              navigate(`/canvas/${workflow.id}`, { replace: true });
            }
          }}
        />
      )}
    </div>
  );
};

export default CanvasPage;
