'use strict';

const express = require('express');
const router = express.Router();
const settingsCtrl = require('../controllers/settings.controller');

router.get('/', settingsCtrl.getSettings);
router.put('/', settingsCtrl.updateSettings);
router.post('/test/:provider', settingsCtrl.testProvider);

module.exports = router;
