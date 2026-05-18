const { executeWorkflow } = require('../services/workflow/workflow.service');
const { log } = require('../utils/logger');

const executeController = async (req, res) => {
    const { nodes, edges, targetNodeId } = req.body;

    // Setup SSE headers for real-time streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
        await executeWorkflow({ nodes, edges, targetNodeId }, sendEvent);
        res.end();
    } catch (error) {
        log(`CRITICAL ERROR during execution: ${error.message}`);
        sendEvent('workflow_failed', { error: error.message });
        res.end();
    }
};

module.exports = { executeController };
