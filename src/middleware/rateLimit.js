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

module.exports = { createRateLimit, createSocketRateLimit };
