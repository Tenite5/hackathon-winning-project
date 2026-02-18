/**
 * @file routes/auth.js
 * @description Authentication routes — POST /register, POST /login, GET /me.
 */

'use strict';

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { randomUUID: uuidv4 } = require('crypto');
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');
const { sanitizeUser } = require('../services/elo');
const { validateUsername, validatePassword } = require('../middleware/validate');
const { createRateLimit } = require('../middleware/rateLimit');

const router = Router();

// Stricter rate limit on auth routes: 10 requests per minute
const authLimit = createRateLimit({ windowMs: 60000, max: 10 });
router.use(authLimit);

router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    const uv = validateUsername(username);
    if (!uv.valid) return res.status(400).json({ error: uv.error });
    const pv = validatePassword(password);
    if (!pv.valid) return res.status(400).json({ error: pv.error });

    // Check duplicate
    for (const [, u] of db.users) {
        if (u.username.toLowerCase() === uv.value.toLowerCase()) {
            return res.status(409).json({ error: 'Username already taken' });
        }
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(pv.value, 10);
    const user = {
        id,
        username: uv.value,
        passwordHash,
        elo: 1000,
        stats: { totalWins: 0, totalLosses: 0, totalAnswers: 0, correctAnswers: 0, categories: {}, gamesPlayed: 0 },
        friends: [],
        friendRequests: [],
        bio: `${uv.value} just arrived. Watch out.`,
        online: false,
        socketId: null,
        createdAt: Date.now(),
    };

    db.users.set(id, user);
    const token = uuidv4();
    db.sessions.set(token, id);
    res.json({ token, user: sanitizeUser(user) });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    let user = null;
    for (const [, u] of db.users) {
        if (u.username.toLowerCase() === username.toLowerCase()) {
            user = u;
            break;
        }
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = uuidv4();
    db.sessions.set(token, user.id);
    res.json({ token, user: sanitizeUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
    res.json({ user: sanitizeUser(req.user) });
});

module.exports = router;
