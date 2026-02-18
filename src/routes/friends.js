/**
 * @file routes/friends.js
 * @description Friend request, accept, decline, and list routes.
 */

'use strict';

const { Router } = require('express');
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');
const { sanitizeUser } = require('../services/elo');
const { sanitizeText } = require('../middleware/validate');

const router = Router();

router.post('/friends/request', requireAuth, (req, res) => {
    const user = req.user;
    const { username } = req.body;
    const cleanUsername = sanitizeText(username, 20);
    if (!cleanUsername) return res.status(400).json({ error: 'Username required' });

    let target = null;
    for (const [, u] of db.users) {
        if (u.username.toLowerCase() === cleanUsername.toLowerCase()) {
            target = u;
            break;
        }
    }
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === user.id) return res.status(400).json({ error: 'Cannot add yourself' });
    if (user.friends.includes(target.id)) return res.status(400).json({ error: 'Already friends' });
    if (target.friendRequests.includes(user.id)) return res.status(400).json({ error: 'Request already sent' });

    target.friendRequests.push(user.id);
    // io notification is handled via the socket layer — we attach io to app in src/app.js
    const io = req.app.get('io');
    if (io && target.socketId) {
        io.to(target.socketId).emit('friend-request', { from: sanitizeUser(user) });
    }
    res.json({ success: true });
});

router.post('/friends/accept', requireAuth, (req, res) => {
    const user = req.user;
    const { userId } = req.body;
    const idx = user.friendRequests.indexOf(userId);
    if (idx === -1) return res.status(400).json({ error: 'No request from this user' });

    user.friendRequests.splice(idx, 1);
    user.friends.push(userId);
    const other = db.users.get(userId);
    if (other) {
        other.friends.push(user.id);
        const io = req.app.get('io');
        if (io && other.socketId) {
            io.to(other.socketId).emit('friend-accepted', { user: sanitizeUser(user) });
        }
    }
    res.json({ success: true });
});

router.post('/friends/decline', requireAuth, (req, res) => {
    const user = req.user;
    const { userId } = req.body;
    const idx = user.friendRequests.indexOf(userId);
    if (idx === -1) return res.status(400).json({ error: 'No request from this user' });
    user.friendRequests.splice(idx, 1);
    res.json({ success: true });
});

router.get('/friends', requireAuth, (req, res) => {
    const user = req.user;
    const friends = user.friends.map(fId => {
        const f = db.users.get(fId);
        return f ? sanitizeUser(f) : null;
    }).filter(Boolean);

    const requests = user.friendRequests.map(fId => {
        const f = db.users.get(fId);
        return f ? sanitizeUser(f) : null;
    }).filter(Boolean);

    res.json({ friends, requests });
});

module.exports = router;
