import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar/Sidebar';
import WorkflowCanvas from '../../components/WorkflowCanvas/WorkflowCanvas';
import Console from '../../components/Console/Console';
import SaveWorkflowDialog from '../../components/SaveWorkflowDialog/SaveWorkflowDialog';
import useWorkflowStore from '../../store/useWorkflowStore';
import { PanelLeftClose, PanelLeftOpen, TerminalSquare } from 'lucide-react';
import './CanvasPage.scss';

const CanvasPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const loadWorkflow = useWorkflowStore(s => s.loadWorkflow);
  const resetWorkflow = useWorkflowStore(s => s.resetWorkflow);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveMode, setSaveMode] = useState('save');
  const [loadError, setLoadError] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showConsole, setShowConsole] = useState(true);

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
      {showSidebar && <Sidebar />}
      <main style={{ position: 'relative' }}>
        <WorkflowCanvas onSave={handleOpenSave} onBack={handleBack} />
        {showConsole && <Console />}
        
        {/* Floating Panel Toggles */}
        <div style={{ position: 'absolute', bottom: showConsole ? '220px' : '20px', left: '20px', display: 'flex', gap: '10px', zIndex: 50, transition: 'bottom 0.3s' }}>
          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            style={{
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '8px',
              color: showSidebar ? '#38bdf8' : '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              transition: 'all 0.2s'
            }}
            title={showSidebar ? 'Hide Sidebar' : 'Show Sidebar'}
          >
            {showSidebar ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
          </button>

          <button 
            onClick={() => setShowConsole(!showConsole)}
            style={{
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '8px',
              color: showConsole ? '#38bdf8' : '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              transition: 'all 0.2s'
            }}
            title={showConsole ? 'Hide Console' : 'Show Console'}
          >
            <TerminalSquare size={20} />
          </button>
        </div>
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
