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
const { BIO_CHARACTERS } = require('../config');
const { checkDailyLimit, incrementDailyLimit } = require('../middleware/dailyLimits');

const router = Router();

router.get('/leaderboard', (req, res) => {
    const users = Array.from(db.users.values())
        .map(u => sanitizeUser(u))
        .sort((a, b) => b.elo - a.elo)
        .slice(0, 50);
    res.json({ leaderboard: users });
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
    const rl = checkDailyLimit(req.user.id, req.user.isDiamondPro, 'bio');
    if (rl.limited) {
        return res.status(429).json({
            error: 'bio_limit',
            message: req.user.isDiamondPro
                ? `You've used all 50 daily bio generations. Resets tomorrow.`
                : `Free accounts get 2 bio generations per day (${rl.remaining} remaining). Upgrade to Diamond Pro for 50.`,
        });
    }
    const character = req.user.isDiamondPro ? (req.user.bioCharacter || 'default') : 'default';
    const bio = await generateBio(req.user, character);
    req.user.bio = bio;
    incrementDailyLimit(req.user.id, 'bio');
    db.saveUser(req.user.id);
    res.json({ bio });
});

/**
 * POST /profile/update-settings
 * Update display name and/or avatar.
 * Body: { username?, photoURL? }
 */
router.post('/profile/update-settings', requireAuth, (req, res) => {
    const { username, photoURL } = req.body;

    // Validate & update username if provided
    if (username !== undefined) {
        if (typeof username !== 'string') {
            return res.status(400).json({ error: 'Invalid username' });
        }
        const clean = username.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
        if (clean.length < 2) {
            return res.status(400).json({ error: 'Username must be at least 2 characters (letters, numbers, _)' });
        }
        // Check uniqueness
        for (const [, u] of db.users) {
            if (u.id !== req.user.id && u.username.toLowerCase() === clean.toLowerCase()) {
                return res.status(409).json({ error: 'Username already taken' });
            }
        }
        req.user.username = clean;
    }

    // Update bio character (Diamond Pro only)
    if (req.body.bioCharacter !== undefined && req.user.isDiamondPro) {
        const validIds = BIO_CHARACTERS.map(c => c.id);
        if (validIds.includes(req.body.bioCharacter)) {
            req.user.bioCharacter = req.body.bioCharacter;
        }
    }

    // Update avatar
    if (photoURL !== undefined) {
        if (photoURL === '' || photoURL === null) {
            req.user.photoURL = '';
        } else if (typeof photoURL === 'string' && (photoURL.startsWith('http') || photoURL.startsWith('data:image/'))) {
            req.user.photoURL = photoURL;
        }
    }

    db.saveUser(req.user.id);
    res.json({ user: sanitizeUser(req.user) });
});

/**
 * GET /profile/match-history
 * Returns the authenticated user's match history.
 */
router.get('/profile/match-history', requireAuth, (req, res) => {
    res.json({ matches: req.user.matchHistory || [] });
});

/**
 * GET /profile/elo-history
 * Returns the authenticated user's ELO history for charting.
 */
router.get('/profile/elo-history', requireAuth, (req, res) => {
    res.json({ history: req.user.eloHistory || [] });
});

/**
 * GET /profile/notifications
 * Returns the user's notifications.
 */
router.get('/profile/notifications', requireAuth, (req, res) => {
    res.json({ notifications: req.user.notifications || [] });
});

/**
 * POST /profile/notifications/read
 * Mark all notifications as read.
 */
router.post('/profile/notifications/read', requireAuth, (req, res) => {
    if (req.user.notifications) {
        req.user.notifications.forEach(n => n.read = true);
        db.saveUser(req.user.id);
    }
    res.json({ ok: true });
});

/**
 * DELETE /profile/notifications/:index
 * Remove a notification by index.
 */
router.delete('/profile/notifications/:index', requireAuth, (req, res) => {
    const idx = parseInt(req.params.index);
    if (req.user.notifications && idx >= 0 && idx < req.user.notifications.length) {
        req.user.notifications.splice(idx, 1);
        db.saveUser(req.user.id);
    }
    res.json({ ok: true });
});

// ⚠️ IMPORTANT: This wildcard route MUST come AFTER all specific /profile/* routes
// otherwise Express will match "match-history", "elo-history", "notifications" as a :userId
router.get('/profile/:userId', (req, res) => {
    const user = db.users.get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: sanitizeUser(user) });
});

module.exports = router;
