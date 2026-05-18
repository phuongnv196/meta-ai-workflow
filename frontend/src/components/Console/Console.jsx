import React, { useEffect, useRef } from 'react';
import useWorkflowStore from '../../store/useWorkflowStore';
import { Terminal, Trash2 } from 'lucide-react';
import './Console.scss';

const Console = () => {
  const { logs, clearLogs } = useWorkflowStore();
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="console-panel">
      <div className="console-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Terminal size={14} />
            <h3>Execution Console</h3>
        </div>
        <button onClick={clearLogs} title="Clear Logs">
            <Trash2 size={14} />
        </button>
      </div>
      <div className="console-content" ref={scrollRef}>
        {logs.length === 0 && (
            <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem' }}>
                No logs to display. Run a workflow to see results.
            </div>
        )}
        {logs.map((log) => (
          <div key={log.id} className={`log-entry log-${log.type}`}>
            <span className="log-time">[{new Date(log.id).toLocaleTimeString()}]</span>
            <span className="log-msg">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Console;
