import React from 'react';
import { Routes, Route } from 'react-router-dom';
import WorkflowListPage from './pages/WorkflowListPage/WorkflowListPage';
import CanvasPage from './pages/CanvasPage/CanvasPage';
import './App.scss';

function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkflowListPage />} />
      <Route path="/canvas" element={<CanvasPage />} />
      <Route path="/canvas/:id" element={<CanvasPage />} />
    </Routes>
  );
}

export default App;
