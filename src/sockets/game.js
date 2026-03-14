/**
 * @file sockets/game.js
 * @description Socket handlers for in-game events — answers and game chat.
 */

'use strict';

const db = require('../db/store');
const { handleAnswer, handleForfeit } = require('../services/gameEngine');
const { sanitizeText, validateInt } = require('../middleware/validate');

module.exports = function (io, socket, getCurrentUser) {
    socket.on('game-answer', ({ gameId, answerIndex }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        if (typeof gameId !== 'string') return;
        const idx = validateInt(answerIndex, 0, 3, -1);
        handleAnswer(io, socket, currentUser, gameId, idx);
    });

    socket.on('game-leave', ({ gameId }) => {
        const currentUser = getCurrentUser();
        if (!currentUser || typeof gameId !== 'string') return;
        handleForfeit(io, socket, currentUser, gameId);
    });

    socket.on('game-chat', ({ gameId, text }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        if (typeof gameId !== 'string') return;
        const game = db.games.get(gameId);
        if (!game) return;
        const cleanText = sanitizeText(text, 200);
        if (!cleanText) return;
        const msg = { userId: currentUser.id, username: currentUser.username, text: cleanText, ts: Date.now() };
        game.chat.push(msg);
        io.to(gameId).emit('game-chat-msg', msg);
    });
};
