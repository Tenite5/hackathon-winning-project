/**
 * @file src/app.js
 * @description Express app + Socket.io setup. Mounts all routes and initializes sockets.
 */

'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createRateLimit } = require('./middleware/rateLimit');
const setupSockets = require('./sockets/index');

// Routes
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const friendsRoutes = require('./routes/friends');
const messagesRoutes = require('./routes/messages');
const lobbiesRoutes = require('./routes/lobbies');
const tournamentsRoutes = require('./routes/tournaments');
const questionsRoutes = require('./routes/questions');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:3000' },
});

// Make io accessible from route handlers via req.app.get('io')
app.set('io', io);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// General API rate limit: 30 requests per minute
const apiLimit = createRateLimit({ windowMs: 60000, max: 30 });

// Mount routes
app.use('/api', apiLimit, authRoutes);
app.use('/api', apiLimit, profileRoutes);
app.use('/api', apiLimit, friendsRoutes);
app.use('/api', apiLimit, messagesRoutes);
app.use('/api', apiLimit, lobbiesRoutes);
app.use('/api', apiLimit, tournamentsRoutes);
app.use('/api', apiLimit, questionsRoutes);

// SPA catch-all
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize sockets
setupSockets(io);

module.exports = { app, server };
