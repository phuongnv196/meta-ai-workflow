'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

/**
 * List workflows with filtering, sorting, and pagination.
 */
async function listWorkflows({ search, tags, sort = 'updatedAt', order = 'desc', page = 1, limit = 20 } = {}) {
  const db = await getDb();
  await db.read();

  let items = [...(db.data.workflows || [])];

  // Search filter
  if (search) {
    const q = search.toLowerCase();
    items = items.filter(w =>
      w.name.toLowerCase().includes(q) ||
      (w.description && w.description.toLowerCase().includes(q))
    );
  }

  // Tag filter
  if (tags) {
    const tagList = tags.split(',').map(t => t.trim().toLowerCase());
    items = items.filter(w =>
      w.tags && w.tags.some(t => tagList.includes(t.toLowerCase()))
    );
  }

  // Sort
  const validSortFields = ['name', 'createdAt', 'updatedAt'];
  const sortField = validSortFields.includes(sort) ? sort : 'updatedAt';
  items.sort((a, b) => {
    const aVal = a[sortField] || '';
    const bVal = b[sortField] || '';
    if (sortField === 'name') {
      return order === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    return order === 'asc'
      ? new Date(aVal) - new Date(bVal)
      : new Date(bVal) - new Date(aVal);
  });

  // Pagination
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const paged = items.slice(start, start + limit);

  // Strip nodes/edges from list response, add counts
  const data = paged.map(({ nodes, edges, ...rest }) => ({
    ...rest,
    nodeCount: nodes ? nodes.length : 0,
    edgeCount: edges ? edges.length : 0,
  }));

  return {
    data,
    pagination: { page, limit, total, totalPages },
  };
}

/**
 * Get a single workflow by ID.
 */
async function getWorkflowById(id) {
  const db = await getDb();
  await db.read();
  return (db.data.workflows || []).find(w => w.id === id) || null;
}

/**
 * Create a new workflow.
 */
async function createWorkflow({ name, description, tags, thumbnail, nodes, edges }) {
  const db = await getDb();
  await db.read();

  const now = new Date().toISOString();
  const workflow = {
    id: uuidv4(),
    name,
    description: description || '',
    tags: tags || [],
    thumbnail: thumbnail || null,
    nodes: nodes || [],
    edges: edges || [],
    createdAt: now,
    updatedAt: now,
  };

  db.data.workflows.push(workflow);
  await db.write();

  return workflow;
}

/**
 * Update an existing workflow (partial update).
 */
async function updateWorkflow(id, updates) {
  const db = await getDb();
  await db.read();

  const index = (db.data.workflows || []).findIndex(w => w.id === id);
  if (index === -1) return null;

  const allowedFields = ['name', 'description', 'tags', 'thumbnail', 'nodes', 'edges'];
  const filtered = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      filtered[key] = updates[key];
    }
  }

  db.data.workflows[index] = {
    ...db.data.workflows[index],
    ...filtered,
    updatedAt: new Date().toISOString(),
  };

  await db.write();

  return db.data.workflows[index];
}

/**
 * Delete a workflow by ID.
 */
async function deleteWorkflow(id) {
  const db = await getDb();
  await db.read();

  const index = (db.data.workflows || []).findIndex(w => w.id === id);
  if (index === -1) return false;

  db.data.workflows.splice(index, 1);
  await db.write();

  return true;
}

/**
 * Duplicate a workflow by ID.
 */
async function duplicateWorkflow(id) {
  const db = await getDb();
  await db.read();

  const original = (db.data.workflows || []).find(w => w.id === id);
  if (!original) return null;

  const now = new Date().toISOString();
  const copy = {
    ...JSON.parse(JSON.stringify(original)),
    id: uuidv4(),
    name: `${original.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };

  db.data.workflows.push(copy);
  await db.write();

  return copy;
}

module.exports = {
  listWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
};
