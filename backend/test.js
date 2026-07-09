const config = require('./config/env');
const VibeAI = require('./services/vibe_ai/client.js');
const { getStitchAPIKey, getListProjects, createFreshProject, deleteProject } = require('./services/google-stitch/client');

(async () => {
    // const vibeAI = VibeAI();
    // console.log(await vibeAI.checkToken());
    // console.log(await vibeAI.getListProject());
    // let projects = await getListProjects();
    // console.log(projects);

    // Standalone test: create a throwaway project then delete it,
    // to verify STITCH_COOKIE / getAt() are valid end-to-end.
    
    try {
        const ok = await deleteProject('18386391249734182091');
        console.log('Delete result:', ok);
    } catch (err) {
        console.error('Delete FAILED:', err.message);
    }
})();
