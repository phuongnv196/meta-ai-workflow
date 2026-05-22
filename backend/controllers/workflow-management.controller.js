'use strict';

const { log } = require('../utils/logger');
const {
  listWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
} = require('../services/workflow-management.service');

// GET /workflows
const listController = async (req, res) => {
  try {
    const { search, tags, sort, order, page, limit } = req.query;
    const result = await listWorkflows({
      search,
      tags,
      sort,
      order,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    res.json(result);
  } catch (error) {
    log(`Error listing workflows: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /workflows/:id
const getByIdController = async (req, res) => {
  try {
    const workflow = await getWorkflowById(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    res.json(workflow);
  } catch (error) {
    log(`Error getting workflow: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /workflows
const createController = async (req, res) => {
  try {
    const { name, description, tags, thumbnail, nodes, edges } = req.body;

    // Validation
    const details = [];
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      details.push({ field: 'name', message: 'Name is required' });
    } else if (name.length > 100) {
      details.push({ field: 'name', message: 'Name must be 100 characters or less' });
    }
    if (description && description.length > 500) {
      details.push({ field: 'description', message: 'Description must be 500 characters or less' });
    }
    if (!Array.isArray(nodes)) {
      details.push({ field: 'nodes', message: 'Nodes must be an array' });
    }
    if (!Array.isArray(edges)) {
      details.push({ field: 'edges', message: 'Edges must be an array' });
    }
    if (tags && !Array.isArray(tags)) {
      details.push({ field: 'tags', message: 'Tags must be an array' });
    }

    if (details.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details });
    }

    const workflow = await createWorkflow({ name: name.trim(), description, tags, thumbnail, nodes, edges });
    log(`Created workflow: ${workflow.id} - ${workflow.name}`);
    res.status(201).json(workflow);
  } catch (error) {
    log(`Error creating workflow: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PUT /workflows/:id
const updateController = async (req, res) => {
  try {
    const { name, description, tags, thumbnail, nodes, edges } = req.body;

    // Validation
    const details = [];
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        details.push({ field: 'name', message: 'Name cannot be empty' });
      } else if (name.length > 100) {
        details.push({ field: 'name', message: 'Name must be 100 characters or less' });
      }
    }
    if (description !== undefined && description.length > 500) {
      details.push({ field: 'description', message: 'Description must be 500 characters or less' });
    }
    if (tags !== undefined && !Array.isArray(tags)) {
      details.push({ field: 'tags', message: 'Tags must be an array' });
    }
    if (nodes !== undefined && !Array.isArray(nodes)) {
      details.push({ field: 'nodes', message: 'Nodes must be an array' });
    }
    if (edges !== undefined && !Array.isArray(edges)) {
      details.push({ field: 'edges', message: 'Edges must be an array' });
    }

    if (details.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details });
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description;
    if (tags !== undefined) updates.tags = tags;
    if (thumbnail !== undefined) updates.thumbnail = thumbnail;
    if (nodes !== undefined) updates.nodes = nodes;
    if (edges !== undefined) updates.edges = edges;

    const workflow = await updateWorkflow(req.params.id, updates);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    log(`Updated workflow: ${workflow.id} - ${workflow.name}`);
    res.json(workflow);
  } catch (error) {
    log(`Error updating workflow: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /workflows/:id
const deleteController = async (req, res) => {
  try {
    const deleted = await deleteWorkflow(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    log(`Deleted workflow: ${req.params.id}`);
    res.json({ message: 'Workflow deleted successfully' });
  } catch (error) {
    log(`Error deleting workflow: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /workflows/:id/duplicate
const duplicateController = async (req, res) => {
  try {
    const workflow = await duplicateWorkflow(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    log(`Duplicated workflow: ${req.params.id} -> ${workflow.id}`);
    res.status(201).json(workflow);
  } catch (error) {
    log(`Error duplicating workflow: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  listController,
  getByIdController,
  createController,
  updateController,
  deleteController,
  duplicateController,
};
