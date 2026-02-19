/**
 * @file routes/auth.js
 * @description Authentication routes — Firebase auth (Google + Email), profile setup, /me.
 */

'use strict';

const { Router } = require('express');
const { randomUUID: uuidv4 } = require('crypto');
const admin = require('firebase-admin');
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');
const { sanitizeUser } = require('../services/elo');
const { createRateLimit } = require('../middleware/rateLimit');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'quizrankedio' });
}

const router = Router();

const authLimit = createRateLimit({ windowMs: 60000, max: 10 });

// ── Serve Firebase client config (no secrets leaked — these are all public keys) ──
// This endpoint is NOT rate limited — it's public config fetched on every page load.
router.get('/firebase-config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID,
    });
});

// ── Helper: find user by Firebase UID ──
function findUserByFirebaseUid(uid) {
    for (const [, u] of db.users) {
        if (u.googleId === uid || u.firebaseUid === uid) return u;
    }
    return null;
}

// ── Helper: create a new QVIZIO user from Firebase decoded token ──
function createNewUser({ uid, email, picture }) {
    const id = uuidv4();
    // Temporary username — will be overwritten during profile setup
    const tempUsername = 'Player_' + id.slice(0, 8);
    const user = {
        id,
        username: tempUsername,
        passwordHash: '',
        googleId: '',
        firebaseUid: uid,
        email: email || '',
        photoURL: picture || '',
        needsSetup: true, // flag: user must choose a display name
        elo: 1000,
        stats: { totalWins: 0, totalLosses: 0, totalAnswers: 0, correctAnswers: 0, categories: {}, gamesPlayed: 0 },
        friends: [],
        friendRequests: [],
        bio: '',
        online: false,
        socketId: null,
        createdAt: Date.now(),
    };
    db.users.set(id, user);
    db.saveUser(id);
    return user;
}

/**
 * POST /firebase-auth
 * Unified Firebase auth — works for both Google and Email/Password sign-in.
 * Accepts { idToken } from the Firebase client SDK.
 */
router.post('/firebase-auth', authLimit, async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Missing idToken' });

    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        const { uid, email, name, picture } = decoded;

        let user = findUserByFirebaseUid(uid);
        let isNew = false;

        if (user) {
            // Returning user — update photo if changed
            if (picture) user.photoURL = picture;
            db.saveUser(user.id);
        } else {
            // Brand new user
            user = createNewUser({ uid, email, picture });
            // If Google sign-in, also store googleId
            if (decoded.firebase?.sign_in_provider === 'google.com') {
                user.googleId = uid;
                db.saveUser(user.id);
            }
            isNew = true;
        }

        const token = uuidv4();
        db.sessions.set(token, user.id);
        db.saveSession(token, user.id);
        res.json({ token, user: sanitizeUser(user), isNew, needsSetup: !!user.needsSetup });
    } catch (err) {
        console.error('Firebase auth error:', err.message);
        res.status(401).json({ error: 'Invalid Firebase token' });
    }
});

/**
 * POST /complete-profile
 * Called after first sign-up to set the user's chosen display name and optional avatar.
 * Body: { username, photoURL? }
 */
router.post('/complete-profile', authLimit, requireAuth, (req, res) => {
    const { username, photoURL } = req.body;

    // Validate username
    if (!username || typeof username !== 'string') {
        return res.status(400).json({ error: 'Username is required' });
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
    if (photoURL && typeof photoURL === 'string') {
        // Accept both URLs and base64 data URIs
        if (photoURL.startsWith('http') || photoURL.startsWith('data:image/')) {
            req.user.photoURL = photoURL;
        }
    }
    req.user.bio = `${clean} just arrived. Watch out.`;
    req.user.needsSetup = false;
    db.saveUser(req.user.id);

    res.json({ user: sanitizeUser(req.user) });
});

router.get('/me', requireAuth, (req, res) => {
    res.json({ user: sanitizeUser(req.user), needsSetup: !!req.user.needsSetup });
});

module.exports = router;
