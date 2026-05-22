import { create } from 'zustand';
import { workflowApi } from '../api/workflow-api';

const useWorkflowListStore = create((set, get) => ({
  workflows: [],
  isLoading: false,
  error: null,
  search: '',
  selectedTags: [],
  sortBy: 'updatedAt',
  sortOrder: 'desc',
  page: 1,
  totalPages: 1,
  total: 0,

  fetchWorkflows: async () => {
    const { search, selectedTags, sortBy, sortOrder, page } = get();
    set({ isLoading: true, error: null });
    try {
      const result = await workflowApi.list({
        search: search || undefined,
        tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined,
        sort: sortBy,
        order: sortOrder,
        page,
        limit: 20,
      });
      set({
        workflows: result.data,
        totalPages: result.pagination.totalPages,
        total: result.pagination.total,
        isLoading: false,
      });
    } catch (error) {
      set({ error: error.message, isLoading: false });
    }
  },

  deleteWorkflow: async (id) => {
    try {
      await workflowApi.delete(id);
      set((state) => ({
        workflows: state.workflows.filter((w) => w.id !== id),
        total: state.total - 1,
      }));
    } catch (error) {
      set({ error: error.message });
    }
  },

  duplicateWorkflow: async (id) => {
    try {
      await workflowApi.duplicate(id);
      get().fetchWorkflows();
    } catch (error) {
      set({ error: error.message });
    }
  },

  setSearch: (search) => {
    set({ search, page: 1 });
    get().fetchWorkflows();
  },

  setSelectedTags: (selectedTags) => {
    set({ selectedTags, page: 1 });
    get().fetchWorkflows();
  },

  setSortBy: (sortBy) => {
    set({ sortBy, page: 1 });
    get().fetchWorkflows();
  },

  setSortOrder: (sortOrder) => {
    set({ sortOrder, page: 1 });
    get().fetchWorkflows();
  },

  setPage: (page) => {
    set({ page });
    get().fetchWorkflows();
  },
}));

export default useWorkflowListStore;
