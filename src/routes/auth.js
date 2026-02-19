/**
 * @file routes/auth.js
 * @description Authentication routes — POST /google-auth, GET /me.
 */

'use strict';

const { Router } = require('express');
const { randomUUID: uuidv4 } = require('crypto');
const admin = require('firebase-admin');
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');
const { sanitizeUser } = require('../services/elo');
const { createRateLimit } = require('../middleware/rateLimit');

// Initialize Firebase Admin (only needs projectId to verify ID tokens)
if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'quizrankedio' });
}

const router = Router();

// Stricter rate limit on auth routes: 10 requests per minute
const authLimit = createRateLimit({ windowMs: 60000, max: 10 });
router.use(authLimit);

/**
 * POST /google-auth
 * Accepts { idToken } from Firebase client SDK.
 * Verifies it, finds or creates the user, returns a session token.
 */
router.post('/google-auth', async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Missing idToken' });

    try {
        // Verify the Firebase ID token
        const decoded = await admin.auth().verifyIdToken(idToken);
        const { uid, email, name, picture } = decoded;

        // Check if user already exists (by googleId)
        let existingUser = null;
        for (const [, u] of db.users) {
            if (u.googleId === uid) {
                existingUser = u;
                break;
            }
        }

        if (existingUser) {
            // Update photo in case it changed
            existingUser.photoURL = picture || existingUser.photoURL;
            db.saveUser(existingUser.id);

            const token = uuidv4();
            db.sessions.set(token, existingUser.id);
            db.saveSession(token, existingUser.id);
            return res.json({ token, user: sanitizeUser(existingUser) });
        }

        // New user — create account
        // Generate a unique username from the Google display name
        let baseUsername = (name || email.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16);
        if (!baseUsername) baseUsername = 'Player';
        let username = baseUsername;
        let suffix = 1;
        // Ensure uniqueness
        while (true) {
            let taken = false;
            for (const [, u] of db.users) {
                if (u.username.toLowerCase() === username.toLowerCase()) {
                    taken = true;
                    break;
                }
            }
            if (!taken) break;
            username = baseUsername + suffix;
            suffix++;
        }

        const id = uuidv4();
        const user = {
            id,
            username,
            passwordHash: '',
            googleId: uid,
            email: email || '',
            photoURL: picture || '',
            elo: 1000,
            stats: { totalWins: 0, totalLosses: 0, totalAnswers: 0, correctAnswers: 0, categories: {}, gamesPlayed: 0 },
            friends: [],
            friendRequests: [],
            bio: `${username} just arrived. Watch out.`,
            online: false,
            socketId: null,
            createdAt: Date.now(),
        };

        db.users.set(id, user);
        db.saveUser(id);
        const token = uuidv4();
        db.sessions.set(token, id);
        db.saveSession(token, id);
        res.json({ token, user: sanitizeUser(user) });
    } catch (err) {
        console.error('Google auth error:', err.message);
        res.status(401).json({ error: 'Invalid Google token' });
    }
});

router.get('/me', requireAuth, (req, res) => {
    res.json({ user: sanitizeUser(req.user) });
});

module.exports = router;
