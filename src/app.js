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
const pdfRoutes = require('./routes/pdf');
const subscriptionRoutes = require('./routes/subscription');
const shopRoutes = require('./routes/shop');

const helmet = require('helmet');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:3000' },
});

// Make io accessible from route handlers via req.app.get('io')
app.set('io', io);

// Trust reverse proxy (nginx/Cloudflare) so req.ip and x-forwarded-for are correct
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,       // Disable CSP for now (Firebase SDK uses inline scripts)
    crossOriginEmbedderPolicy: false,   // Allow loading Firebase/Google resources
    crossOriginOpenerPolicy: false,     // Allow popups to communicate back to the main window (Fixes Firebase Google Login in Chrome/Opera)
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// General API rate limit: high ceiling — no practical limit for normal usage
const apiLimit = createRateLimit({ windowMs: 60000, max: 2000 });

// Mount routes
app.use('/api', apiLimit, authRoutes);
app.use('/api', apiLimit, profileRoutes);
app.use('/api', apiLimit, friendsRoutes);
app.use('/api', apiLimit, messagesRoutes);
app.use('/api', apiLimit, lobbiesRoutes);
app.use('/api', apiLimit, tournamentsRoutes);
app.use('/api', apiLimit, questionsRoutes);
app.use('/api', apiLimit, pdfRoutes);
app.use('/api', apiLimit, shopRoutes);
app.use('/api/subscription', subscriptionRoutes);
// Admin panel (local-only, enabled via ADMIN_ENABLED env var)
if (process.env.ADMIN_ENABLED === 'true') {
    const adminRoutes = require('./routes/admin');
    app.use('/api/admin', adminRoutes);
    app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
    console.log('🔧 Admin panel enabled at /admin');
}

// SPA catch-all
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize sockets
setupSockets(io);

module.exports = { app, server };
