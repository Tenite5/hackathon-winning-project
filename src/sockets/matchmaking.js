/**
 * @file sockets/matchmaking.js
 * @description Socket handlers for quick-game queue, bot fill-in, friend challenges.
 *
 * Quick game flow:
 *  1. Real player joins queue → queue-join
 *  2. If 2+ real players: match them immediately
 *  3. If 1 real player waits >8s: match with a bot (pickBotForElo)
 *  4. Questions are served from the pre-generated pool (questionPool.js)
 *     falling back to real-time AI if pool is cold
 *  5. Difficulty is determined by 5-level ELO tiers (getLevelFromElo)
 *  6. When a bot is matched, botManager.scheduleBotAnswers() drives bot gameplay
 */

'use strict';

const { randomUUID: uuidv4 } = require('crypto');
const db = require('../db/store');
const { QUICK_GAME_TOPICS } = require('../config');
const { generateQuestions } = require('../services/ai');
const { sanitizeUser } = require('../services/elo');
const { startGameQuestion } = require('../services/gameEngine');
const { sanitizeText } = require('../middleware/validate');
const { checkAIRateLimit } = require('../middleware/rateLimit');
const { getLevelFromElo, getQuestionsFromPool, LEVEL_CONFIGS } = require('../services/questionPool');
const { pickBotForElo, scheduleBotAnswers } = require('../services/botManager');

/** Prevent two simultaneous queue-join events from both starting a match. */
let _queueMatching = false;

/** Bot fill-in timers: userId -> timeoutId */
const _botTimers = new Map();

/** Cancel all outgoing challenges from a user and notify both sides. */
function cancelOutgoingChallenges(io, userId) {
    for (const [cId, ch] of db.challenges) {
        if (ch.fromId === userId) {
            db.challenges.delete(cId);
            const target = db.users.get(ch.toId);
            if (target && target.socketId) {
                io.to(target.socketId).emit('challenge-cancelled', { challengeId: cId });
            }
            const sender = db.users.get(ch.fromId);
            if (sender && sender.socketId) {
                io.to(sender.socketId).emit('challenge-expired', { challengeId: cId });
            }
        }
    }
}

/** Attempt to start a match between two queue entries (real or bot). */
async function tryStartMatch(io, p1, p2, isBotMatch = false) {
    const user1 = db.users.get(p1.userId);
    const user2 = db.users.get(p2.userId);
    if (!user1 || !user2) return false;

    const topic = QUICK_GAME_TOPICS[Math.floor(Math.random() * QUICK_GAME_TOPICS.length)];
    const avgElo = Math.round(((user1.elo || 1000) + (user2.elo || 1000)) / 2);
    const level = getLevelFromElo(avgElo);
    const levelCfg = LEVEL_CONFIGS[level] || LEVEL_CONFIGS[1];

    // Notify real player(s) of the match
    if (p1.socketId) {
        io.to(p1.socketId).emit('queue-matched', { opponent: sanitizeUser(user2), topic });
    }
    if (p2.socketId && !isBotMatch) {
        io.to(p2.socketId).emit('queue-matched', { opponent: sanitizeUser(user1), topic });
    }

    // Check AI rate limits (skip for bot player)
    const realPlayers = isBotMatch ? [p1] : [p1, p2];
    for (const rp of realPlayers) {
        const rl = checkAIRateLimit(rp.userId);
        if (rl.limited) {
            const msg = rl.reason === 'global'
                ? 'Server is busy — too many games in progress. Try again in a few minutes.'
                : 'You\'ve generated too many games recently. Please wait a couple of minutes.';
            io.to(rp.socketId).emit('queue-error', { message: msg });
            return false;
        }
    }

    let questions = null;

    // 1. Try pre-generated pool first (fast, no AI call)
    questions = getQuestionsFromPool(topic, level);

    // 2. Fall back to real-time AI generation
    //    generateQuestions() already has internal 15s timeout per attempt + max 2 attempts
    if (!questions) {
        try {
            questions = await generateQuestions(topic, 7, levelCfg.aiDifficulty, level);
        } catch (err) {
            console.error('Matchmaking question generation failed:', err.message);
            if (p1.socketId) io.to(p1.socketId).emit('queue-error', { message: 'Failed to generate questions. Please try again.' });
            if (p2.socketId && !isBotMatch) io.to(p2.socketId).emit('queue-error', { message: 'Failed to generate questions. Please try again.' });
            return false;
        }
    }

    const gameId = uuidv4();
    const game = {
        id: gameId,
        type: 'quick',
        topic,
        level,
        players: [
            { userId: p1.userId, username: user1.username, socketId: p1.socketId, score: 0, answers: [] },
            { userId: p2.userId, username: user2.username, socketId: p2.socketId, score: 0, answers: [] },
        ],
        questions,
        currentQuestion: 0,
        timeLimit: levelCfg.timeLimit,
        questionStartTime: null,
        status: 'playing',
        chat: [],
        createdAt: Date.now(),
        isBotMatch,
    };

    db.games.set(gameId, game);

    // Join socket rooms (skip bot — no real socket)
    const s1 = p1.socketId ? io.sockets.sockets.get(p1.socketId) : null;
    const s2 = !isBotMatch && p2.socketId ? io.sockets.sockets.get(p2.socketId) : null;
    if (s1) s1.join(gameId);
    if (s2) s2.join(gameId);

    setTimeout(() => {
        startGameQuestion(gameId, io);
        // If bot match, schedule bot answers right away
        if (isBotMatch) {
            scheduleBotAnswers(gameId, p2.userId, io);
        }
    }, 2000);

    return true;
}

module.exports = function (io, socket, getCurrentUser) {

    socket.on('queue-join', async () => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const now = Date.now();
        if (currentUser._lastQueueJoin && now - currentUser._lastQueueJoin < 3000) return;
        currentUser._lastQueueJoin = now;

        cancelOutgoingChallenges(io, currentUser.id);

        db.quickQueue = db.quickQueue.filter(q => q.userId !== currentUser.id);
        db.quickQueue.push({ userId: currentUser.id, socketId: socket.id, joinedAt: Date.now() });

        socket.emit('queue-status', { position: db.quickQueue.length, waiting: true });

        // ── Real vs real match ────────────────────────────────────────────
        if (db.quickQueue.length >= 2 && !_queueMatching) {
            _queueMatching = true;
            const p1 = db.quickQueue.shift();
            const p2 = db.quickQueue.shift();

            // Cancel any pending bot timers for these players
            if (_botTimers.has(p1.userId)) { clearTimeout(_botTimers.get(p1.userId)); _botTimers.delete(p1.userId); }
            if (_botTimers.has(p2.userId)) { clearTimeout(_botTimers.get(p2.userId)); _botTimers.delete(p2.userId); }

            const ok = await tryStartMatch(io, p1, p2, false);
            if (!ok) {
                db.quickQueue.unshift(p1, p2);
            }
            _queueMatching = false;
            return;
        }

        // ── No immediate match — schedule bot fill-in after 8 seconds ────
        const timerId = setTimeout(async () => {
            _botTimers.delete(currentUser.id);

            // Remove from real queue
            const idx = db.quickQueue.findIndex(q => q.userId === currentUser.id);
            if (idx === -1) return; // Already matched with a real player
            const [playerEntry] = db.quickQueue.splice(idx, 1);

            // Check player still connected
            const player = db.users.get(playerEntry.userId);
            if (!player || !player.online) return;

            const bot = pickBotForElo(player.elo || 1000);
            if (!bot) {
                // No bots available — put back in queue
                db.quickQueue.push(playerEntry);
                return;
            }

            const botEntry = { userId: bot.id, socketId: null, joinedAt: Date.now() };

            // Notify player they've been matched
            io.to(playerEntry.socketId).emit('queue-matched', { opponent: sanitizeUser(bot), topic: null });

            const ok = await tryStartMatch(io, playerEntry, botEntry, true);
            if (!ok) {
                // Re-queue the real player
                db.quickQueue.push(playerEntry);
            }
        }, 8000);

        _botTimers.set(currentUser.id, timerId);
    });

    socket.on('queue-leave', () => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        db.quickQueue = db.quickQueue.filter(q => q.userId !== currentUser.id);
        if (_botTimers.has(currentUser.id)) {
            clearTimeout(_botTimers.get(currentUser.id));
            _botTimers.delete(currentUser.id);
        }
        socket.emit('queue-status', { waiting: false });
    });

    // ── Friend Challenge ──────────────────────────────────────────────────────
    socket.on('challenge-friend', ({ friendId, topic }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        if (typeof friendId !== 'string') return;
        if (!currentUser.friends.includes(friendId)) return socket.emit('challenge-error', 'Not friends with this user');

        const friend = db.users.get(friendId);
        if (!friend || !friend.online || !friend.socketId) return socket.emit('challenge-error', 'Friend is offline');

        cancelOutgoingChallenges(io, currentUser.id);

        const cleanTopic = sanitizeText(topic, 100) || 'General Knowledge';
        const challengeId = uuidv4();
        db.challenges.set(challengeId, {
            id: challengeId,
            fromId: currentUser.id,
            fromUsername: currentUser.username,
            toId: friendId,
            topic: cleanTopic,
            createdAt: Date.now(),
        });

        io.to(friend.socketId).emit('challenge-received', {
            challengeId,
            from: sanitizeUser(currentUser),
            topic: cleanTopic,
        });
        socket.emit('challenge-sent', { challengeId, to: friend.username });

        setTimeout(() => {
            if (db.challenges.has(challengeId)) {
                db.challenges.delete(challengeId);
                socket.emit('challenge-expired', { challengeId });
                if (friend.socketId) {
                    io.to(friend.socketId).emit('challenge-cancelled', { challengeId });
                }
            }
        }, 60000);
    });

    socket.on('challenge-cancel', () => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        cancelOutgoingChallenges(io, currentUser.id);
    });

    socket.on('challenge-accept', async ({ challengeId }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        if (typeof challengeId !== 'string') return;
        const challenge = db.challenges.get(challengeId);
        if (!challenge || challenge.toId !== currentUser.id) return socket.emit('challenge-error', 'Invalid challenge');

        db.challenges.delete(challengeId);

        const challenger = db.users.get(challenge.fromId);
        if (!challenger || !challenger.socketId) return socket.emit('challenge-error', 'Challenger went offline');

        const topic = challenge.topic;

        const rlAcceptor = checkAIRateLimit(currentUser.id);
        const rlChallenger = checkAIRateLimit(challenger.id);
        if (rlAcceptor.limited || rlChallenger.limited) {
            const msg = rlAcceptor.limited && rlAcceptor.reason === 'global'
                ? 'Server is busy — too many games in progress. Try again in a few minutes.'
                : 'Too many games generated recently. Please wait a couple of minutes.';
            socket.emit('challenge-error', msg);
            return;
        }

        let questions;
        try {
            // generateQuestions() already has internal 15s timeout per attempt + max 2 attempts
            questions = await generateQuestions(topic, 7);
        } catch (err) {
            console.error('Challenge question generation failed:', err.message);
            socket.emit('challenge-error', 'Failed to generate questions. Please try again.');
            const challengerSock = io.sockets.sockets.get(challenger.socketId);
            if (challengerSock) challengerSock.emit('challenge-error', 'Opponent failed to start the game.');
            return;
        }

        const gameId = uuidv4();
        const game = {
            id: gameId,
            type: 'quick',
            topic,
            players: [
                { userId: challenger.id, username: challenger.username, socketId: challenger.socketId, score: 0, answers: [] },
                { userId: currentUser.id, username: currentUser.username, socketId: socket.id, score: 0, answers: [] },
            ],
            questions,
            currentQuestion: 0,
            timeLimit: 10,
            questionStartTime: null,
            status: 'playing',
            chat: [],
            createdAt: Date.now(),
        };

        db.games.set(gameId, game);

        const s1 = io.sockets.sockets.get(challenger.socketId);
        const s2 = io.sockets.sockets.get(socket.id);
        if (s1) s1.join(gameId);
        if (s2) s2.join(gameId);

        io.to(challenger.socketId).emit('challenge-accepted', { challengeId, gameId, opponent: sanitizeUser(currentUser), topic });
        socket.emit('challenge-accepted', { challengeId, gameId, opponent: sanitizeUser(challenger), topic });

        setTimeout(() => startGameQuestion(gameId, io), 2000);
    });

    socket.on('challenge-decline', ({ challengeId }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        if (typeof challengeId !== 'string') return;
        const challenge = db.challenges.get(challengeId);
        if (!challenge || challenge.toId !== currentUser.id) return;
        db.challenges.delete(challengeId);

        const challenger = db.users.get(challenge.fromId);
        if (challenger && challenger.socketId) {
            io.to(challenger.socketId).emit('challenge-declined', { challengeId, by: currentUser.username });
        }
    });
};

// Export for use in disconnect handler
module.exports.cancelOutgoingChallenges = cancelOutgoingChallenges;
