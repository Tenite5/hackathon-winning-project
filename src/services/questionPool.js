/**
 * @file services/questionPool.js
 * @description Pre-generated question pool for quick games.
 *
 * 5 difficulty levels based on ELO:
 *   Level 1 — Bronze  (<1000)
 *   Level 2 — Silver  (1000–1199)
 *   Level 3 — Gold    (1200–1399)
 *   Level 4 — Platinum(1400–1599)
 *   Level 5 — Diamond+(1600+)
 *
 * 2 sets per (topic × level) are kept pre-generated.
 * When a set is consumed, background regeneration replaces it.
 * Falls back to real-time AI if pool is cold.
 */

'use strict';

const QuestionPoolModel = require('../db/models/QuestionPool');
const { generateQuestions } = require('./ai');
const { QUICK_GAME_TOPICS } = require('../config');

// ── Level config ─────────────────────────────────────────────────────────────
const LEVEL_CONFIGS = {
    1: { aiDifficulty: 'easy',   timeLimit: 15, label: 'Bronze'    },
    2: { aiDifficulty: 'medium', timeLimit: 12, label: 'Silver'    },
    3: { aiDifficulty: 'hard',   timeLimit: 10, label: 'Gold'      },
    4: { aiDifficulty: 'hard',   timeLimit: 10, label: 'Platinum'  },
    5: { aiDifficulty: 'expert', timeLimit: 10, label: 'Diamond+'  },
};

/** Map an average ELO to a 1-5 difficulty level. */
function getLevelFromElo(avgElo) {
    if (avgElo >= 1600) return 5;
    if (avgElo >= 1400) return 4;
    if (avgElo >= 1200) return 3;
    if (avgElo >= 1000) return 2;
    return 1;
}

// ── In-memory cache: poolKey -> [{questions, createdAt}] ────────────────────
const cache = new Map();
let _isRegenerating = new Set(); // prevent double-regen for same key

function poolKey(topic, level) {
    return `${topic}_${level}`;
}

/** Load all existing pool documents from MongoDB into cache. */
async function loadPoolsFromDB() {
    try {
        const docs = await QuestionPoolModel.find().lean();
        for (const doc of docs) {
            if (doc.sets && doc.sets.length) {
                cache.set(doc._id, doc.sets);
            }
        }
        console.log(`   Loaded ${cache.size} question pool entries`);
    } catch (err) {
        console.error('Failed to load question pools:', err.message);
    }
}

/** Persist the current cache entry for (topic, level) to MongoDB. */
function savePool(topic, level) {
    const key = poolKey(topic, level);
    const sets = cache.get(key) || [];
    QuestionPoolModel.findByIdAndUpdate(
        key,
        { _id: key, topic, level, sets, updatedAt: new Date() },
        { upsert: true }
    ).catch(err => console.error('savePool error:', err.message));
}

/** Generate one set and store it for (topic, level). Returns the questions array. */
async function generateAndStore(topic, level) {
    const key = poolKey(topic, level);
    if (_isRegenerating.has(key)) return null;
    _isRegenerating.add(key);
    try {
        const cfg = LEVEL_CONFIGS[level] || LEVEL_CONFIGS[1];
        const questions = await generateQuestions(topic, 7, cfg.aiDifficulty, level);
        const set = { questions, createdAt: Date.now() };

        const existing = cache.get(key) || [];
        if (existing.length < 2) {
            existing.push(set);
        } else {
            // Replace the oldest (lowest createdAt)
            let oldest = 0;
            for (let i = 1; i < existing.length; i++) {
                if (existing[i].createdAt < existing[oldest].createdAt) oldest = i;
            }
            existing[oldest] = set;
        }
        cache.set(key, existing);
        savePool(topic, level);
        return questions;
    } catch (err) {
        console.error(`Pool regen failed for ${topic} L${level}:`, err.message);
        return null;
    } finally {
        _isRegenerating.delete(key);
    }
}

/**
 * Get a ready-made question set for (topic, level).
 * Returns the questions array if available, or null if pool is cold.
 * Marks the freshest set consumed (createdAt=0) and triggers background refill.
 */
function getQuestionsFromPool(topic, level) {
    const key = poolKey(topic, level);
    const sets = cache.get(key);
    if (!sets || !sets.length) {
        // Pool cold — trigger background generation, caller falls back to real-time
        setImmediate(() => generateAndStore(topic, level).catch(() => {}));
        return null;
    }

    // Use the freshest non-expired set (createdAt > 0 means not yet consumed)
    const available = sets.filter(s => s.createdAt > 0);
    if (!available.length) {
        setImmediate(() => generateAndStore(topic, level).catch(() => {}));
        return null;
    }

    available.sort((a, b) => b.createdAt - a.createdAt);
    const chosen = available[0];

    // Mark consumed
    chosen.createdAt = 0;

    // Trigger background refill
    setImmediate(() => generateAndStore(topic, level).catch(() => {}));

    return chosen.questions;
}

/**
 * Warm up the pool on startup — stagger generation to avoid hammering the AI.
 * Only generates sets that are missing or fully consumed.
 */
function warmUpPools() {
    console.log('🎯 Warming up question pools (background)...');
    let delay = 0;
    const STAGGER_MS = 4500; // 4.5s between AI calls

    for (const topic of QUICK_GAME_TOPICS) {
        for (const level of [1, 2, 3, 4, 5]) {
            const key = poolKey(topic, level);
            const existing = cache.get(key) || [];
            const fresh = existing.filter(s => s.createdAt > 0).length;
            const needed = 2 - fresh;
            for (let i = 0; i < needed; i++) {
                delay += STAGGER_MS;
                setTimeout(() => {
                    generateAndStore(topic, level).catch(() => {});
                }, delay);
            }
        }
    }
}

module.exports = { getLevelFromElo, getQuestionsFromPool, loadPoolsFromDB, warmUpPools, LEVEL_CONFIGS };
