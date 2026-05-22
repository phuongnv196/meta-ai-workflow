'use strict';

const express = require('express');
const {
  listController,
  getByIdController,
  createController,
  updateController,
  deleteController,
  duplicateController,
} = require('../controllers/workflow-management.controller');

const router = express.Router();

router.get('/', listController);
router.get('/:id', getByIdController);
router.post('/', createController);
router.put('/:id', updateController);
router.delete('/:id', deleteController);
router.post('/:id/duplicate', duplicateController);

module.exports = router;
