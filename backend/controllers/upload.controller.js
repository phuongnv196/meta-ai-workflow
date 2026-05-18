const fs = require('fs');
const { log } = require('../utils/logger');
const { uploadFile } = require('../services/meta_ai');
const { createTempPath, cleanupFile } = require('../services/temp-file.service');

const uploadController = async (req, res) => {
    const { base64Data, filename, mimeType } = req.body;

    let tempFilePath;
    try {
        log(`Received file upload request: ${filename} (${mimeType})`);
        const buffer = Buffer.from(base64Data, 'base64');

        const ext = filename ? '.' + filename.split('.').pop() : '.jpg';
        const { filePath } = createTempPath('upload', ext);
        tempFilePath = filePath;
        fs.writeFileSync(tempFilePath, buffer);

        log(`Uploading local file to Meta AI...`);
        const mediaId = await uploadFile(tempFilePath, mimeType || 'image/jpeg');
        log(`Successfully uploaded to Meta AI. Media ID: ${mediaId}`);

        res.json({ success: true, mediaId });
    } catch (error) {
        log(`Upload to Meta AI failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        cleanupFile(tempFilePath, { info: log, warn: log });
    }
};

module.exports = { uploadController };