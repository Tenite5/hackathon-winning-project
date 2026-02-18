/**
 * @file routes/profile.js
 * @description Profile and leaderboard routes.
 */

'use strict';

const { Router } = require('express');
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');
const { sanitizeUser } = require('../services/elo');
const { generateBio } = require('../services/ai');

const router = Router();

router.get('/leaderboard', (req, res) => {
    const users = Array.from(db.users.values())
        .map(u => sanitizeUser(u))
        .sort((a, b) => b.elo - a.elo)
        .slice(0, 50);
    res.json({ leaderboard: users });
});

router.get('/profile/:userId', (req, res) => {
    const user = db.users.get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: sanitizeUser(user) });
});

router.get('/profile-by-name/:username', (req, res) => {
    let user = null;
    for (const [, u] of db.users) {
        if (u.username.toLowerCase() === req.params.username.toLowerCase()) {
            user = u;
            break;
        }
    }
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: sanitizeUser(user) });
});

router.post('/profile/regenerate-bio', requireAuth, async (req, res) => {
    const bio = await generateBio(req.user);
    req.user.bio = bio;
    db.saveUser(req.user.id);
    res.json({ bio });
});

module.exports = router;
