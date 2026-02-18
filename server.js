/**
 * @file server.js
 * @description Thin entry point — loads env, connects to MongoDB, imports app, starts listening.
 */

'use strict';

require('dotenv').config();

const db = require('./src/db/store');
const { server } = require('./src/app');

const PORT = process.env.PORT || 3000;

(async () => {
    try {
        await db.init();
        server.listen(PORT, () => {
            console.log(`QVIZIO server running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
})();
