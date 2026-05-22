import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useWorkflowListStore from '../../store/useWorkflowListStore';
import WorkflowCard from '../../components/WorkflowCard/WorkflowCard';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import { Plus, Search, SortAsc, SortDesc } from 'lucide-react';
import './WorkflowListPage.scss';

const WorkflowListPage = () => {
  const navigate = useNavigate();
  const {
    workflows, isLoading, error, search, sortBy, sortOrder,
    page, totalPages, total,
    fetchWorkflows, setSearch, setSortBy, setSortOrder, setPage,
    deleteWorkflow, duplicateWorkflow,
  } = useWorkflowListStore();

  const [searchInput, setSearchInput] = useState(search);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteWorkflow(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const handleDuplicate = async (id) => {
    await duplicateWorkflow(id);
  };

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
  };

  return (
    <div className="workflow-list-page">
      <header className="wlp-header">
        <div className="wlp-header-left">
          <h1>Vibes AI Flow</h1>
          <span className="wlp-count">{total} workflow{total !== 1 ? 's' : ''}</span>
        </div>
        <button className="wlp-new-btn" onClick={() => navigate('/canvas')}>
          <Plus size={18} />
          <span>New Workflow</span>
        </button>
      </header>

      <div className="wlp-filters">
        <div className="wlp-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <div className="wlp-sort">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="updatedAt">Last Updated</option>
            <option value="createdAt">Created</option>
            <option value="name">Name</option>
          </select>
          <button className="wlp-sort-order" onClick={toggleSortOrder} title={sortOrder === 'desc' ? 'Descending' : 'Ascending'}>
            {sortOrder === 'desc' ? <SortDesc size={16} /> : <SortAsc size={16} />}
          </button>
        </div>
      </div>

      <div className="wlp-content">
        {isLoading && workflows.length === 0 && (
          <div className="wlp-loading">Loading workflows...</div>
        )}

        {error && (
          <div className="wlp-error">Error: {error}</div>
        )}

        {!isLoading && workflows.length === 0 && !error && (
          <div className="wlp-empty">
            <p>No workflows yet</p>
            <button onClick={() => navigate('/canvas')}>
              <Plus size={16} /> Create your first workflow
            </button>
          </div>
        )}

        <div className="wlp-grid">
          {workflows.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              onClick={() => navigate(`/canvas/${wf.id}`)}
              onDuplicate={() => handleDuplicate(wf.id)}
              onDelete={() => setDeleteTarget(wf)}
            />
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="wlp-pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Workflow"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default WorkflowListPage;
