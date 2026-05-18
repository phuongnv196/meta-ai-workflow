const express = require('express');
const { executeController } = require('../controllers/execute.controller');
const { validate, validateExecutePayload } = require('../middleware/validate');
const router = express.Router();

router.post('/', validate(validateExecutePayload), executeController);

module.exports = router;