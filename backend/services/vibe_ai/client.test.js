'use strict';

jest.mock('../memory-cache.js', () => ({
    has: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
}));

const memoryCache = require('../memory-cache.js');

process.env.META_COOKIE = 'test_meta=cookie_abc';

const VibeAI = require('./client');

const BASE = 'https://vibes.ai';
const META_COOKIE = process.env.META_COOKIE;
const SESSION = 'sess_test_xyz';
const COMBINED = `${META_COOKIE}; meta_session=${SESSION}`;

global.fetch = jest.fn();

// -- Response builders --

const okJson = (data) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: jest.fn().mockResolvedValue(data),
    headers: {
        get: jest.fn(() => null),
        getSetCookie: jest.fn(() => []),
    },
    body: null,
});

const redirectRes = (location, cookies = []) => ({
    ok: false,
    status: 302,
    statusText: 'Found',
    json: jest.fn(),
    headers: {
        get: jest.fn((h) => (h === 'location' ? location : null)),
        getSetCookie: jest.fn(() => cookies),
    },
    body: null,
});

// Simulates response.body for SSE streaming
const sseBody = (chunks) => {
    let i = 0;
    return {
        getReader: () => ({
            read: jest.fn(() =>
                i < chunks.length
                    ? Promise.resolve({ done: false, value: Buffer.from(chunks[i++]) })
                    : Promise.resolve({ done: true, value: undefined })
            ),
            releaseLock: jest.fn(),
        }),
    };
};

const errRes = (status = 500) => ({
    ok: false,
    status,
    statusText: 'Internal Server Error',
    json: jest.fn(),
    headers: {
        get: jest.fn(() => null),
        getSetCookie: jest.fn(() => []),
    },
    body: sseBody([]),
});

// Pre-fill cache so getCombinedCookie() returns immediately without calling start()
const withCache = () => {
    memoryCache.has.mockReturnValue(true);
    memoryCache.get.mockReturnValue(SESSION);
};

// Setup 4-step OIDC redirect chain for start()
const setupStartMocks = (sessionValue = SESSION) => {
    fetch
        .mockResolvedValueOnce(redirectRes(`${BASE}/auth/step2`, [`oauth_csrf_token=csrf_tok; Path=/`]))
        .mockResolvedValueOnce(redirectRes('https://auth.meta.com/oidc'))
        .mockResolvedValueOnce(redirectRes(`${BASE}/api/meta-oidc/callback`))
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: jest.fn(),
            headers: {
                get: jest.fn(() => null),
                getSetCookie: jest.fn(() => [`meta_session=${sessionValue}; Path=/`, 'other=x; Path=/']),
            },
            body: null,
        });
};

// =====================================================================

describe('VibeAI Client', () => {
    let client;

    beforeEach(() => {
        jest.resetAllMocks();
        global.fetch = jest.fn();
        client = VibeAI();
    });

    // =====================
    //  start() / OIDC flow
    // =====================
    describe('start()', () => {
        it('follows 4-step redirect chain and returns session value', async () => {
            setupStartMocks('new_session_value');

            const result = await client.start();

            expect(result).toBe('new_session_value');
            expect(fetch).toHaveBeenCalledTimes(4);
            expect(fetch).toHaveBeenNthCalledWith(1,
                `${BASE}/api/meta-oidc/start`,
                expect.objectContaining({ redirect: 'manual', headers: expect.objectContaining({ Cookie: META_COOKIE }) })
            );
        });

        it('passes csrf token cookie into the callback step', async () => {
            setupStartMocks();
            await client.start();

            const callbackCall = fetch.mock.calls[3];
            expect(callbackCall[1].headers.Cookie).toContain('oauth_csrf_token=csrf_tok');
        });

        it('throws if step 1 returns no redirect location', async () => {
            fetch.mockResolvedValueOnce(okJson({}));
            await expect(client.start()).rejects.toThrow('Step 1 failed');
        });

        it('throws if step 2 returns no redirect location', async () => {
            fetch
                .mockResolvedValueOnce(redirectRes(`${BASE}/auth/step2`, ['oauth_csrf_token=t; Path=/']))
                .mockResolvedValueOnce(okJson({}));
            await expect(client.start()).rejects.toThrow('Step 2 failed');
        });

        it('throws if step 3 returns no redirect location', async () => {
            fetch
                .mockResolvedValueOnce(redirectRes(`${BASE}/auth/step2`))
                .mockResolvedValueOnce(redirectRes('https://auth.meta.com/oidc'))
                .mockResolvedValueOnce(okJson({}));
            await expect(client.start()).rejects.toThrow('Step 3 failed');
        });
    });

    // =====================
    //  getCombinedCookie() caching
    // =====================
    describe('getCombinedCookie() caching', () => {
        it('calls start() and caches session when cache miss', async () => {
            memoryCache.has.mockReturnValue(false);
            memoryCache.get.mockReturnValue(SESSION);
            setupStartMocks();
            fetch.mockResolvedValueOnce(okJson({ valid: true }));

            await client.checkToken();

            expect(memoryCache.set).toHaveBeenCalledWith('meta_session', SESSION);
            expect(fetch).toHaveBeenCalledTimes(5); // 4 start + 1 checkToken
        });

        it('skips start() and uses cached session on cache hit', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ valid: true }));

            await client.checkToken();

            expect(memoryCache.set).not.toHaveBeenCalled();
            expect(fetch).toHaveBeenCalledTimes(1);
        });

        it('uses meta_session from cache in Cookie header', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ valid: true }));

            await client.checkToken();

            expect(fetch.mock.calls[0][1].headers.Cookie).toBe(COMBINED);
        });
    });

    // =====================
    //  clearCache()
    // =====================
    describe('clearCache()', () => {
        it('calls memoryCache.clear()', () => {
            client.clearCache();
            expect(memoryCache.clear).toHaveBeenCalledTimes(1);
        });
    });

    // =====================
    //  checkToken()
    // =====================
    describe('checkToken()', () => {
        it('GETs /api/auth/check-token and returns json', async () => {
            withCache();
            const data = { userId: 'u1', valid: true };
            fetch.mockResolvedValueOnce(okJson(data));

            const result = await client.checkToken();

            expect(fetch).toHaveBeenCalledWith(
                `${BASE}/api/auth/check-token`,
                expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Cookie: COMBINED }) })
            );
            expect(result).toEqual(data);
        });
    });

    // =====================
    //  Upload methods
    // =====================
    describe('uploadAudio()', () => {
        it('POSTs multipart FormData to /api/upload-audio-direct', async () => {
            withCache();
            const data = { cdnUrl: 'https://cdn.example.com/audio.mp3' };
            fetch.mockResolvedValueOnce(okJson(data));

            const blob = new Blob(['audio data'], { type: 'audio/mpeg' });
            const result = await client.uploadAudio(blob, 'test.mp3');

            const [url, opts] = fetch.mock.calls[0];
            expect(url).toBe(`${BASE}/api/upload-audio-direct`);
            expect(opts.method).toBe('POST');
            expect(opts.body).toBeInstanceOf(FormData);
            expect(result).toEqual(data);
        });

        it('throws on non-OK response', async () => {
            withCache();
            fetch.mockResolvedValueOnce(errRes(400));
            await expect(client.uploadAudio(new Blob(), 'f.mp3')).rejects.toThrow('400');
        });
    });

    describe('uploadImage()', () => {
        it('POSTs base64 image JSON to /api/upload-image', async () => {
            withCache();
            const imageBase64 = 'data:image/png;base64,iVBOR==';
            fetch.mockResolvedValueOnce(okJson({ url: 'https://cdn/img.jpg' }));

            await client.uploadImage(imageBase64);

            const [url, opts] = fetch.mock.calls[0];
            expect(url).toBe(`${BASE}/api/upload-image`);
            expect(opts.method).toBe('POST');
            expect(JSON.parse(opts.body)).toEqual({ image: imageBase64 });
        });

        it('throws on non-OK response', async () => {
            withCache();
            fetch.mockResolvedValueOnce(errRes(413));
            await expect(client.uploadImage('base64data')).rejects.toThrow('413');
        });
    });

    describe('uploadMedia()', () => {
        it('POSTs multipart FormData to /api/upload-media', async () => {
            withCache();
            const data = { id: 'media-1', url: 'https://cdn/video.mp4' };
            fetch.mockResolvedValueOnce(okJson(data));

            const result = await client.uploadMedia(new Blob([Buffer.from('video data')]), 'clip.mp4');

            const [url, opts] = fetch.mock.calls[0];
            expect(url).toBe(`${BASE}/api/upload-media`);
            expect(opts.method).toBe('POST');
            expect(opts.body).toBeInstanceOf(FormData);
            expect(result).toEqual(data);
        });
    });

    describe('projectUploadMedia()', () => {
        it('uploads media then links it to the project via /api/projects/:id/upload', async () => {
            withCache();
            const mediaResult = { id: 'media-1', url: 'https://cdn/video.mp4' };
            fetch
                .mockResolvedValueOnce(okJson(mediaResult))
                .mockResolvedValueOnce(okJson({ success: true }));

            const result = await client.projectUploadMedia('proj-1', new Blob([Buffer.from('data')]), 'file.mp4');

            expect(fetch).toHaveBeenNthCalledWith(2,
                `${BASE}/api/projects/proj-1/upload`,
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ files: [mediaResult] }),
                })
            );
            expect(result).toEqual({ success: true });
        });
    });

    // =====================
    //  Generation Batches
    // =====================
    describe('generateBatches()', () => {
        it('POSTs payload to /api/generation-batches', async () => {
            withCache();
            const payload = { id: 'batch-1', type: 'videos', title: 'Test Batch' };
            const data = { id: 'batch-1', status: 'pending' };
            fetch.mockResolvedValueOnce(okJson(data));

            const result = await client.generateBatches(payload);

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/generation-batches`, expect.objectContaining({
                method: 'POST',
                body: JSON.stringify(payload),
            }));
            expect(result).toEqual(data);
        });
    });

    describe('getListGenerationBatches()', () => {
        it('GETs with default params (limit=12, offset=0)', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ batches: [] }));

            await client.getListGenerationBatches();

            expect(fetch.mock.calls[0][0]).toBe(`${BASE}/api/generation-batches?limit=12&offset=0`);
        });

        it('appends all optional query params when provided', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ batches: [] }));

            await client.getListGenerationBatches(5, 10, {
                type: 'videos',
                sort: 'newest',
                searchQuery: 'cat sunset',
                favoritesOnly: true,
                projectId: 'p-abc',
            });

            const calledUrl = fetch.mock.calls[0][0];
            expect(calledUrl).toContain('limit=5');
            expect(calledUrl).toContain('offset=10');
            expect(calledUrl).toContain('type=videos');
            expect(calledUrl).toContain('sort=newest');
            expect(calledUrl).toContain('search_query=cat%20sunset');
            expect(calledUrl).toContain('favorites_only=true');
            expect(calledUrl).toContain('project_id=p-abc');
        });

        it('omits optional params when not provided', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ batches: [] }));

            await client.getListGenerationBatches(12, 0, {});

            const calledUrl = fetch.mock.calls[0][0];
            expect(calledUrl).not.toContain('type=');
            expect(calledUrl).not.toContain('search_query=');
            expect(calledUrl).not.toContain('favorites_only');
        });
    });

    describe('getGenerationBatch()', () => {
        it('GETs /api/generation-batches/:id', async () => {
            withCache();
            const data = { id: 'b1', status: 'complete' };
            fetch.mockResolvedValueOnce(okJson(data));

            const result = await client.getGenerationBatch('b1');

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/generation-batches/b1`, expect.objectContaining({ method: 'GET' }));
            expect(result).toEqual(data);
        });
    });

    describe('updateGenerationBatch()', () => {
        it('PUTs payload to /api/generation-batches', async () => {
            withCache();
            const payload = { id: 'b1', title: 'Updated Title' };
            fetch.mockResolvedValueOnce(okJson(payload));

            const result = await client.updateGenerationBatch(payload);

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/generation-batches`, expect.objectContaining({
                method: 'PUT',
                body: JSON.stringify(payload),
            }));
            expect(result).toEqual(payload);
        });
    });

    describe('deleteGenerationBatch()', () => {
        it('DELETEs /api/generation-batches/:id', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ deleted: true }));

            const result = await client.deleteGenerationBatch('b1');

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/generation-batches/b1`, expect.objectContaining({ method: 'DELETE' }));
            expect(result).toEqual({ deleted: true });
        });
    });

    describe('getGenerationBatchStream()', () => {
        it('yields parsed JSON from SSE data events', async () => {
            withCache();
            const event1 = { status: 'processing', progress: 50 };
            const event2 = { status: 'complete', progress: 100 };
            fetch.mockResolvedValueOnce({
                ...okJson(null),
                body: sseBody([
                    `data: ${JSON.stringify(event1)}\n\n`,
                    `data: ${JSON.stringify(event2)}\n\n`,
                ]),
            });

            const results = [];
            for await (const event of client.getGenerationBatchStream('b1')) {
                results.push(event);
            }

            expect(fetch).toHaveBeenCalledWith(
                `${BASE}/api/generation-batches/b1/stream`,
                expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ accept: 'text/event-stream' }) })
            );
            expect(results).toEqual([event1, event2]);
        });

        it('skips blank SSE lines', async () => {
            withCache();
            const event = { done: true };
            fetch.mockResolvedValueOnce({
                ...okJson(null),
                body: sseBody([`\n\ndata: ${JSON.stringify(event)}\n\n`]),
            });

            const results = [];
            for await (const e of client.getGenerationBatchStream('b1')) {
                results.push(e);
            }
            expect(results).toEqual([event]);
        });

        it('throws on non-OK response', async () => {
            withCache();
            fetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden', json: jest.fn(), headers: { get: jest.fn(() => null), getSetCookie: jest.fn(() => []) }, body: null });
            const gen = client.getGenerationBatchStream('b1');
            await expect(gen.next()).rejects.toThrow('getGenerationBatchStream failed');
        });
    });

    // =====================
    //  Generate methods
    // =====================
    describe('generateVideos()', () => {
        it('POSTs payload to /api/generate/videos', async () => {
            withCache();
            const payload = { batchId: 'b1', inputs: [{ type: 'prompt', value: 'A cat' }], config: {} };
            fetch.mockResolvedValueOnce(okJson({ jobId: 'j1' }));

            await client.generateVideos(payload);

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/generate/videos`, expect.objectContaining({
                method: 'POST',
                body: JSON.stringify(payload),
            }));
        });
    });

    describe('generateImages()', () => {
        it('POSTs payload to /api/generate/images', async () => {
            withCache();
            const payload = { batchId: 'b1', inputs: [{ type: 'variation', image_prompt: 'img' }], config: {} };
            fetch.mockResolvedValueOnce(okJson({ jobId: 'j2' }));

            await client.generateImages(payload);

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/generate/images`, expect.objectContaining({
                method: 'POST',
                body: JSON.stringify(payload),
            }));
        });
    });

    describe('generatePrompts()', () => {
        it('POSTs payload to /api/generate/prompts', async () => {
            withCache();
            const payload = { prompt: 'A cat', batchId: 'b1', batchType: 'videos', config: {}, systemPrompt: 'You are helpful' };
            fetch.mockResolvedValueOnce(okJson({ prompts: ['A fluffy orange cat'] }));

            await client.generatePrompts(payload);

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/generate/prompts`, expect.objectContaining({
                method: 'POST',
                body: JSON.stringify(payload),
            }));
        });
    });

    describe('animateGenerate()', () => {
        it('POSTs payload to /api/animate/generate', async () => {
            withCache();
            const payload = {
                audioUrl: 'https://cdn/a.mp3',
                script: 'Hello world',
                engine: 'midjen',
                projectId: 'p1',
            };
            fetch.mockResolvedValueOnce(okJson({ contentItemId: 'ci1' }));

            await client.animateGenerate(payload);

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/animate/generate`, expect.objectContaining({
                method: 'POST',
                body: JSON.stringify(payload),
            }));
        });
    });

    // =====================
    //  Projects
    // =====================
    describe('getListProject()', () => {
        it('GETs /api/projects with default params', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ projects: [] }));

            await client.getListProject();

            expect(fetch).toHaveBeenCalledWith(
                `${BASE}/api/projects?limit=25&offset=0&sort=newest`,
                expect.objectContaining({ method: 'GET' })
            );
        });

        it('accepts custom limit, offset, and sort', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ projects: [] }));

            await client.getListProject(10, 20, 'oldest');

            expect(fetch.mock.calls[0][0]).toBe(`${BASE}/api/projects?limit=10&offset=20&sort=oldest`);
        });
    });

    describe('createProject()', () => {
        it('POSTs name to /api/projects and returns created project', async () => {
            withCache();
            const data = { id: 'p1', name: 'My Project' };
            fetch.mockResolvedValueOnce(okJson(data));

            const result = await client.createProject('My Project');

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/projects`, expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ name: 'My Project' }),
            }));
            expect(result).toEqual(data);
        });
    });

    // =====================
    //  Content Items
    // =====================
    describe('getContentItem()', () => {
        it('GETs /api/content-items/:id', async () => {
            withCache();
            const data = { id: 'ci1', status: 'complete' };
            fetch.mockResolvedValueOnce(okJson(data));

            const result = await client.getContentItem('ci1');

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/content-items/ci1`, expect.objectContaining({ method: 'GET' }));
            expect(result).toEqual(data);
        });
    });

    describe('retryContentItem()', () => {
        it('POSTs to /api/content-items/:id/retry', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ retried: true }));

            await client.retryContentItem('ci1');

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/content-items/ci1/retry`, expect.objectContaining({ method: 'POST' }));
        });
    });

    describe('bulkDeleteContentItems()', () => {
        it('DELETEs with contentItemIds (no projectId)', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ deleted: 2 }));

            await client.bulkDeleteContentItems(['ci1', 'ci2']);

            const [url, opts] = fetch.mock.calls[0];
            expect(url).toBe(`${BASE}/api/content-items/bulk-delete`);
            expect(opts.method).toBe('DELETE');
            const body = JSON.parse(opts.body);
            expect(body.contentItemIds).toEqual(['ci1', 'ci2']);
            expect(body.projectId).toBeUndefined();
        });

        it('includes projectId in body when provided', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ deleted: 1 }));

            await client.bulkDeleteContentItems(['ci1'], 'p1');

            const body = JSON.parse(fetch.mock.calls[0][1].body);
            expect(body.projectId).toBe('p1');
        });
    });

    describe('feedbackContentItem()', () => {
        it('POSTs feedbackKind to /api/content-items/:id/feedback', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({}));

            await client.feedbackContentItem('ci1', 'thumbs_up');

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/content-items/ci1/feedback`, expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ feedbackKind: 'thumbs_up' }),
            }));
        });
    });

    // =====================
    //  Timeline Chat Stream
    // =====================
    describe('streamTimelineChat()', () => {
        it('POSTs with text/event-stream accept header', async () => {
            withCache();
            fetch.mockResolvedValueOnce({
                ...okJson(null),
                body: sseBody([]),
            });

            // eslint-disable-next-line no-unused-vars
            for await (const _ of client.streamTimelineChat({ projectId: 'p1', message: 'Hi' })) { /* drain */ }

            expect(fetch.mock.calls[0][1].headers['accept']).toBe('text/event-stream');
        });

        it('yields parsed SSE events', async () => {
            withCache();
            const event1 = { type: 'message', content: 'Hello there' };
            const event2 = { type: 'done' };
            fetch.mockResolvedValueOnce({
                ...okJson(null),
                body: sseBody([
                    `data: ${JSON.stringify(event1)}\n\n`,
                    `data: ${JSON.stringify(event2)}\n\n`,
                ]),
            });

            const results = [];
            for await (const event of client.streamTimelineChat({ projectId: 'p1', message: 'Hi' })) {
                results.push(event);
            }
            expect(results).toEqual([event1, event2]);
        });

        it('throws on non-OK response', async () => {
            withCache();
            fetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', json: jest.fn(), headers: { get: jest.fn(() => null), getSetCookie: jest.fn(() => []) }, body: null });
            const gen = client.streamTimelineChat({ projectId: 'p1' });
            await expect(gen.next()).rejects.toThrow('streamTimelineChat failed');
        });
    });

    // =====================
    //  Studio
    // =====================
    describe('getStudioIngredients()', () => {
        it('POSTs payload to /api/studio/ingredients', async () => {
            withCache();
            const payload = { prompt: 'A sunset over mountains', style: 'cinematic' };
            fetch.mockResolvedValueOnce(okJson({ ingredients: ['golden light', 'silhouette'] }));

            await client.getStudioIngredients(payload);

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/studio/ingredients`, expect.objectContaining({
                method: 'POST',
                body: JSON.stringify(payload),
            }));
        });
    });

    describe('getStudioVoices()', () => {
        it('GETs /api/studio/voices with default limit of 5', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ voices: [] }));

            await client.getStudioVoices();

            expect(fetch.mock.calls[0][0]).toBe(`${BASE}/api/studio/voices?limit=5`);
        });

        it('accepts custom limit', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ voices: [] }));

            await client.getStudioVoices(20);

            expect(fetch.mock.calls[0][0]).toBe(`${BASE}/api/studio/voices?limit=20`);
        });
    });

    describe('ttsPlayai()', () => {
        it('POSTs to /api/studio/playai/tts with default outputFormat mp3', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ audioUrl: 'https://cdn/tts.mp3' }));

            await client.ttsPlayai('Hello world', 'voice-id-abc');

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/studio/playai/tts`, expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ text: 'Hello world', voice: 'voice-id-abc', outputFormat: 'mp3' }),
            }));
        });

        it('accepts custom outputFormat', async () => {
            withCache();
            fetch.mockResolvedValueOnce(okJson({ audioUrl: 'https://cdn/tts.wav' }));

            await client.ttsPlayai('Hello', 'voice-id-abc', 'wav');

            const body = JSON.parse(fetch.mock.calls[0][1].body);
            expect(body.outputFormat).toBe('wav');
        });
    });

    // =====================
    //  Quota
    // =====================
    describe('getQuotaUpsell()', () => {
        it('GETs /api/quota/upsell and returns data', async () => {
            withCache();
            const data = { plan: 'free', usagePercent: 80 };
            fetch.mockResolvedValueOnce(okJson(data));

            const result = await client.getQuotaUpsell();

            expect(fetch).toHaveBeenCalledWith(`${BASE}/api/quota/upsell`, expect.objectContaining({ method: 'GET' }));
            expect(result).toEqual(data);
        });
    });

    // =====================
    //  Error handling (cross-cutting)
    // =====================
    describe('Error handling', () => {
        const cases = [
            ['generateBatches',                 (c) => c.generateBatches({})],
            ['updateGenerationBatch',           (c) => c.updateGenerationBatch({})],
            ['deleteGenerationBatch',           (c) => c.deleteGenerationBatch('b1')],
            ['generateVideos',                  (c) => c.generateVideos({})],
            ['generateImages',                  (c) => c.generateImages({})],
            ['generatePrompts',                 (c) => c.generatePrompts({})],
            ['animateGenerate',                 (c) => c.animateGenerate({})],
            ['getListProject',                  (c) => c.getListProject()],
            ['createProject',                   (c) => c.createProject('x')],
            ['getContentItem',                  (c) => c.getContentItem('ci1')],
            ['retryContentItem',                (c) => c.retryContentItem('ci1')],
            ['bulkDeleteContentItems',          (c) => c.bulkDeleteContentItems(['ci1'])],
            ['feedbackContentItem',             (c) => c.feedbackContentItem('ci1', 'up')],
            ['createMusicClip',                 (c) => c.createMusicClip({})],
            ['getStudioIngredients',            (c) => c.getStudioIngredients({})],
            ['getStudioVoices',                 (c) => c.getStudioVoices()],
            ['ttsPlayai',                       (c) => c.ttsPlayai('text', 'voice')],
            ['getQuotaUpsell',                  (c) => c.getQuotaUpsell()],
        ];

        it.each(cases)('%s() throws an error containing the HTTP status on non-OK response', async (name, fn) => {
            withCache();
            fetch.mockResolvedValue(errRes(500));
            await expect(fn(client)).rejects.toThrow('500');
        });
    });
});
