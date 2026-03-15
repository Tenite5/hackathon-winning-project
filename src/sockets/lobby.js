/**
 * @file sockets/lobby.js
 * @description Socket handlers for lobby creation, joining, leaving, starting, and preset games.
 */

'use strict';

const { randomUUID: uuidv4 } = require('crypto');
const db = require('../db/store');
const { PRESET_QUESTIONS } = require('../config');
const { generateQuestions } = require('../services/ai');
const { startGameQuestion } = require('../services/gameEngine');
const { sanitizeText, validateInt } = require('../middleware/validate');
const { checkAIRateLimit } = require('../middleware/rateLimit');

module.exports = function (io, socket, getCurrentUser) {

    socket.on('create-lobby', async ({ topic, isPublic, timeLimit, questionCount, maxPlayers, ranked, presetId }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;

        const qCount = validateInt(questionCount, 3, 20, 5);

        // Resolve preset if selected
        let resolvedPresetQuestions = null;
        let resolvedTopic = sanitizeText(topic, 100) || 'General Knowledge';

        if (presetId && PRESET_QUESTIONS[presetId]) {
            const preset = PRESET_QUESTIONS[presetId];
            const shuffled = [...preset.questions].sort(() => Math.random() - 0.5);
            resolvedPresetQuestions = shuffled.slice(0, qCount);
            resolvedTopic = `📚 ${preset.name}`;
        } else {
            // Check AI rate limit before kicking off pre-generation
            const rl = checkAIRateLimit(currentUser.id);
            if (rl.limited) {
                const msg = rl.reason === 'global'
                    ? 'Server is busy — too many games being generated right now. Try again in a few minutes.'
                    : 'You\'ve generated too many games recently. Please wait a couple of minutes.';
                return socket.emit('lobby-error', msg);
            }
        }

        const lobbyId = uuidv4();
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        const lobby = {
            id: lobbyId,
            inviteCode,
            topic: resolvedTopic,
            isPublic: isPublic !== false,
            ranked: ranked !== false,
            hostId: currentUser.id,
            hostUsername: currentUser.username,
            maxPlayers: validateInt(maxPlayers, 2, 8, 2),
            questionCount: qCount,
            timeLimit: validateInt(timeLimit, 5, 30, 10),
            players: [{ userId: currentUser.id, username: currentUser.username, socketId: socket.id, score: 0, answers: [], ready: true }],
            status: 'waiting',
            createdAt: Date.now(),
            expiresAt: Date.now() + 10 * 60 * 1000,
        };

        if (resolvedPresetQuestions) {
            lobby.presetQuestions = resolvedPresetQuestions;
        }

        db.lobbies.set(lobbyId, lobby);
        socket.join(lobbyId);

        // Pre-generate questions in the background for AI lobbies (rate limit already checked above)
        if (!lobby.presetQuestions) {
            lobby._preGenPromise = generateQuestions(lobby.topic, lobby.questionCount)
                .then(q => { lobby._preGenQuestions = q; })
                .catch(err => { console.warn('Lobby pre-gen failed:', err.message); });
        }

        socket.emit('lobby-created', { lobbyId, inviteCode, lobby });
        io.emit('lobbies-updated');
    });

    socket.on('leave-lobby', ({ lobbyId }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        if (typeof lobbyId !== 'string') return;
        const lobby = db.lobbies.get(lobbyId);
        if (!lobby) return;

        lobby.players = lobby.players.filter(p => p.userId !== currentUser.id);
        socket.leave(lobbyId);

        if (lobby.players.length === 0 || lobby.hostId === currentUser.id) {
            db.lobbies.delete(lobbyId);
            if (lobby.players.length > 0) {
                io.to(lobbyId).emit('lobby-error', 'Host left the lobby. Lobby has been closed.');
                lobby.players.forEach(p => {
                    const s = io.sockets.sockets.get(p.socketId);
                    if (s) s.leave(lobbyId);
                });
            }
        } else {
            io.to(lobbyId).emit('lobby-updated', lobby);
        }

        io.emit('lobbies-updated');
    });

    socket.on('join-lobby', ({ lobbyId, inviteCode }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;

        let lobby = null;
        if (lobbyId && typeof lobbyId === 'string') {
            lobby = db.lobbies.get(lobbyId);
        } else if (inviteCode && typeof inviteCode === 'string') {
            const code = sanitizeText(inviteCode, 10).toUpperCase();
            for (const [, l] of db.lobbies) {
                if (l.inviteCode === code && l.status === 'waiting') {
                    lobby = l;
                    break;
                }
            }
        }

        if (!lobby) return socket.emit('lobby-error', 'Lobby not found');
        if (lobby.status !== 'waiting') return socket.emit('lobby-error', 'Game already in progress');
        if (lobby.players.length >= lobby.maxPlayers) return socket.emit('lobby-error', 'Lobby full');
        if (lobby.players.find(p => p.userId === currentUser.id)) return socket.emit('lobby-error', 'Already in lobby');

        lobby.players.push({ userId: currentUser.id, username: currentUser.username, socketId: socket.id, score: 0, answers: [], ready: false });
        socket.join(lobby.id);

        io.to(lobby.id).emit('lobby-updated', lobby);
        io.emit('lobbies-updated');
    });

    socket.on('lobby-ready', ({ lobbyId }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        if (typeof lobbyId !== 'string') return;
        const lobby = db.lobbies.get(lobbyId);
        if (!lobby) return;
        const player = lobby.players.find(p => p.userId === currentUser.id);
        if (player) player.ready = true;
        io.to(lobbyId).emit('lobby-updated', lobby);
    });

    socket.on('lobby-start', async ({ lobbyId }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        if (typeof lobbyId !== 'string') return;
        const lobby = db.lobbies.get(lobbyId);
        if (!lobby || lobby.hostId !== currentUser.id) return;
        if (lobby.players.length < 2) return socket.emit('lobby-error', 'Need at least 2 players');
        if (lobby._starting) return;
        lobby._starting = true;

        lobby.status = 'playing';
        io.to(lobbyId).emit('lobby-generating', { topic: lobby.topic });

        let questions;
        if (lobby.presetQuestions) {
            questions = lobby.presetQuestions;
        } else {
            // Await pre-generation if still in progress, then use result or fall back
            if (lobby._preGenPromise) {
                try { await lobby._preGenPromise; } catch (e) { /* handled below */ }
            }
            questions = lobby._preGenQuestions || await generateQuestions(lobby.topic, lobby.questionCount);
        }

        const gameId = uuidv4();
        const game = {
            id: gameId,
            type: 'custom',
            ranked: lobby.ranked,
            lobbyId: lobby.id,
            topic: lobby.topic,
            players: lobby.players.map(p => ({ ...p, score: 0, answers: [] })),
            questions,
            currentQuestion: 0,
            timeLimit: lobby.timeLimit,
            questionStartTime: null,
            status: 'playing',
            chat: [],
            createdAt: Date.now(),
        };

        db.games.set(gameId, game);

        lobby.players.forEach(p => {
            const s = io.sockets.sockets.get(p.socketId);
            if (s) s.join(gameId);
        });

        io.to(lobbyId).emit('lobby-game-start', { gameId, topic: lobby.topic });
        io.emit('lobbies-updated');

        setTimeout(() => startGameQuestion(gameId, io), 2000);
    });

    // Solo Practice Mode
    socket.on('solo-start', async ({ topic, questionCount, timeLimit }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const now = Date.now();
        if (currentUser._lastGameStart && now - currentUser._lastGameStart < 5000) return;
        currentUser._lastGameStart = now;

        const cleanTopic = sanitizeText(topic, 100) || 'General Knowledge';
        const qCount = validateInt(questionCount, 3, 20, 5);
        // 0 = infinite time (solo only), otherwise clamp 5-30
        const rawTime = parseInt(timeLimit, 10);
        const tLimit = rawTime === 0 ? 0 : validateInt(timeLimit, 5, 30, 10);

        // Check AI rate limit
        const rl = checkAIRateLimit(currentUser.id);
        if (rl.limited) {
            const msg = rl.reason === 'global'
                ? 'Server is busy — too many games being generated right now. Try again in a few minutes.'
                : 'You\'ve generated too many games recently. Please wait a couple of minutes.';
            return socket.emit('game-error', msg);
        }

        socket.emit('solo-generating', { topic: cleanTopic });

        const questions = await generateQuestions(cleanTopic, qCount);
        const gameId = uuidv4();

        const game = {
            id: gameId,
            type: 'solo',
            topic: cleanTopic,
            players: [{ userId: currentUser.id, username: currentUser.username, socketId: socket.id, score: 0, answers: [] }],
            questions,
            currentQuestion: 0,
            timeLimit: tLimit,
            questionStartTime: null,
            status: 'playing',
            chat: [],
            createdAt: Date.now(),
        };

        db.games.set(gameId, game);
        socket.join(gameId);

        setTimeout(() => startGameQuestion(gameId, io), 1500);
    });

    // Preset Game Mode — starts as a solo game, not a public lobby
    socket.on('preset-start', ({ presetId }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const now = Date.now();
        if (currentUser._lastGameStart && now - currentUser._lastGameStart < 5000) return;
        currentUser._lastGameStart = now;

        if (typeof presetId !== 'string') return;
        const preset = PRESET_QUESTIONS[presetId];
        if (!preset) return socket.emit('game-error', 'Invalid preset');

        const shuffled = [...preset.questions].sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, 3);

        const questions = picked.map(q => {
            const optionsCopy = [...q.options];
            for (let i = optionsCopy.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [optionsCopy[i], optionsCopy[j]] = [optionsCopy[j], optionsCopy[i]];
            }
            return {
                ...q,
                options: optionsCopy,
                correct: optionsCopy.indexOf(q.options[q.correct]),
            };
        });

        const timeLimit = presetId === 'hard-math' ? 120 : 30;

        // Create a solo game directly instead of a public lobby
        const gameId = uuidv4();

        const game = {
            id: gameId,
            type: 'solo',
            topic: `📚 ${preset.name}`,
            players: [{ userId: currentUser.id, username: currentUser.username, socketId: socket.id, score: 0, answers: [] }],
            questions,
            currentQuestion: 0,
            timeLimit,
            questionStartTime: null,
            status: 'playing',
            chat: [],
            createdAt: Date.now(),
        };

        db.games.set(gameId, game);
        socket.join(gameId);

        // Tell the client to go straight into the game
        socket.emit('solo-game-start', { gameId });
        setTimeout(() => startGameQuestion(gameId, io), 1500);
    });

    // ── PDF Mode — Solo (questions already generated by REST API) ──────────
    socket.on('pdf-solo-start', ({ questions, timeLimit, topic }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const now = Date.now();
        if (currentUser._lastGameStart && now - currentUser._lastGameStart < 5000) return;
        currentUser._lastGameStart = now;

        if (!Array.isArray(questions) || questions.length === 0) {
            return socket.emit('game-error', 'No questions provided');
        }

        // 0 = infinite time (solo only), otherwise clamp 5-60
        const rawPdfTime = parseInt(timeLimit, 10);
        const tLimit = rawPdfTime === 0 ? 0 : validateInt(timeLimit, 5, 60, 15);
        const cleanTopic = sanitizeText(topic, 100) || 'PDF Quiz';
        const gameId = uuidv4();

        const game = {
            id: gameId,
            type: 'solo',
            topic: `📄 ${cleanTopic}`,
            players: [{ userId: currentUser.id, username: currentUser.username, socketId: socket.id, score: 0, answers: [] }],
            questions: questions.slice(0, 20),
            currentQuestion: 0,
            timeLimit: tLimit,
            questionStartTime: null,
            status: 'playing',
            chat: [],
            createdAt: Date.now(),
        };

        db.games.set(gameId, game);
        socket.join(gameId);

        socket.emit('solo-game-start', { gameId });
        setTimeout(() => startGameQuestion(gameId, io), 1500);
    });

    // ── PDF Mode — Custom Lobby (questions already generated by REST API) ──
    socket.on('pdf-lobby-create', ({ questions, timeLimit, topic, maxPlayers, isPublic }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;

        if (!Array.isArray(questions) || questions.length === 0) {
            return socket.emit('game-error', 'No questions provided');
        }

        const lobbyId = uuidv4();
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const cleanTopic = sanitizeText(topic, 100) || 'PDF Quiz';

        const lobby = {
            id: lobbyId,
            inviteCode,
            topic: `📄 ${cleanTopic}`,
            isPublic: isPublic !== false,
            ranked: false,
            hostId: currentUser.id,
            hostUsername: currentUser.username,
            maxPlayers: validateInt(maxPlayers, 2, 8, 2),
            questionCount: questions.length,
            timeLimit: validateInt(timeLimit, 5, 60, 15),
            players: [{ userId: currentUser.id, username: currentUser.username, socketId: socket.id, score: 0, answers: [], ready: true }],
            presetQuestions: questions.slice(0, 20),
            status: 'waiting',
            createdAt: Date.now(),
            expiresAt: Date.now() + 10 * 60 * 1000,
        };

        db.lobbies.set(lobbyId, lobby);
        socket.join(lobbyId);

        socket.emit('lobby-created', { lobbyId, inviteCode, lobby });
        io.emit('lobbies-updated');
    });
};
