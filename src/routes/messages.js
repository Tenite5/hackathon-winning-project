/**
 * @file routes/messages.js
 * @description Direct messaging routes — GET and POST messages with friends.
 */

'use strict';

const { Router } = require('express');
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');
const { sanitizeText } = require('../middleware/validate');

const router = Router();

router.get('/messages/:friendId', requireAuth, (req, res) => {
    const user = req.user;
    const friendId = req.params.friendId;

    // Validate friendship
    if (!user.friends.includes(friendId)) {
        return res.status(403).json({ error: 'You can only message friends' });
    }

    const key1 = `${user.id}_${friendId}`;
    const key2 = `${friendId}_${user.id}`;
    const msgs = db.messages.get(key1) || db.messages.get(key2) || [];
    res.json({ messages: msgs });
});

router.post('/messages/:friendId', requireAuth, (req, res) => {
    const user = req.user;
    const { text } = req.body;
    const cleanText = sanitizeText(text, 500);
    if (!cleanText) return res.status(400).json({ error: 'Message required' });

    const friendId = req.params.friendId;

    // Validate friendship
    if (!user.friends.includes(friendId)) {
        return res.status(403).json({ error: 'You can only message friends' });
    }

    const key1 = `${user.id}_${friendId}`;
    const key2 = `${friendId}_${user.id}`;
    let key = key1;
    if (db.messages.has(key2)) key = key2;
    if (!db.messages.has(key)) db.messages.set(key, []);

    const msg = { from: user.id, fromUsername: user.username, to: friendId, text: cleanText, ts: Date.now() };
    db.messages.get(key).push(msg);
    db.saveMessages(key);

    // Notify friend
    const friend = db.users.get(friendId);
    const io = req.app.get('io');
    if (io && friend && friend.socketId) {
        io.to(friend.socketId).emit('dm', msg);
    }
    res.json({ message: msg });
});

module.exports = router;
