'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

/**
 * List all custom node templates.
 */
async function listCustomNodes({ search } = {}) {
  const db = await getDb();
  await db.read();

  let items = [...(db.data.customNodes || [])];

  if (search) {
    const q = search.toLowerCase();
    items = items.filter(cn =>
      cn.name.toLowerCase().includes(q) ||
      (cn.description && cn.description.toLowerCase().includes(q))
    );
  }

  // Sort by updatedAt desc
  items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  // Return summary without heavy subNodes/subEdges
  const data = items.map(({ subNodes, subEdges, ...rest }) => ({
    ...rest,
    subNodeCount: subNodes ? subNodes.length : 0,
    subEdgeCount: subEdges ? subEdges.length : 0,
  }));

  return data;
}

/**
 * Get a single custom node template by ID.
 */
async function getCustomNodeById(id) {
  const db = await getDb();
  await db.read();
  return (db.data.customNodes || []).find(cn => cn.id === id) || null;
}

/**
 * Create a new custom node template.
 */
async function createCustomNode({ name, description, icon, color, subNodes, subEdges, exposedInputs, exposedOutputs }) {
  const db = await getDb();
  await db.read();

  if (!db.data.customNodes) {
    db.data.customNodes = [];
  }

  const now = new Date().toISOString();
  const customNode = {
    id: `tpl_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
    name,
    description: description || '',
    icon: icon || 'Layers',
    color: color || '#f59e0b',
    category: 'Custom',
    subNodes: subNodes || [],
    subEdges: subEdges || [],
    exposedInputs: exposedInputs || [],
    exposedOutputs: exposedOutputs || [],
    createdAt: now,
    updatedAt: now,
  };

  db.data.customNodes.push(customNode);
  await db.write();

  return customNode;
}

/**
 * Update an existing custom node template (partial update).
 */
async function updateCustomNode(id, updates) {
  const db = await getDb();
  await db.read();

  const items = db.data.customNodes || [];
  const index = items.findIndex(cn => cn.id === id);
  if (index === -1) return null;

  const allowedFields = ['name', 'description', 'icon', 'color', 'subNodes', 'subEdges', 'exposedInputs', 'exposedOutputs'];
  const filtered = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      filtered[key] = updates[key];
    }
  }

  db.data.customNodes[index] = {
    ...db.data.customNodes[index],
    ...filtered,
    updatedAt: new Date().toISOString(),
  };

  await db.write();

  return db.data.customNodes[index];
}

/**
 * Delete a custom node template by ID.
 */
async function deleteCustomNode(id) {
  const db = await getDb();
  await db.read();

  const items = db.data.customNodes || [];
  const index = items.findIndex(cn => cn.id === id);
  if (index === -1) return false;

  db.data.customNodes.splice(index, 1);
  await db.write();

  return true;
}

module.exports = {
  listCustomNodes,
  getCustomNodeById,
  createCustomNode,
  updateCustomNode,
  deleteCustomNode,
};
