/**
 * @file server.js
 * @description Thin entry point — loads env, connects to MongoDB, imports app, starts listening.
 */

'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const db = require('./src/db/store');
const { server } = require('./src/app');

const PORT = process.env.PORT || 3000;

(async () => {
    try {
        await db.init();
        server.listen(PORT, () => {
            console.log(`QUIZIO server running on http://localhost:${PORT}`);
        });

        // Warm up pre-generated question pools in the background (non-blocking)
        const { warmUpPools } = require('./src/services/questionPool');
        warmUpPools();

        // Initialize bot-hosted lobbies (waits for pools to warm up)
        const { initBotLobbies } = require('./src/services/botLobbies');
        const { app } = require('./src/app');
        initBotLobbies(app.get('io'));
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
})();

// Graceful shutdown — flush pending DB connections before exit
function shutdown(signal) {
    console.log(`${signal} received — shutting down gracefully`);
    server.close(() => {
        mongoose.connection.close()
            .then(() => { console.log('MongoDB connection closed'); process.exit(0); })
            .catch(() => process.exit(0));
    });
    // Force exit after 10s if something hangs
    setTimeout(() => { console.error('Forced shutdown after timeout'); process.exit(1); }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
