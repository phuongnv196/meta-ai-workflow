'use strict';

const { GoogleGenAI } = require('@google/genai');
const settingsService = require('../../settings.service');
const config = require('../../../config/env');
const { resolveReferencePlaceholders } = require('../prompt-template');

async function handle(node, inputs, context) {
  const { log, globalRefMap = {}, results = {}, incomingEdges = [] } = context;

  // API key: ưu tiên .env, fallback về settings UI
  let apiKey = config.geminiApiKey;
  const geminiModel = config.geminiModel || 'gemini-3.1-flash-image';
  if (!apiKey) {
    const settings = await settingsService.getSettings();
    apiKey = settings?.providers?.gemini?.apiKey;
  }
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Set GEMINI_API_KEY in backend/.env or via Settings UI.');
  }

  // Prompt: lấy từ node config, hoặc nối thêm text từ upstream text nodes
  const nodePrompt = (node.data.prompt || '').trim();
  const inputPrompt = (inputs.find(i => i.promptText && !i.geminiInlineData)?.promptText
    || inputs.find(i => i.text && !i.geminiInlineData)?.text || '').trim();
  let prompt = [nodePrompt, inputPrompt].filter(Boolean).join('\n\n');

  if (!prompt) {
    throw new Error('Prompt is required for Gemini Image Generation.');
  }

  // Gemini has no in-prompt image id — resolve {{reference_xx}} to a positional
  // phrase ("the Nth reference image") matching the order images are attached below.
  const orderedRefNames = incomingEdges
    .map(e => e.source)
    .filter(srcId => {
      const r = results[srcId] || {};
      return r.base64Data || (r.previewUrl || r.generatedImageUrl || r.resultUrl || '').startsWith('data:');
    })
    .map(srcId => globalRefMap[srcId])
    .filter(Boolean);

  const { prompt: resolvedPrompt, replacements } = resolveReferencePlaceholders(prompt, {
    globalRefMap, results, platform: 'gemini', orderedRefNames,
  });
  prompt = resolvedPrompt;
  if (replacements.length) {
    log(`  Resolved ${replacements.length} reference placeholder(s): ${replacements.map(r => `{{${r.name}}}→${r.value}`).join(', ')}`);
  }

  // Build contents: text prompt first, then one inlineData per connected image
  const contents = [{ text: prompt }];

  for (const inp of inputs) {
    let base64 = '';
    let mimeType = 'image/jpeg';

    if (inp.geminiInlineData && inp.base64Data) {
      // Came from gemini_upload_image node — use directly
      base64 = inp.base64Data;
      mimeType = inp.mimeType || 'image/jpeg';
    } else if (inp.base64Data) {
      base64 = inp.base64Data.includes(',') ? inp.base64Data.split(',')[1] : inp.base64Data;
      mimeType = inp.mimeType || 'image/jpeg';
    } else {
      const dataUri = inp.previewUrl || inp.generatedImageUrl || inp.resultUrl || '';
      if (dataUri.startsWith('data:')) {
        const [meta, data] = dataUri.split(',');
        mimeType = meta.split(':')[1].split(';')[0];
        base64 = data;
      }
    }

    if (base64) {
      contents.push({ inlineData: { mimeType, data: base64 } });
    }
  }

  const imageCount = contents.length - 1;
  log(`  Gemini Image Gen: prompt="${prompt.slice(0, 80)}" inlineImages=${imageCount}`);

  const aspectRatio = node.data.aspectRatio || '1:1';
  const imageSize = node.data.imageSize || '1K';

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: geminiModel,
    contents,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      responseFormat: {
        image: {
          aspectRatio,
          imageSize,
        },
      },
    },
  });

  let resultBase64 = '';
  let resultMime = 'image/png';
  let responseText = '';

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      resultBase64 = part.inlineData.data;
      resultMime = part.inlineData.mimeType || 'image/png';
    } else if (part.text) {
      responseText = part.text;
      log(`  Gemini response text: ${part.text}`);
    }
  }

  if (!resultBase64) {
    throw new Error(`No image returned from Gemini. Model text: ${responseText || '(empty)'}`);
  }

  const resultDataUri = `data:${resultMime};base64,${resultBase64}`;

  return {
    generatedImageUrl: resultDataUri,
    previewUrl: resultDataUri,
    resultUrl: resultDataUri,
    base64Data: resultBase64,
    mimeType: resultMime,
    geminiInlineData: true,
    text: responseText,
  };
}

module.exports = { handle };
