'use strict';

const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const VibeAI = require('./services/vibe_ai/client');

const TEST_DIR = path.join(__dirname, 'test');
const FILE_1   = path.join(TEST_DIR, '1.jpeg');
const FILE_2   = path.join(TEST_DIR, '2.jpg');
const FILE_3   = path.join(TEST_DIR, 'audio.mp3');

// ── Terminal colors ──────────────────────────────────────────────────────────
const C = {
    green:  (s) => `\x1b[32m${s}\x1b[0m`,
    red:    (s) => `\x1b[31m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
    dim:    (s) => `\x1b[2m${s}\x1b[0m`,
    bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

const DIVIDER = C.cyan('━'.repeat(55));

// ── Result tracking ──────────────────────────────────────────────────────────
const results = { passed: 0, failed: 0, skipped: 0 };

const log = {
    pass:    (msg) => { console.log(`  ${C.green('✓')} ${msg}`);  results.passed++;  },
    fail:    (msg, err) => {
        console.log(`  ${C.red('✗')} ${msg}`);
        console.log(`    ${C.red(err?.message ?? String(err))}`);
        if (err?.stack) console.log(C.dim(err.stack.split('\n').slice(1, 3).map(l => '    ' + l.trim()).join('\n')));
        results.failed++;
    },
    skip: (msg) => {
        console.log(`  ${C.yellow('⊘')} ${C.dim(msg + ' (skipped)')}`);
        results.skipped++;
    },
    info:    (msg) => console.log(`    ${C.dim('→ ' + String(msg).slice(0, 150))}`),
    section: (msg) => console.log(`\n${C.cyan('▶ ' + msg)}`),
};

// ── Run helper ───────────────────────────────────────────────────────────────
const run = async (label, fn) => {
    const t = Date.now();
    try {
        const result = await fn();
        log.pass(`${label} ${C.dim(`(${Date.now() - t}ms)`)}`);
        return result;
    } catch (err) {
        log.fail(label, err);
        return null;
    }
};

// ── Shared state for chaining tests ─────────────────────────────────────────
const ctx = {
    projectId:     null,
    batchId:       null,
    contentItemId: null,
    moodboardId:   null,
    voiceId:       null,
    audioUrl:      null,
    imageEntId:    null,
};

// ═══════════════════════════════════════════════════════════════════════════════
(async () => {
    console.log(`\n${DIVIDER}`);
    console.log(C.bold(C.cyan('  VibeAI Integration Tests  —  ' + new Date().toLocaleString())));
    console.log(DIVIDER);

    if (!process.env.META_COOKIE) {
        console.log(C.red('\n  ✗ META_COOKIE not set in .env — aborting\n'));
        process.exit(1);
    }

    const client = VibeAI();

    // ── 1. Auth ──────────────────────────────────────────────────────────────
    log.section('1. Auth');

    const token = await run('checkToken', async () => {
        const data = await client.checkToken();
        log.info(JSON.stringify(data));
        return data;
    });

    if (!token) {
        console.log(C.red('\n  Auth failed — aborting remaining tests\n'));
        process.exit(1);
    }

    // ── 2. Quota ─────────────────────────────────────────────────────────────
    log.section('2. Quota');

    await run('getQuotaUpsell', async () => {
        const data = await client.getQuotaUpsell();
        log.info(JSON.stringify(data));
        return data;
    });

    // ── 3. Projects ───────────────────────────────────────────────────────────
    log.section('3. Projects');

    const projectList = await run('getListProject (limit=5)', async () => {
        const data = await client.getListProject(5, 0);
        const count = data.projects?.length ?? 0;
        log.info(`${count} project(s) found`);
        if (data.projects?.[0]) log.info(`First: ${JSON.stringify(data.projects[0]).slice(0, 100)}`);
        return data;
    });

    if (projectList?.projects?.[0]) ctx.projectId = projectList.projects[0].id;

    await run('createProject (test)', async () => {
        const name = `[IntTest] ${new Date().toISOString()}`;
        const raw = await client.createProject(name);
        const data = raw.project ?? raw;
        log.info(`id=${data.id}  name="${data.name}"`);
        log.info('raw: ' + JSON.stringify(raw).slice(0, 200));
        ctx.projectId = data.id;
        return raw;
    });

    // ── 4. Uploads (real files) ─────────────────────────────────────────────
    log.section('4. Uploads');

    let uploadedImage = null;  // { mediaEntId, url }
    let uploadedMedia = null;  // { mediaEntId, url }

    await run('uploadImage (1.jpeg → base64)', async () => {
        const buf  = fs.readFileSync(FILE_1);
        const b64  = `data:image/jpeg;base64,${buf.toString('base64')}`;
        const data = await client.uploadImage(b64);
        log.info('raw: ' + JSON.stringify(data).slice(0, 200));
        uploadedImage = {
            mediaEntId: data.mediaEntId ?? null,
            url: data.imageUrl ?? data.cdnUrl ?? data.url ?? null,
        };
        ctx.imageEntId = uploadedImage.mediaEntId;
        log.info(`mediaEntId=${uploadedImage.mediaEntId}  url=${String(uploadedImage.url).slice(0, 80)}`);
        return data;
    });

    await run('uploadMedia (2.jpg → FormData)', async () => {
        const buf  = fs.readFileSync(FILE_2);
        const blob = new Blob([buf], { type: 'image/jpeg' });
        const data = await client.uploadMedia(blob, '2.jpg');
        log.info('raw: ' + JSON.stringify(data).slice(0, 200));
        uploadedMedia = {
            mediaEntId: data.mediaEntId ?? null,
            url: data.cdnUrl ?? data.imageUrl ?? data.url ?? null,
        };
        log.info(`mediaEntId=${uploadedMedia.mediaEntId}  url=${String(uploadedMedia.url).slice(0, 80)}`);
        return data;
    });

    if (ctx.projectId) {
        await run(`projectUploadMedia (2.jpg → project ${ctx.projectId})`, async () => {
            const buf  = fs.readFileSync(FILE_2);
            const blob = new Blob([buf], { type: 'image/jpeg' });
            const data = await client.projectUploadMedia(ctx.projectId, blob, '2.jpg');
            log.info('raw: ' + JSON.stringify(data).slice(0, 200));
            return data;
        });
    } else {
        log.skip('projectUploadMedia — no projectId available');
    }

    let uploadedAudioCdnUrl = null;
    await run('uploadAudio (audio.mp3 → FormData field:audio)', async () => {
        const buf  = fs.readFileSync(FILE_3);
        const blob = new Blob([buf], { type: 'audio/mpeg' });
        const data = await client.uploadAudio(blob, 'audio.mp3');
        log.info('raw: ' + JSON.stringify(data).slice(0, 200));
        uploadedAudioCdnUrl = data.cdnUrl ?? data.url ?? null;
        ctx.audioUrl = uploadedAudioCdnUrl;
        log.info(`cdnUrl → ${uploadedAudioCdnUrl}`);
        return data;
    });

    // ── 5. Generation Batches ─────────────────────────────────────────────────
    log.section('5. Generation Batches');

    const batchList = await run('getListGenerationBatches (limit=5)', async () => {
        const data = await client.getListGenerationBatches(5, 0);
        const batches = data.generationBatches ?? data.batches ?? [];
        log.info(`${batches.length} batch(es) found`);
        return data;
    });

    const batches = batchList?.generationBatches ?? batchList?.batches ?? [];

    if (batches[0]) {
        ctx.batchId = batches[0].id;
        await run(`getGenerationBatch (${ctx.batchId})`, async () => {
            const raw = await client.getGenerationBatch(ctx.batchId);
            const batch = raw.batch ?? raw.generationBatch ?? raw;
            log.info('raw keys: ' + Object.keys(raw).join(', '));
            log.info('batch keys: ' + Object.keys(batch).join(', '));
            log.info(`status=${batch.status}  type=${batch.type}  title=${batch.title}`);
            const items = batch.contentItems ?? batch.items ?? [];
            log.info(`contentItems: ${items.length}`);
            if (items[0]) ctx.contentItemId = items[0].id;
            ctx._batchRaw = batch;
            return raw;
        });

        await run('updateGenerationBatch (title/name)', async () => {
            const patch = {
                id: ctx.batchId,
                ...(ctx._batchRaw ?? {}),
                title: `[IntTest] Updated ${Date.now()}`,
                name:  `[IntTest] Updated ${Date.now()}`,
            };
            const data = await client.updateGenerationBatch(patch);
            log.info(JSON.stringify(data).slice(0, 120));
            return data;
        });
    } else {
        log.skip('getGenerationBatch / updateGenerationBatch — no batches found');
    }

    await run('getListGenerationBatches (type=videos)', async () => {
        const data = await client.getListGenerationBatches(3, 0, { type: 'videos' });
        log.info(`${(data.generationBatches ?? []).length} video batch(es)`);
        return data;
    });

    await run('getListGenerationBatches (sort=oldest, searchQuery test)', async () => {
        const data = await client.getListGenerationBatches(3, 0, { sort: 'oldest' });
        log.info(`${(data.generationBatches ?? []).length} batch(es) oldest-first`);
        return data;
    });

    // ── 6. Content Items ──────────────────────────────────────────────────────
    log.section('6. Content Items');

    if (ctx.contentItemId) {
        await run(`getContentItem (${ctx.contentItemId})`, async () => {
            const data = await client.getContentItem(ctx.contentItemId);
            log.info(`status=${data.status}`);
            return data;
        });

        await run(`feedbackContentItem (thumbs_up)`, async () => {
            const data = await client.feedbackContentItem(ctx.contentItemId, 'thumbs_up');
            log.info(JSON.stringify(data).slice(0, 100));
            return data;
        });
    } else {
        log.skip('getContentItem / feedbackContentItem — no contentItemId available');
    }

    // ── 7. Studio ─────────────────────────────────────────────────────────────
    log.section('7. Studio');

    await run('getStudioVoices (limit=3)', async () => {
        const data = await client.getStudioVoices(3);
        const voices = data.voices ?? data ?? [];
        log.info(`${voices.length} voice(s)`);
        if (voices[0]) {
            log.info(`First: ${JSON.stringify(voices[0]).slice(0, 100)}`);
            ctx.voiceId = voices[0].id;
        }
        return data;
    });

    if (ctx.voiceId) {
        await run('ttsPlayai (Text-to-speech test)', async () => {
            const data = await client.ttsPlayai("Hello, this is an automated integration test.", ctx.voiceId);
            log.info('raw: ' + JSON.stringify(data).slice(0, 200));
            return data;
        });
    } else {
        log.skip('ttsPlayai — no voiceId found');
    }

    log.skip('getStudioIngredients — requires higher plan (403)');

    // ── 8. SSE Streams ────────────────────────────────────────────────────────
    log.section('8. SSE Streams');

    if (ctx.batchId) {
        await run(`getGenerationBatchStream (${ctx.batchId}) — first event`, async () => {
            const events = [];
            const TIMEOUT_MS = 6000;
            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; }, TIMEOUT_MS);

            try {
                for await (const event of client.getGenerationBatchStream(ctx.batchId)) {
                    events.push(event);
                    if (timedOut || events.length >= 1) break;
                }
            } finally {
                clearTimeout(timer);
            }

            log.info(events.length > 0 ? JSON.stringify(events[0]).slice(0, 120) : 'stream ended with no events');
            return events;
        });
    } else {
        log.skip('getGenerationBatchStream — no batchId available');
    }

    log.skip('streamTimelineChat — requires AI credits');

    // ── 9. AI Generation (Live) ─────────────────────────────────────────────
    log.section('9. AI Generation (Live)');

    if (ctx.projectId) {
        await run('streamTimelineChat (Chatbot AI)', async () => {
            const payload = {
                projectId: ctx.projectId,
                messages: [
                    { role: 'user', content: 'Generate a short 5-second cinematic video.' }
                ],
                projectState: { tracks: [] },
                clientTime: Date.now()
            };
            const events = [];
            const TIMEOUT_MS = 6000;
            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; }, TIMEOUT_MS);

            try {
                for await (const event of client.streamTimelineChat(payload)) {
                    if (timedOut) break;
                    events.push(event);
                }
            } catch (err) {
                // Ignore abort error
            }
            clearTimeout(timer);
            log.info(events.length > 0 ? JSON.stringify(events[0]).slice(0, 120) : 'stream ended with no events');
            return events;
        });
    } else {
        log.skip('streamTimelineChat — no projectId available');
    }

    if (ctx.audioUrl && ctx.imageEntId) {
        await run('animateGenerate (Lip-sync video from audio)', async () => {
            const data = await client.animateGenerate({
                audioUrl: ctx.audioUrl,
                audioDurationMs: 5000,
                script: "Hello, this is an automated lip-sync test.",
                engine: "midjen",
                projectId: ctx.projectId,
                imagePrompt: ctx.imageEntId // Thêm ảnh mặt người để làm lip-sync
            });
            log.info('raw: ' + JSON.stringify(data).slice(0, 200));
            return data;
        });
    } else {
        log.skip('animateGenerate — requires uploaded audioUrl and imageEntId');
    }

    // ttsPlayai already tested above in Studio section.

    // generatePrompts needs an existing batchId as context
    if (ctx.batchId) {
        await run('generatePrompts (enhance prompt using existing batchId)', async () => {
            const data = await client.generatePrompts({
                prompt:       'A cinematic shot of a futuristic city in neon lights',
                systemPrompt: undefined,
                batchId:      ctx.batchId,
                config:       {},
                batchType:    'images',
                projectId:    ctx.projectId,
            });
            log.info('raw: ' + JSON.stringify(data).slice(0, 200));
            return data;
        });
    } else {
        log.skip('generatePrompts — no batchId available from earlier tests');
    }

    // generateBatches creates the DB record, then generateImages starts the job
    let newBatchId = null;
    await run('generateBatches (create image batch record)', async () => {
        newBatchId = `batch-${Date.now()}`;
        const count = 2;
        const prompt = 'A beautiful golden sunset over misty mountains';
        const data = await client.generateBatches({
            id:         newBatchId,
            type:       'images',
            prompt,
            timestamp:  Date.now(),
            isComplete: false,
            config:     {},
            projectId:  ctx.projectId,
            content:    Array.from({ length: count }, (_, i) => ({
                id:        `${newBatchId}-content-${i}`,
                type:      'image',
                isLoading: true,
            })),
        });
        log.info('raw: ' + JSON.stringify(data).slice(0, 200));
        return data;
    });

    if (newBatchId) {
        await run('generateImages (start generation on new batch)', async () => {
            const prompt = 'A beautiful golden sunset over misty mountains';
            const data = await client.generateImages({
                batchId: newBatchId,
                inputs:  Array.from({ length: 2 }, () => ({
                    type:            'variation',
                    image_prompt:    prompt,
                    original_prompt: prompt,
                    config:          {},
                })),
                config: {},
            });
            log.info('raw: ' + JSON.stringify(data).slice(0, 200));
            return data;
        });
    } else {
        log.skip('generateImages — generateBatches failed, no newBatchId');
    }

    // Video generation: createBatch record first, then trigger generateVideos
    let newVideoBatchId = null;
    await run('generateBatches (create video batch record)', async () => {
        newVideoBatchId = `batch-${Date.now()}`;
        const prompt    = 'A cinematic drone shot flying over a futuristic city at night';
        const config    = { videoModel: 'midjen-short' };
        const data      = await client.generateBatches({
            id:         newVideoBatchId,
            type:       'videos',
            prompt,
            timestamp:  Date.now(),
            isComplete: false,
            config,
            projectId:  ctx.projectId,
            content:    [
                { id: `${newVideoBatchId}-content-0`, type: 'video', isLoading: true },
            ],
        });
        log.info('raw: ' + JSON.stringify(data).slice(0, 200));
        return data;
    });

    if (newVideoBatchId) {
        await run('generateVideos (start video generation on new batch)', async () => {
            const prompt = 'A cinematic drone shot flying over a futuristic city at night';
            const config = { videoModel: 'midjen-short' };
            const data   = await client.generateVideos({
                batchId: newVideoBatchId,
                inputs:  [
                    {
                        type:            'prompt',
                        value:           prompt,
                        original_prompt: prompt,
                        config,
                    },
                ],
                config,
            });
            log.info('raw: ' + JSON.stringify(data).slice(0, 200));
            return data;
        });
    } else {
        log.skip('generateVideos — generateBatches(video) failed, no newVideoBatchId');
    }

    // ── 10. Skipped (cost/destructive) ───────────────────────────────────────
    log.section('10. Skipped (remaining destructive or file-dependent tasks)');
    log.skip('retryContentItem       — requires a failed contentItem');
    log.skip('bulkDeleteContentItems — destructive');
    log.skip('deleteGenerationBatch  — destructive');
    log.skip('getStudioIngredients   — 403 plan restriction');

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}`);
    console.log(`  ${C.green('Passed :')} ${C.bold(String(results.passed))}`);
    if (results.failed  > 0) console.log(`  ${C.red('Failed :')} ${C.bold(String(results.failed))}`);
    console.log(`  ${C.yellow('Skipped:')} ${C.bold(String(results.skipped))}`);
    console.log(DIVIDER + '\n');

    process.exit(results.failed > 0 ? 1 : 0);
})();
