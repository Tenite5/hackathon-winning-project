/**
 * @file middleware/dailyLimits.js
 * @description Per-user daily usage limits. In-memory, resets at UTC midnight.
 *
 * Counters:
 *   aiGen   — custom/solo AI question generation
 *   bio     — bio regeneration requests
 *   explain — wrong-answer explanations (Simple + Super combined)
 *   pdfGen  — PDF/image analysis (question generation from document)
 */

'use strict';

const FREE_LIMITS = {
    aiGen: 15,
    bio: 2,
    explain: 10,
    pdfGen: 2,
};

const DIAMOND_LIMITS = {
    aiGen: 60,
    bio: 50,
    explain: 200,
    pdfGen: 20,
};

/** userId -> { date: 'YYYY-MM-DD', aiGen, bio, explain, pdfGen } */
const _counts = new Map();

function _today() {
    return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function _getEntry(userId) {
    const today = _today();
    let entry = _counts.get(userId);
    if (!entry || entry.date !== today) {
        entry = { date: today, aiGen: 0, bio: 0, explain: 0, pdfGen: 0 };
        _counts.set(userId, entry);
    }
    return entry;
}

/**
 * Check whether a user has hit their daily limit for a given counter.
 * @param {string} userId
 * @param {boolean} isDiamondPro
 * @param {'aiGen'|'bio'|'explain'|'pdfGen'} counter
 * @returns {{ limited: boolean, remaining: number, limit: number }}
 */
function checkDailyLimit(userId, isDiamondPro, counter) {
    const limits = isDiamondPro ? DIAMOND_LIMITS : FREE_LIMITS;
    const limit = limits[counter];
    const entry = _getEntry(userId);
    const used = entry[counter] || 0;
    return {
        limited: used >= limit,
        remaining: Math.max(0, limit - used),
        limit,
    };
}

/**
 * Increment a user's daily counter. Call AFTER the action succeeds.
 * @param {string} userId
 * @param {'aiGen'|'bio'|'explain'|'pdfGen'} counter
 */
function incrementDailyLimit(userId, counter) {
    const entry = _getEntry(userId);
    entry[counter] = (entry[counter] || 0) + 1;
}

module.exports = { checkDailyLimit, incrementDailyLimit, FREE_LIMITS, DIAMOND_LIMITS };
