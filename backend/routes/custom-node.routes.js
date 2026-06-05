'use strict';

const express = require('express');
const {
  listController,
  getByIdController,
  createController,
  updateController,
  deleteController,
} = require('../controllers/custom-node.controller');

const router = express.Router();

router.get('/', listController);
router.get('/:id', getByIdController);
router.post('/', createController);
router.put('/:id', updateController);
router.delete('/:id', deleteController);

module.exports = router;
