const config = require('./config/env');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { log } = require('./utils/logger');
const { errorHandler } = require('./middleware/error-handler');

const uploadRoutes = require('./routes/upload.routes');
const executeRoutes = require('./routes/execute.routes');

const app = express();

// Security & parsing middleware
app.use(cors({ origin: config.allowedOrigins }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/temp', express.static(path.join(__dirname, 'temp')));

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