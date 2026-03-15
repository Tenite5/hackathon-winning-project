/**
 * @file middleware/rateLimit.js
 * @description Simple in-memory sliding-window rate limiter for Express routes and socket events.
 */

'use strict';

/**
 * Create an Express rate-limiting middleware.
 * @param {{ windowMs: number, max: number }} opts — window in ms, max requests per window.
 */
function createRateLimit({ windowMs = 60000, max = 30 } = {}) {
    const hits = new Map(); // key -> [timestamps]

    // Periodic cleanup every windowMs
    setInterval(() => {
        const cutoff = Date.now() - windowMs;
        for (const [key, timestamps] of hits) {
            const filtered = timestamps.filter(t => t > cutoff);
            if (filtered.length === 0) hits.delete(key);
            else hits.set(key, filtered);
        }
    }, windowMs);

    return (req, res, next) => {
        const key = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
        const now = Date.now();
        const cutoff = now - windowMs;
        const timestamps = (hits.get(key) || []).filter(t => t > cutoff);
        timestamps.push(now);
        hits.set(key, timestamps);

        if (timestamps.length > max) {
            const retryAfter = Math.ceil(windowMs / 1000);
            res.set('Retry-After', String(retryAfter));
            return res.status(429).json({ error: 'Hold on — too many requests. Try again in a few seconds.' });
        }
        next();
    };
}

/**
 * Create a per-socket event rate limiter.
 * Returns a function `isRateLimited(socketId)` that returns true if the socket should be throttled.
 * @param {{ windowMs: number, max: number }} opts
 */
function createSocketRateLimit({ windowMs = 10000, max = 30 } = {}) {
    const hits = new Map(); // socketId -> [timestamps]

    setInterval(() => {
        const cutoff = Date.now() - windowMs;
        for (const [key, timestamps] of hits) {
            const filtered = timestamps.filter(t => t > cutoff);
            if (filtered.length === 0) hits.delete(key);
            else hits.set(key, filtered);
        }
    }, windowMs);

    return function isRateLimited(socketId) {
        const now = Date.now();
        const cutoff = now - windowMs;
        const timestamps = (hits.get(socketId) || []).filter(t => t > cutoff);
        timestamps.push(now);
        hits.set(socketId, timestamps);
        return timestamps.length > max;
    };
}

/**
 * Singleton AI rate limiter.
 * Per-user: 5 question-generation requests per 2 minutes.
 * Global:   40 requests per 4 minutes (guards against account farming).
 */
const USER_AI_WINDOW = 2 * 60 * 1000;  // 2 minutes
const USER_AI_MAX    = 5;
const GLOBAL_AI_WINDOW = 4 * 60 * 1000; // 4 minutes
const GLOBAL_AI_MAX    = 40;

const _userAIHits   = new Map(); // userId -> [timestamps]
let   _globalAIHits = [];        // [timestamps]

/**
 * Check and record an AI generation request.
 * @param {string} userId
 * @returns {{ limited: boolean, reason?: 'user'|'global' }}
 */
function checkAIRateLimit(userId) {
    const now = Date.now();

    // Global check
    _globalAIHits = _globalAIHits.filter(t => t > now - GLOBAL_AI_WINDOW);
    if (_globalAIHits.length >= GLOBAL_AI_MAX) {
        return { limited: true, reason: 'global' };
    }

    // Per-user check
    const userHits = (_userAIHits.get(userId) || []).filter(t => t > now - USER_AI_WINDOW);
    if (userHits.length >= USER_AI_MAX) {
        return { limited: true, reason: 'user' };
    }

    // Record
    _globalAIHits.push(now);
    userHits.push(now);
    _userAIHits.set(userId, userHits);

    return { limited: false };
}

module.exports = { createRateLimit, createSocketRateLimit, checkAIRateLimit };
