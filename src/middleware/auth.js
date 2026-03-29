/**
 * @file middleware/auth.js
 * @description Authentication helpers — session lookup, Express middleware, socket auth.
 */

'use strict';

const db = require('../db/store');
const { sanitizeUser } = require('../services/elo');

/** Look up a user by their session token. Returns the raw user object or null. */
function getUserBySession(token) {
    const userId = db.sessions.get(token);
    if (!userId) return null;
    return db.users.get(userId) || null;
}

/** Express middleware — requires a valid Bearer token. Attaches req.user (raw). */
function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserBySession(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
}

/** Authenticate a socket connection. Returns the user object or null. */
function socketAuth(token) {
    return getUserBySession(token);
}

/** Express middleware — attaches req.user if valid token present, but does NOT 401. */
function optionalAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
        const user = getUserBySession(token);
        if (user) req.user = user;
    }
    next();
}

module.exports = { getUserBySession, requireAuth, optionalAuth, socketAuth, sanitizeUser };
