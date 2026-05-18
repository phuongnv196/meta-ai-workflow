import React from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import WorkflowCanvas from './components/WorkflowCanvas/WorkflowCanvas';
import Console from './components/Console/Console';
import './App.scss';

function App() {
  return (
    <div className="app-container">
      <Sidebar />
      <main>
        <WorkflowCanvas />
        <Console />
      </main>
    </div>
  );
}

export default App;
