const config = require('./config/env');
const VibeAI = require('./services/vibe_ai/client.js');

(async () => {
    const vibeAI = VibeAI();
    console.log(await vibeAI.checkToken());
    console.log(await vibeAI.getListProject());
})();
