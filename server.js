/**
 * @file server.js
 * @description Thin entry point — loads env, imports app, starts listening.
 */

'use strict';

require('dotenv').config();

const { server } = require('./src/app');

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`QVIZIO server running on http://localhost:${PORT}`);
});
