/**
 * @file services/botManager.js
 * @description Bot player simulation for quick 1v1 games.
 *
 * Bots are script-driven (no AI):
 *  - Accuracy scales with their ELO tier (42–88%)
 *  - Answer timing is randomised per-question with difficulty variance
 *  - Both players can win or lose — bots are beatable but not trivial
 *  - Name rotation: every ~2 hours a bot's displayed username shifts slightly
 */

'use strict';

const db = require('../db/store');
const { handleAnswer } = require('./gameEngine');

// Mock socket — bots don't have real socket connections
const MOCK_SOCKET = { emit: () => {}, join: () => {}, leave: () => {}, to: () => ({ emit: () => {} }) };

// ── Accuracy by ELO ──────────────────────────────────────────────────────────
function getBotAccuracy(elo) {
    if (elo >= 2000) return 0.88;
    if (elo >= 1800) return 0.80;
    if (elo >= 1600) return 0.74;
    if (elo >= 1400) return 0.68;
    if (elo >= 1200) return 0.60;
    if (elo >= 1000) return 0.51;
    return 0.42;
}

// ── Answer delay by ELO + question difficulty (ms) ──────────────────────────
function getBotDelay(elo, difficulty) {
    // Base range: [min, max] ms
    let min, max;
    if (elo >= 1600)      { min = 1200; max = 5500; }
    else if (elo >= 1200) { min = 1800; max = 7500; }
    else                  { min = 2500; max = 9000; }

    // Hard questions take longer; easy ones faster
    const mult = difficulty === 'hard' || difficulty === 'expert' ? 1.35
               : difficulty === 'medium' ? 1.05
               : 0.85;

    min *= mult;
    max *= mult;

    // Add jitter so bots don't answer at exactly the same time
    return min + Math.random() * (max - min);
}

// ── Pick a wrong answer index (≠ correct) ────────────────────────────────────
function pickWrongAnswer(correct) {
    const opts = [0, 1, 2, 3].filter(i => i !== correct);
    return opts[Math.floor(Math.random() * opts.length)];
}

// ── Check if bot is in an active game ────────────────────────────────────────
function isInActiveGame(botId) {
    for (const [, game] of db.games) {
        if (game.status !== 'playing') continue;
        if (game.players.some(p => p.userId === botId)) return true;
    }
    return false;
}

/**
 * Schedule all bot answers for a game.
 * Uses a polling loop so it self-corrects if a question advances early (timeout).
 */
function scheduleBotAnswers(gameId, botUserId, io) {
    let lastScheduled = -1;

    function tick() {
        const game = db.games.get(gameId);
        if (!game || game.status !== 'playing') return;

        const qIdx = game.currentQuestion;
        const bot = db.users.get(botUserId);
        if (!bot) return;

        const botPlayer = game.players.find(p => p.userId === botUserId);
        if (!botPlayer) return;

        // Already answered this question or already scheduled it
        if (botPlayer.answers[qIdx] !== undefined || lastScheduled === qIdx) {
            // Poll back in case the question hasn't advanced yet
            setTimeout(tick, 300);
            return;
        }

        lastScheduled = qIdx;

        const q = game.questions[qIdx];
        if (!q) return;

        const delay = getBotDelay(bot.elo, q.difficulty);
        const isCorrect = Math.random() < getBotAccuracy(bot.elo);
        const answerIndex = isCorrect ? q.correct : pickWrongAnswer(q.correct);

        setTimeout(() => {
            const g = db.games.get(gameId);
            if (!g || g.status !== 'playing') return;
            // If question timed out and advanced, the timer already handled it — skip
            if (g.currentQuestion !== qIdx) return;

            const bp = g.players.find(p => p.userId === botUserId);
            if (!bp || bp.answers[qIdx] !== undefined) return;

            handleAnswer(io, MOCK_SOCKET, bot, gameId, answerIndex);

            // Poll for the next question after a short delay
            setTimeout(tick, 400);
        }, delay);
    }

    // Start tick after the game question is delivered (2s delay + buffer)
    setTimeout(tick, 2600);
}

/**
 * Find the best available bot for a given userElo.
 * Prefers bots within ±400 ELO; falls back to closest.
 * Randomly picks among the 5 closest to add variety.
 */
function pickBotForElo(userElo) {
    const available = [];
    for (const [, u] of db.users) {
        if (!u.isBot) continue;
        if (isInActiveGame(u.id)) continue;
        available.push(u);
    }
    if (!available.length) return null;

    available.sort((a, b) => Math.abs(a.elo - userElo) - Math.abs(b.elo - userElo));

    // Prefer bots within ±400 ELO; if none, take the closest
    const close = available.filter(b => Math.abs(b.elo - userElo) <= 400);
    const pool = (close.length ? close : available).slice(0, 5);
    return pool[Math.floor(Math.random() * pool.length)];
}

// ── Name rotation ─────────────────────────────────────────────────────────────
/**
 * Every ~2 hours each bot has a 30% chance to rotate to a different name variant.
 * Change is in-memory only — does not persist to MongoDB.
 */
function rotateBotNames() {
    for (const [, u] of db.users) {
        if (!u.isBot || !u.nameVariants || !u.nameVariants.length) continue;
        if (Math.random() < 0.30) {
            const pick = u.nameVariants[Math.floor(Math.random() * u.nameVariants.length)];
            u.username = pick;
        }
    }
}

// Schedule rotation every 2 hours
setInterval(rotateBotNames, 2 * 60 * 60 * 1000);

module.exports = { scheduleBotAnswers, pickBotForElo, rotateBotNames };
