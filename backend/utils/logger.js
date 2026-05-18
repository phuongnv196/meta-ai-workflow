'use strict';

const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, '..', 'execution.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

const log = (msg) => {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${msg}\n`;
    console.log(entry.trim());
    logStream.write(entry);
};

module.exports = { log };
