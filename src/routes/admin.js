/**
 * @file routes/admin.js
 * @description Admin routes for user management (list, update, delete).
 *              Local-only — no authentication required.
 */

'use strict';

const { Router } = require('express');
const db = require('../db/store');
const UserModel = require('../db/models/User');
const SessionModel = require('../db/models/Session');
const WrongAnswerModel = require('../db/models/WrongAnswer');
const MessageThreadModel = require('../db/models/Message');

const router = Router();

// ── GET /api/admin/users — List all users ─────────────────────
router.get('/users', (req, res) => {
    const users = [];
    for (const [id, u] of db.users) {
        users.push({
            id,
            username: u.username,
            email: u.email || '',
            elo: u.elo,
            bio: u.bio || '',
            photoURL: u.photoURL || '',
            isDiamondPro: !!u.isDiamondPro,
            isBot: !!u.isBot,
            online: !!u.online,
            stats: u.stats || {},
            friends: (u.friends || []).length,
            bioCharacter: u.bioCharacter || 'default',
            createdAt: u.createdAt,
        });
    }
    // Sort: non-bots first, then by elo desc
    users.sort((a, b) => {
        if (a.isBot !== b.isBot) return a.isBot ? 1 : -1;
        return b.elo - a.elo;
    });
    res.json({ users });
});

// ── GET /api/admin/users/:id — Single user detail ─────────────
router.get('/users/:id', (req, res) => {
    const user = db.users.get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Return the full user object (minus sensitive hash)
    const { passwordHash, socketId, ...safe } = user;
    res.json({ user: safe });
});

// ── PATCH /api/admin/users/:id — Update user fields ───────────
router.patch('/users/:id', async (req, res) => {
    const user = db.users.get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const allowed = [
        'username', 'email', 'bio', 'elo', 'photoURL',
        'isDiamondPro', 'bioCharacter', 'stats',
    ];

    const updates = {};
    const oldElo = user.elo;
    for (const key of allowed) {
        if (req.body[key] !== undefined) {
            user[key] = req.body[key];
            updates[key] = req.body[key];
        }
    }

    // Track admin ELO changes in eloHistory
    if (req.body.elo !== undefined && req.body.elo !== oldElo) {
        if (!user.eloHistory) user.eloHistory = [];
        user.eloHistory.push({ elo: user.elo, timestamp: Date.now() });
        if (user.eloHistory.length > 100) user.eloHistory = user.eloHistory.slice(-100);
    }

    try {
        await UserModel.findByIdAndUpdate(user.id, {
            username: user.username,
            email: user.email || '',
            bio: user.bio || '',
            elo: user.elo,
            photoURL: user.photoURL || '',
            isDiamondPro: !!user.isDiamondPro,
            bioCharacter: user.bioCharacter || 'default',
            stats: user.stats,
            eloHistory: user.eloHistory || [],
        }, { upsert: true });
        console.log(`✅ Admin saved user ${user.username} (elo: ${user.elo})`);
        res.json({ ok: true, updates });
    } catch (err) {
        console.error('❌ Admin save failed:', err.message);
        res.status(500).json({ error: 'Failed to save: ' + err.message });
    }
});

// ── DELETE /api/admin/users/:id — Delete a user ───────────────
router.delete('/users/:id', async (req, res) => {
    const user = db.users.get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Remove from in-memory store
    db.users.delete(req.params.id);

    // Remove from MongoDB
    await UserModel.findByIdAndDelete(req.params.id).catch(() => {});

    // Clean up sessions pointing to this user
    for (const [token, userId] of db.sessions) {
        if (userId === req.params.id) {
            db.sessions.delete(token);
            SessionModel.findByIdAndDelete(token).catch(() => {});
        }
    }

    // Clean up wrong answers
    db.wrongAnswers.delete(req.params.id);
    await WrongAnswerModel.findByIdAndDelete(req.params.id).catch(() => {});

    // Remove from friends lists of other users
    for (const [, u] of db.users) {
        if (u.friends) u.friends = u.friends.filter(f => f !== req.params.id);
        if (u.friendRequests) u.friendRequests = u.friendRequests.filter(f => f !== req.params.id);
    }

    res.json({ ok: true, deleted: req.params.id });
});

module.exports = router;
