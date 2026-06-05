'use strict';

const { log } = require('../utils/logger');
const {
  listCustomNodes,
  getCustomNodeById,
  createCustomNode,
  updateCustomNode,
  deleteCustomNode,
} = require('../services/custom-node.service');

// GET /custom-nodes
const listController = async (req, res) => {
  try {
    const { search } = req.query;
    const data = await listCustomNodes({ search });
    res.json({ data });
  } catch (error) {
    log(`Error listing custom nodes: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /custom-nodes/:id
const getByIdController = async (req, res) => {
  try {
    const customNode = await getCustomNodeById(req.params.id);
    if (!customNode) {
      return res.status(404).json({ error: 'Custom node not found' });
    }
    res.json(customNode);
  } catch (error) {
    log(`Error getting custom node: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /custom-nodes
const createController = async (req, res) => {
  try {
    const { name, description, icon, color, subNodes, subEdges, exposedInputs, exposedOutputs } = req.body;

    const details = [];
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      details.push({ field: 'name', message: 'Name is required' });
    } else if (name.length > 100) {
      details.push({ field: 'name', message: 'Name must be 100 characters or less' });
    }
    if (!Array.isArray(subNodes) || subNodes.length === 0) {
      details.push({ field: 'subNodes', message: 'subNodes must be a non-empty array' });
    }
    if (!Array.isArray(subEdges)) {
      details.push({ field: 'subEdges', message: 'subEdges must be an array' });
    }
    if (!Array.isArray(exposedInputs) || exposedInputs.length === 0) {
      details.push({ field: 'exposedInputs', message: 'exposedInputs must be a non-empty array' });
    }
    if (!Array.isArray(exposedOutputs) || exposedOutputs.length === 0) {
      details.push({ field: 'exposedOutputs', message: 'exposedOutputs must be a non-empty array' });
    }

    if (details.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details });
    }

    const customNode = await createCustomNode({
      name: name.trim(),
      description,
      icon,
      color,
      subNodes,
      subEdges,
      exposedInputs,
      exposedOutputs,
    });

    log(`Created custom node: ${customNode.id} - ${customNode.name}`);
    res.status(201).json(customNode);
  } catch (error) {
    log(`Error creating custom node: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PUT /custom-nodes/:id
const updateController = async (req, res) => {
  try {
    const { name, description, icon, color, subNodes, subEdges, exposedInputs, exposedOutputs } = req.body;

    const details = [];
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        details.push({ field: 'name', message: 'Name cannot be empty' });
      } else if (name.length > 100) {
        details.push({ field: 'name', message: 'Name must be 100 characters or less' });
      }
    }
    if (subNodes !== undefined && !Array.isArray(subNodes)) {
      details.push({ field: 'subNodes', message: 'subNodes must be an array' });
    }
    if (subEdges !== undefined && !Array.isArray(subEdges)) {
      details.push({ field: 'subEdges', message: 'subEdges must be an array' });
    }

    if (details.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details });
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description;
    if (icon !== undefined) updates.icon = icon;
    if (color !== undefined) updates.color = color;
    if (subNodes !== undefined) updates.subNodes = subNodes;
    if (subEdges !== undefined) updates.subEdges = subEdges;
    if (exposedInputs !== undefined) updates.exposedInputs = exposedInputs;
    if (exposedOutputs !== undefined) updates.exposedOutputs = exposedOutputs;

    const customNode = await updateCustomNode(req.params.id, updates);
    if (!customNode) {
      return res.status(404).json({ error: 'Custom node not found' });
    }

    log(`Updated custom node: ${customNode.id} - ${customNode.name}`);
    res.json(customNode);
  } catch (error) {
    log(`Error updating custom node: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /custom-nodes/:id
const deleteController = async (req, res) => {
  try {
    const deleted = await deleteCustomNode(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Custom node not found' });
    }
    log(`Deleted custom node: ${req.params.id}`);
    res.json({ message: 'Custom node deleted successfully' });
  } catch (error) {
    log(`Error deleting custom node: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  listController,
  getByIdController,
  createController,
  updateController,
  deleteController,
};
