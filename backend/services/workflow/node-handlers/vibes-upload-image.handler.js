'use strict';

async function handle(node, inputs, context) {
  const { vibeClient, projectId: sharedProjectId, log } = context;

  // Accept base64 from node config, or from an upstream text_input / file_input result
  const base64Data =
    node.data.base64Data ||
    (inputs.find(i => i.base64Data)?.base64Data) ||
    null;

  if (!base64Data) {
    throw new Error('vibes_upload_image: no base64Data found in node config or inputs');
  }

  const fileName = node.data.fileName || inputs.find(i => i.fileName)?.fileName || inputs.find(i => i.filename)?.filename || 'upload.jpg';
  const mimeType = node.data.mimeType || inputs.find(i => i.mimeType)?.mimeType || 'image/jpeg';

  const projectId = node.data.projectId || sharedProjectId;

  log(`  Vibes uploadImage: "${fileName}" to project ${projectId || 'none'}`);

  let resultUrl = null;
  let resultMediaEntId = null;

  if (projectId) {
    // Better upload method for project association
    try {
      const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buffer = Buffer.from(base64Content, 'base64');
      const blob = new Blob([buffer], { type: mimeType });
      
      const result = await vibeClient.projectUploadMedia(projectId, blob, fileName);
      
      resultMediaEntId = result.mediaEntId || result.id;
      resultUrl = result.cdnUrl ?? result.imageUrl ?? result.url ?? null;
      log(`  Project upload successful: mediaEntId=${resultMediaEntId}`);
    } catch (e) {
      log(`  Warning: projectUploadMedia failed: ${e.message}. Falling back to uploadImage...`);
    }
  }

  // Fallback to basic uploadImage if no projectId or if projectUploadMedia failed
  if (!resultMediaEntId) {
    const imageUri = base64Data.startsWith('data:') ? base64Data : `data:${mimeType};base64,${base64Data}`;
    const result = await vibeClient.uploadImage(imageUri);
    resultMediaEntId = result.mediaEntId;
    resultUrl = result.imageUrl ?? result.cdnUrl ?? result.url ?? null;
  }

  log(`  Vibes uploadImage done → mediaEntId=${resultMediaEntId}  url=${String(resultUrl).slice(0, 80)}`);
  return { mediaEntId: resultMediaEntId, url: resultUrl, generatedImageUrl: resultUrl };
}

module.exports = { handle };
