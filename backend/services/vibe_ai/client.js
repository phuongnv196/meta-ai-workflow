const memoryCache = require('../memory-cache.js');
const VIBE_AI_URL = 'https://vibes.ai';
const USER_AGENT = 'PostmanRuntime/7.51.1';

const getSetCookies = (headers) => {
    if (headers.getSetCookie) return headers.getSetCookie();
    const raw = headers.get('set-cookie');
    return raw ? raw.split(/,(?=\s*[a-zA-Z0-9_-]+=)/) : [];
};

const getCookieValue = (cookies, name) => {
    const match = cookies.find(c => c.startsWith(`${name}=`));
    return match ? match.split(';')[0].split('=').slice(1).join('=') : null;
};

const fetchManual = (url, cookie, extra = {}) =>
    fetch(url.startsWith('http') ? url : `${VIBE_AI_URL}${url}`, {
        headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie, ...extra },
        redirect: 'manual',
    });

const requireRedirect = (res, step) => {
    const location = res.headers.get('location');
    if (!location) throw new Error(`Step ${step} failed: No redirect location`);
    return location;
};

const VibeAI = () => {
    const metaCookie = process.env.META_COOKIE;

    const start = async () => {
        // Step 1: /api/meta-oidc/start → get oauth_csrf_token + redirect to auth.meta.com
        const res1 = await fetchManual(`${VIBE_AI_URL}/api/meta-oidc/start`, metaCookie);
        const cookies1 = getSetCookies(res1.headers);
        const csrfToken = getCookieValue(cookies1, 'oauth_csrf_token');
        const location1 = requireRedirect(res1, 1);

        // Step 2: auth.meta.com/oidc → redirect to auth.meta.ai/ecto
        const res2 = await fetchManual(location1, metaCookie, {
            'Referer': `${VIBE_AI_URL}/api/meta-oidc/start`,
        });
        const location2 = requireRedirect(res2, 2);

        // Step 3: auth.meta.ai/ecto → redirect to vibes.ai/api/meta-oidc/callback
        const res3 = await fetchManual(location2, metaCookie);
        const location3 = requireRedirect(res3, 3);

        // Step 4: vibes.ai/api/meta-oidc/callback → set meta_session cookie
        const callbackCookie = csrfToken
            ? `${metaCookie}; oauth_csrf_token=${csrfToken}`
            : metaCookie;
        const res4 = await fetchManual(location3, callbackCookie, {
            'Referer': location2,
        });

        const cookies4 = getSetCookies(res4.headers);
        const sessionValue = getCookieValue(cookies4, 'meta_session');
        return sessionValue;
    };

    const getCombinedCookie = async () => {
        if (!memoryCache.has('meta_session')) {
            const sessionCookie = await start();
            memoryCache.set('meta_session', sessionCookie);
        }

        const sessionValue = memoryCache.get('meta_session');
        return sessionValue ? `${metaCookie}; meta_session=${sessionValue}` : metaCookie;
    };

    const checkToken = async () => {
        const combinedCookie = await getCombinedCookie();

        var response = await fetch(`${VIBE_AI_URL}/api/auth/check-token`, {
            method: 'GET',
            headers: {
                'Cookie': combinedCookie
            }
        });
        var json = await response.json();
        return json;
    };


    
    const uploadAudio = async (audioBlob, fileName, fileType = 'audio/mpeg') => {
        const combinedCookie = await getCombinedCookie();

        const formData = new FormData();
        formData.append('audio', audioBlob, fileName);

        const response = await fetch(`${VIBE_AI_URL}/api/upload-audio-direct`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
                'Cookie': combinedCookie
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Upload failed with status: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        return json;
    };

    const generateBatches = async (payload) => {
        const combinedCookie = await getCombinedCookie();

        const response = await fetch(`${VIBE_AI_URL}/api/generation-batches`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`generateBatches failed with status: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        return json;
    };

    const getListProject = async (limit = 25, offset = 0, sort = 'newest') => {
        const combinedCookie = await getCombinedCookie();

        const response = await fetch(`${VIBE_AI_URL}/api/projects?limit=${limit}&offset=${offset}&sort=${sort}` , {
            method: 'GET',
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
                'Cookie': combinedCookie
            }
        });

        if (!response.ok) {
            throw new Error(`getListProject failed with status: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        return json;
    };


    const createProject = async (name) => {
        const combinedCookie = await getCombinedCookie();

        const response = await fetch(`${VIBE_AI_URL}/api/projects`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify({ name })
        });

        if (!response.ok) {
            throw new Error(`createProject failed with status: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        return json;
    };

    const uploadMedia = async (fileBuffer, fileName) => {
        const combinedCookie = await getCombinedCookie();

        const formData = new FormData();
        formData.append('file', fileBuffer, fileName);
        formData.append('filename', fileName);

        const response = await fetch(`${VIBE_AI_URL}/api/upload-media`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
                'Cookie': combinedCookie
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`uploadMedia failed with status: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        return json;
    };

    const associateMediaWithProject = async (projectId, uploadResult) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/projects/${projectId}/upload`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify({ files: [uploadResult] })
        });
        if (!response.ok) {
            throw new Error(`associateMediaWithProject failed: ${response.status}`);
        }
        return response.json();
    };

    const projectUploadMedia = async (projectId, fileBuffer, fileName) => {
        const combinedCookie = await getCombinedCookie();

        const result = await uploadMedia(fileBuffer, fileName);

        const response = await fetch(`${VIBE_AI_URL}/api/projects/${projectId}/upload`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify({ files: [result] })
        });

        if (!response.ok) {
            throw new Error(`projectUploadMedia failed with status: ${response.status} ${response.statusText}`);
        }

        // Return the original uploadMedia result so we have the mediaEntId
        return result;
    };

    const generateVideos = async (payload) => {
        const combinedCookie = await getCombinedCookie();

        const response = await fetch(`${VIBE_AI_URL}/api/generate/videos`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`generateVideos failed with status: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        return json;
    };

    const getListGenerationBatches = async (limit = 12, offset = 0, options = {}) => {
        const combinedCookie = await getCombinedCookie();
        const { type, searchQuery, favoritesOnly, projectId, sort } = options;
        let query = `/api/generation-batches?limit=${limit}&offset=${offset}`;
        if (type) query += `&type=${encodeURIComponent(type)}`;
        if (sort) query += `&sort=${encodeURIComponent(sort)}`;
        if (searchQuery) query += `&search_query=${encodeURIComponent(searchQuery)}`;
        if (favoritesOnly) query += `&favorites_only=true`;
        if (projectId) query += `&project_id=${encodeURIComponent(projectId)}`;
        const response = await fetch(`${VIBE_AI_URL}${query}`, {
            method: 'GET',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            }
        });
        if (!response.ok) {
            throw new Error(`getListGenerationBatches failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const getGenerationBatch = async (batchId) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/generation-batches/${batchId}`, {
            method: 'GET',
            headers: { 'accept': '*/*', 'Cookie': combinedCookie }
        });
        if (!response.ok) {
            throw new Error(`getGenerationBatch failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const updateGenerationBatch = async (payload) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/generation-batches`, {
            method: 'PUT',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`updateGenerationBatch failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const deleteGenerationBatch = async (batchId) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/generation-batches/${batchId}`, {
            method: 'DELETE',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            }
        });
        if (!response.ok) {
            throw new Error(`deleteGenerationBatch failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const generateImages = async (payload) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/generate/images`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`generateImages failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const generateImageEdit = async (payload) => {
        const combinedCookie = await getCombinedCookie();
        const projectId = payload.projectId;
        const referer = projectId ? `${VIBE_AI_URL}/projects/${projectId}/` : `${VIBE_AI_URL}/`;
        
        const response = await fetch(`${VIBE_AI_URL}/api/generate/image-edit`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            let errorText = '';
            try { errorText = await response.text(); } catch(e) {}
            throw new Error(`generateImageEdit failed with status: ${response.status} ${response.statusText} - ${errorText}`);
        }
        return response.json();
    };

    const generatePrompts = async (payload) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/generate/prompts`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            let errorText = '';
            try { errorText = await response.text(); } catch(e) {}
            throw new Error(`generatePrompts failed with status: ${response.status} ${response.statusText} - ${errorText}`);
        }
        return response.json();
    };

    const animateGenerate = async (payload) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/animate/generate`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`animateGenerate failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const uploadImage = async (imageBase64) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/upload-image`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify({ image: imageBase64 })
        });
        if (!response.ok) {
            throw new Error(`uploadImage failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const getQuotaUpsell = async () => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/quota/upsell`, {
            method: 'GET',
            headers: { 'accept': '*/*', 'Cookie': combinedCookie }
        });
        if (!response.ok) {
            throw new Error(`getQuotaUpsell failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const getContentItem = async (itemId) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/content-items/${itemId}`, {
            method: 'GET',
            headers: { 'accept': '*/*', 'Cookie': combinedCookie }
        });
        if (!response.ok) {
            throw new Error(`getContentItem failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const retryContentItem = async (itemId) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/content-items/${itemId}/retry`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            }
        });
        if (!response.ok) {
            throw new Error(`retryContentItem failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const bulkDeleteContentItems = async (contentItemIds, projectId = null) => {
        const combinedCookie = await getCombinedCookie();
        const body = { contentItemIds, ...(projectId ? { projectId } : {}) };
        const response = await fetch(`${VIBE_AI_URL}/api/content-items/bulk-delete`, {
            method: 'DELETE',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            throw new Error(`bulkDeleteContentItems failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const feedbackContentItem = async (itemId, feedbackKind) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/content-items/${itemId}/feedback`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify({ feedbackKind })
        });
        if (!response.ok) {
            throw new Error(`feedbackContentItem failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const createMusicClip = async (payload) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/media/music/clip`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`createMusicClip failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const streamTimelineChat = async function* (payload) {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/timeline/chat/stream`, {
            method: 'POST',
            headers: {
                'accept': 'text/event-stream',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`streamTimelineChat failed with status: ${response.status} ${response.statusText}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop();
                for (const part of parts) {
                    if (part.trim() === '') continue;
                    const dataPrefix = 'data: ';
                    if (part.startsWith(dataPrefix)) {
                        const jsonStr = part.slice(dataPrefix.length);
                        try { yield JSON.parse(jsonStr); } catch (e) { console.error('Failed to parse SSE JSON:', jsonStr); }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    };

    const getStudioIngredients = async (payload) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/studio/ingredients`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`getStudioIngredients failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const getStudioVoices = async (limit = 5) => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/studio/voices?limit=${limit}`, {
            method: 'GET',
            headers: { 'accept': '*/*', 'Cookie': combinedCookie }
        });
        if (!response.ok) {
            throw new Error(`getStudioVoices failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const ttsPlayai = async (text, voice, outputFormat = 'mp3') => {
        const combinedCookie = await getCombinedCookie();
        const response = await fetch(`${VIBE_AI_URL}/api/studio/playai/tts`, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Cookie': combinedCookie
            },
            body: JSON.stringify({ text, voice, outputFormat })
        });
        if (!response.ok) {
            throw new Error(`ttsPlayai failed with status: ${response.status} ${response.statusText}`);
        }
        return response.json();
    };

    const clearCache = () => memoryCache.clear();

    const getGenerationBatchStream = async function* (batchId) {
        const combinedCookie = await getCombinedCookie();

        const response = await fetch(`${VIBE_AI_URL}/api/generation-batches/${batchId}/stream`, {
            method: 'GET',
            headers: {
                'accept': 'text/event-stream',
                'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
                'Cookie': combinedCookie
            }
        });

        if (!response.ok) {
            throw new Error(`getGenerationBatchStream failed with status: ${response.status} ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                
                // Split by double newline (SSE event boundary)
                const parts = buffer.split('\n\n');
                buffer = parts.pop(); // Keep the incomplete part in the buffer
                
                for (const part of parts) {
                    if (part.trim() === '') continue;
                    
                    // Parse 'data: {...}'
                    const dataPrefix = 'data: ';
                    if (part.startsWith(dataPrefix)) {
                        const jsonStr = part.slice(dataPrefix.length);
                        try {
                            const parsedData = JSON.parse(jsonStr);
                            yield parsedData;
                        } catch (e) {
                            console.error('Failed to parse SSE JSON:', jsonStr);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    };

    return {
        start,
        checkToken,
        clearCache,
        uploadAudio,
        uploadImage,
        uploadMedia,
        associateMediaWithProject,
        projectUploadMedia,
        generateBatches,
        getListGenerationBatches,
        getGenerationBatch,
        updateGenerationBatch,
        deleteGenerationBatch,
        getGenerationBatchStream,
        generateVideos,
        generateImages,
        generateImageEdit,
        generatePrompts,
        animateGenerate,
        getListProject,
        createProject,
        getContentItem,
        retryContentItem,
        bulkDeleteContentItems,
        feedbackContentItem,
        createMusicClip,
        streamTimelineChat,
        getStudioIngredients,
        getStudioVoices,
        ttsPlayai,
        getQuotaUpsell,
    };
};

module.exports = VibeAI;
