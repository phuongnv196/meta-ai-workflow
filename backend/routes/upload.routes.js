const express = require('express');
const { uploadController } = require('../controllers/upload.controller');
const { validate, validateUploadPayload } = require('../middleware/validate');
const router = express.Router();

router.post('/', validate(validateUploadPayload), uploadController);

module.exports = router;