/**
 * @file sockets/matchmaking.js
 * @description Socket handlers for quick-game queue, friend challenges, accept/decline.
 */

'use strict';

const { randomUUID: uuidv4 } = require('crypto');
const db = require('../db/store');
const { QUICK_GAME_TOPICS } = require('../config');
const { generateQuestions } = require('../services/ai');
const { sanitizeUser } = require('../services/elo');
const { startGameQuestion } = require('../services/gameEngine');
const { sanitizeText } = require('../middleware/validate');

module.exports = function (io, socket, getCurrentUser) {

    socket.on('queue-join', async () => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const now = Date.now();
        if (currentUser._lastQueueJoin && now - currentUser._lastQueueJoin < 3000) return;
        currentUser._lastQueueJoin = now;

        db.quickQueue = db.quickQueue.filter(q => q.userId !== currentUser.id);
        db.quickQueue.push({ userId: currentUser.id, socketId: socket.id, joinedAt: Date.now() });

        socket.emit('queue-status', { position: db.quickQueue.length, waiting: true });

        if (db.quickQueue.length >= 2) {
            const p1 = db.quickQueue.shift();
            const p2 = db.quickQueue.shift();

            const user1 = db.users.get(p1.userId);
            const user2 = db.users.get(p2.userId);

            const topic = QUICK_GAME_TOPICS[Math.floor(Math.random() * QUICK_GAME_TOPICS.length)];

            io.to(p1.socketId).emit('queue-matched', { opponent: sanitizeUser(user2), topic });
            io.to(p2.socketId).emit('queue-matched', { opponent: sanitizeUser(user1), topic });

            try {
                const questions = await generateQuestions(topic, 7);
                const gameId = uuidv4();

                const game = {
                    id: gameId,
                    type: 'quick',
                    topic,
                    players: [
                        { userId: p1.userId, username: user1.username, socketId: p1.socketId, score: 0, answers: [] },
                        { userId: p2.userId, username: user2.username, socketId: p2.socketId, score: 0, answers: [] },
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

                const s1 = io.sockets.sockets.get(p1.socketId);
                const s2 = io.sockets.sockets.get(p2.socketId);
                if (s1) s1.join(gameId);
                if (s2) s2.join(gameId);

                setTimeout(() => startGameQuestion(gameId, io), 2000);
            } catch (err) {
                console.error('Queue matchmaking question generation failed:', err.message);
                // Notify both players of the failure
                io.to(p1.socketId).emit('queue-error', { message: 'Failed to generate questions. Please try again.' });
                io.to(p2.socketId).emit('queue-error', { message: 'Failed to generate questions. Please try again.' });
                // Re-add both players to the queue
                db.quickQueue.unshift(p1, p2);
            }
        }
    });

    socket.on('queue-leave', () => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        db.quickQueue = db.quickQueue.filter(q => q.userId !== currentUser.id);
        socket.emit('queue-status', { waiting: false });
    });

    // Friend Challenge
    socket.on('challenge-friend', ({ friendId, topic }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        if (typeof friendId !== 'string') return;
        if (!currentUser.friends.includes(friendId)) return socket.emit('challenge-error', 'Not friends with this user');

        const friend = db.users.get(friendId);
        if (!friend || !friend.online || !friend.socketId) return socket.emit('challenge-error', 'Friend is offline');

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
            }
        }, 60000);
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
        const questions = await generateQuestions(topic, 7);
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
