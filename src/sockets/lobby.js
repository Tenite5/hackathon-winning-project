/**
 * @file sockets/lobby.js
 * @description Socket handlers for lobby creation, joining, leaving, starting, and preset games.
 */

'use strict';

const { randomUUID: uuidv4 } = require('crypto');
const db = require('../db/store');
const { PRESET_QUESTIONS } = require('../config');
const { generateQuestions, filterQuestionsByKeyword } = require('../services/ai');
const { startGameQuestion } = require('../services/gameEngine');
const { sanitizeText, validateInt } = require('../middleware/validate');
const { checkAIRateLimit } = require('../middleware/rateLimit');
const { checkDailyLimit, incrementDailyLimit } = require('../middleware/dailyLimits');
const { scheduleBotAnswers } = require('../services/botManager');
const { stripFillerBots } = require('../services/botLobbies');

module.exports = function (io, socket, getCurrentUser) {

    socket.on('create-lobby', async ({ topic, isPublic, timeLimit, questionCount, maxPlayers, ranked, presetId, presetTopic }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;

        const qCount = validateInt(questionCount, 3, 20, 5);

        // Resolve preset if selected
        let resolvedPresetQuestions = null;
        let resolvedTopic = sanitizeText(topic, 100) || 'General Knowledge';

        if (presetId && PRESET_QUESTIONS[presetId]) {
            const preset = PRESET_QUESTIONS[presetId];
            const cleanPresetTopic = presetTopic ? sanitizeText(presetTopic, 100) : '';
            let pool = [...preset.questions];
            let topicMatched = false;

            // Keyword filtering if a search term was provided (instant, no AI call)
            if (cleanPresetTopic) {
                const matchingIndices = filterQuestionsByKeyword(preset.questions, cleanPresetTopic, 50);
                if (matchingIndices.length >= 3) {
                    pool = matchingIndices.map(i => preset.questions[i]);
                    topicMatched = true;
                }
            }

            const shuffled = pool.sort(() => Math.random() - 0.5);
            // Non-Diamond users get 50% of preset questions
            const allQuestions = shuffled.slice(0, qCount);
            if (!currentUser.isDiamondPro) {
                const half = Math.ceil(allQuestions.length / 2);
                resolvedPresetQuestions = allQuestions.slice(0, half);
            } else {
                resolvedPresetQuestions = allQuestions;
            }
            resolvedTopic = (cleanPresetTopic && topicMatched)
                ? `📚 ${preset.name} — ${cleanPresetTopic}`
                : `📚 ${preset.name}`;
        } else {
            // Check daily AI gen limit
            const dailyRl = checkDailyLimit(currentUser.id, currentUser.isDiamondPro, 'aiGen');
            if (dailyRl.limited) {
                const msg = currentUser.isDiamondPro
                    ? 'You\'ve reached your 60 daily AI game generations. Resets tomorrow.'
                    : `Free accounts get 15 AI game generations per day (${dailyRl.remaining} remaining). Upgrade to Diamond Pro for 60.`;
                return socket.emit('lobby-error', msg);
            }
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
            players: [{ userId: currentUser.id, username: currentUser.username, photoURL: currentUser.photoURL || null, socketId: socket.id, score: 0, answers: [], ready: true }],
            status: 'waiting',
            createdAt: Date.now(),
            expiresAt: Date.now() + 10 * 60 * 1000,
        };

        if (resolvedPresetQuestions) {
            lobby.presetQuestions = resolvedPresetQuestions;
        }

        db.lobbies.set(lobbyId, lobby);
        socket.join(lobbyId);

        // Pre-generate questions in the background — Diamond hosts only (10x faster start)
        if (!lobby.presetQuestions && currentUser.isDiamondPro) {
            lobby._preGenPromise = generateQuestions(lobby.topic, lobby.questionCount)
                .then(q => { lobby._preGenQuestions = q; incrementDailyLimit(currentUser.id, 'aiGen'); })
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
        if (lobby.players.find(p => p.userId === currentUser.id)) return socket.emit('lobby-error', 'Already in lobby');

        // For bot lobbies: strip filler bots to make room for real players
        if (lobby._isBotLobby) {
            stripFillerBots(lobby);
        }

        if (lobby.players.length >= lobby.maxPlayers) return socket.emit('lobby-error', 'Lobby full');

        lobby.players.push({ userId: currentUser.id, username: currentUser.username, photoURL: currentUser.photoURL || null, socketId: socket.id, score: 0, answers: [], ready: false });
        socket.join(lobby.id);

        io.to(lobby.id).emit('lobby-updated', lobby);
        io.emit('lobbies-updated');

        // Auto-start bot lobbies after a short delay when a real player joins
        if (lobby._isBotLobby && !lobby._starting) {
            setTimeout(() => {
                if (lobby.status !== 'waiting' || lobby._starting) return;
                // Only auto-start if there are real (non-bot) players
                const realPlayers = lobby.players.filter(p => {
                    const u = db.users.get(p.userId);
                    return u && !u.isBot;
                });
                if (realPlayers.length < 1) return;

                lobby._starting = true;
                lobby.status = 'playing';
                io.to(lobby.id).emit('lobby-generating', { topic: lobby.topic });

                const questions = lobby.presetQuestions;
                if (!questions || !questions.length) { lobby._starting = false; lobby.status = 'waiting'; return; }

                const gameId = uuidv4();
                const game = {
                    id: gameId,
                    type: 'custom',
                    ranked: false,
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

                io.to(lobby.id).emit('lobby-game-start', { gameId, topic: lobby.topic });
                io.emit('lobbies-updated');
                setTimeout(() => startGameQuestion(gameId, io), 2000);

                // Schedule bot answers for all bot players in this game
                game.players.forEach(p => {
                    const u = db.users.get(p.userId);
                    if (u && u.isBot) scheduleBotAnswers(gameId, u.id, io);
                });
            }, 3000); // 3 second delay before auto-starting
        }
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
            // For non-Diamond hosts: check daily limit at start time (they don't pre-generate)
            if (!currentUser.isDiamondPro) {
                const dailyRl = checkDailyLimit(currentUser.id, false, 'aiGen');
                if (dailyRl.limited) {
                    lobby._starting = false;
                    lobby.status = 'waiting';
                    return socket.emit('lobby-error', `Free accounts get 15 AI game generations per day (${dailyRl.remaining} remaining). Upgrade to Diamond Pro for 60.`);
                }
            }
            // Await pre-generation if still in progress (Diamond hosts), then use result or fall back
            if (lobby._preGenPromise) {
                try { await lobby._preGenPromise; } catch (e) { /* handled below */ }
            }
            if (lobby._preGenQuestions) {
                questions = lobby._preGenQuestions;
            } else {
                try {
                    questions = await generateQuestions(lobby.topic, lobby.questionCount);
                } catch (err) {
                    console.error('Lobby question generation failed:', err.message);
                    lobby._starting = false;
                    lobby.status = 'waiting';
                    return socket.emit('lobby-error', 'Failed to generate questions. Please try again.');
                }
            }
            // Increment daily counter for non-Diamond (Diamond already incremented in pre-gen)
            if (!currentUser.isDiamondPro) {
                incrementDailyLimit(currentUser.id, 'aiGen');
            }
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

        // Check daily AI gen limit
        const dailySoloRl = checkDailyLimit(currentUser.id, currentUser.isDiamondPro, 'aiGen');
        if (dailySoloRl.limited) {
            const msg = currentUser.isDiamondPro
                ? 'You\'ve reached your 60 daily AI game generations. Resets tomorrow.'
                : `Free accounts get 15 AI game generations per day (${dailySoloRl.remaining} remaining). Upgrade to Diamond Pro for 60.`;
            return socket.emit('game-error', msg);
        }

        // Check AI rate limit
        const rl = checkAIRateLimit(currentUser.id);
        if (rl.limited) {
            const msg = rl.reason === 'global'
                ? 'Server is busy — too many games being generated right now. Try again in a few minutes.'
                : 'You\'ve generated too many games recently. Please wait a couple of minutes.';
            return socket.emit('game-error', msg);
        }

        socket.emit('solo-generating', { topic: cleanTopic });

        let questions;
        try {
            questions = await generateQuestions(cleanTopic, qCount);
        } catch (err) {
            console.error('Solo question generation failed:', err.message);
            return socket.emit('game-error', 'Failed to generate questions. Please try again.');
        }
        incrementDailyLimit(currentUser.id, 'aiGen');
        const gameId = uuidv4();

        const game = {
            id: gameId,
            type: 'solo',
            topic: cleanTopic,
            players: [{ userId: currentUser.id, username: currentUser.username, photoURL: currentUser.photoURL || null, socketId: socket.id, score: 0, answers: [] }],
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
    socket.on('preset-start', async ({ presetId, topic }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const now = Date.now();
        if (currentUser._lastGameStart && now - currentUser._lastGameStart < 5000) return;
        currentUser._lastGameStart = now;

        if (typeof presetId !== 'string') return;
        const preset = PRESET_QUESTIONS[presetId];
        if (!preset) return socket.emit('game-error', 'Invalid preset');

        const cleanTopic = topic ? sanitizeText(topic, 100) : '';
        let pool = [...preset.questions];
        let topicMatched = false;

        // Keyword filtering if a search term was provided (instant, no AI call)
        if (cleanTopic) {
            const matchingIndices = filterQuestionsByKeyword(preset.questions, cleanTopic, 30);
            if (matchingIndices.length >= 3) {
                pool = matchingIndices.map(i => preset.questions[i]);
                topicMatched = true;
            } else {
                socket.emit('preset-topic-fallback');
            }
        }

        const shuffled = pool.sort(() => Math.random() - 0.5);
        // Non-Diamond users get 50% of preset questions
        const allPreset = currentUser.isDiamondPro ? shuffled : shuffled.slice(0, Math.ceil(shuffled.length / 2));
        const picked = allPreset.slice(0, 3);

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

        const timeLimit = presetId === 'math' ? 120 : 30;
        const topicLabel = (cleanTopic && topicMatched)
            ? `📚 ${preset.name} — ${cleanTopic}`
            : `📚 ${preset.name}`;

        // Create a solo game directly instead of a public lobby
        const gameId = uuidv4();

        const game = {
            id: gameId,
            type: 'solo',
            topic: topicLabel,
            players: [{ userId: currentUser.id, username: currentUser.username, photoURL: currentUser.photoURL || null, socketId: socket.id, score: 0, answers: [] }],
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
            players: [{ userId: currentUser.id, username: currentUser.username, photoURL: currentUser.photoURL || null, socketId: socket.id, score: 0, answers: [] }],
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
            players: [{ userId: currentUser.id, username: currentUser.username, photoURL: currentUser.photoURL || null, socketId: socket.id, score: 0, answers: [], ready: true }],
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

    // ── Redemption Quiz — Solo (questions already generated by REST API) ──
    socket.on('redemption-start', ({ questions, timeLimit, topic }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const now = Date.now();
        if (currentUser._lastGameStart && now - currentUser._lastGameStart < 5000) return;
        currentUser._lastGameStart = now;

        if (!Array.isArray(questions) || questions.length === 0) {
            return socket.emit('game-error', 'No questions provided');
        }

        const rawTime = parseInt(timeLimit, 10);
        const tLimit = rawTime === 0 ? 0 : validateInt(timeLimit, 5, 30, 15);
        const cleanTopic = sanitizeText(topic, 100) || '🔄 Redemption Quiz';
        const gameId = uuidv4();

        const game = {
            id: gameId,
            type: 'solo',
            topic: `🔄 ${cleanTopic}`,
            players: [{ userId: currentUser.id, username: currentUser.username, photoURL: currentUser.photoURL || null, socketId: socket.id, score: 0, answers: [] }],
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

    // ── Custom Quiz — Solo or Lobby (user-written questions) ─────────
    socket.on('custom-quiz-start', ({ questions, timeLimit, topic, mode, maxPlayers, isPublic }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const now = Date.now();
        if (currentUser._lastGameStart && now - currentUser._lastGameStart < 3000) return;
        currentUser._lastGameStart = now;

        if (!Array.isArray(questions) || questions.length < 2) {
            return socket.emit('game-error', 'Need at least 2 questions');
        }

        const cleanTopic = sanitizeText(topic, 100) || 'Custom Quiz';
        const rawTime = parseInt(timeLimit, 10);
        const tLimit = rawTime === 0 ? 0 : validateInt(timeLimit, 5, 120, 15);

        if (mode === 'solo') {
            return socket.emit('game-error', 'Solo practice is not available for custom quizzes — you already know the answers!');
        }

        const lobbyId = uuidv4();
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const lobby = {
            id: lobbyId,
            inviteCode,
            topic: `✏️ ${cleanTopic}`,
            isPublic: isPublic !== false,
            ranked: false,
            hostId: currentUser.id,
            hostUsername: currentUser.username,
            maxPlayers: validateInt(maxPlayers, 2, 8, 2),
            questionCount: questions.length,
            timeLimit: tLimit || 15,
            players: [{ userId: currentUser.id, username: currentUser.username, photoURL: currentUser.photoURL || null, socketId: socket.id, score: 0, answers: [], ready: true }],
            presetQuestions: questions.slice(0, 30),
            status: 'waiting',
            createdAt: Date.now(),
            expiresAt: Date.now() + 15 * 60 * 1000,
        };
        db.lobbies.set(lobbyId, lobby);
        socket.join(lobbyId);
        socket.emit('lobby-created', { lobbyId, inviteCode, lobby });
        io.emit('lobbies-updated');
    });
};
