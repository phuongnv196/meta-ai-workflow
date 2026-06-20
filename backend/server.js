const config = require('./config/env');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { log } = require('./utils/logger');
const { errorHandler } = require('./middleware/error-handler');

const uploadRoutes = require('./routes/upload.routes');
const executeRoutes = require('./routes/execute.routes');
const workflowRoutes = require('./routes/workflow-management.routes');
const customNodeRoutes = require('./routes/custom-node.routes');
const settingsRoutes = require('./routes/settings.routes');

const app = express();

// Security & parsing middleware
app.use(cors({ origin: config.allowedOrigins }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/temp', express.static(path.join(__dirname, 'temp')));
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
    log(`${req.method} ${req.path}`);
    next();
});

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// Routes
app.use('/upload', uploadRoutes);
app.use('/execute', executeRoutes);
app.use('/workflows', workflowRoutes);
app.use('/custom-nodes', customNodeRoutes);
app.use('/settings', settingsRoutes);

// Catch-all cho SPA (React Router) - Dùng Regex vì Express v5 không hỗ trợ chuỗi '*'
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
    log(`Backend server running at ${config.baseUrl}`);
});

// Graceful shutdown
function shutdown(signal) {
    log(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
        log('HTTP server closed.');
        process.exit(0);
    });
    setTimeout(() => {
        log('Forcing shutdown after timeout.');
        process.exit(1);
    }, 10000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));