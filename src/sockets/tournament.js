/**
 * @file sockets/tournament.js
 * @description Socket handlers for tournament creation, joining, starting, and round progression.
 */

'use strict';

const { randomUUID: uuidv4 } = require('crypto');
const db = require('../db/store');
const { generateQuestions } = require('../services/ai');
const { startGameQuestion } = require('../services/gameEngine');
const { sanitizeText, validateInt } = require('../middleware/validate');

/**
 * Check if all matches in the current round are finished.
 * If yes, advance to the next round or declare the tournament winner.
 */
async function checkRoundCompletion(tournamentId, io) {
    const t = db.tournaments.get(tournamentId);
    if (!t || t.status !== 'playing') return;

    const currentBracket = t.brackets[t.brackets.length - 1];
    if (!currentBracket) return;

    // Check if all matches in the current round have a winner
    const allDone = currentBracket.matches.every(m => m.winnerId !== null);
    if (!allDone) return;

    // Collect winners
    const winners = currentBracket.matches
        .map(m => {
            const player = t.players.find(p => p.userId === m.winnerId);
            return player || { userId: m.winnerId, username: 'Unknown', socketId: null };
        })
        .filter(Boolean);

    // If only one winner, tournament is over
    if (winners.length <= 1) {
        t.status = 'finished';
        io.to(`tournament-${tournamentId}`).emit('tournament-finished', {
            tournamentId,
            winner: winners[0] || null,
            brackets: t.brackets,
        });
        io.emit('tournaments-updated');
        return;
    }

    // Create next round
    t.currentRound++;
    const pairs = [];
    for (let i = 0; i < winners.length; i += 2) {
        if (winners[i + 1]) {
            pairs.push([winners[i], winners[i + 1]]);
        } else {
            // Bye — auto-advance
            pairs.push([winners[i], null]);
        }
    }

    t.brackets.push({
        round: t.currentRound,
        matches: pairs.map((pair, idx) => ({
            id: idx,
            players: pair,
            winnerId: pair[1] === null ? pair[0].userId : null,
            gameId: null,
        })),
    });

    io.to(`tournament-${tournamentId}`).emit('tournament-round', {
        tournamentId,
        round: t.currentRound,
        brackets: t.brackets,
    });

    // Start matches for the new round
    const newBracket = t.brackets[t.brackets.length - 1];
    for (const match of newBracket.matches) {
        if (match.winnerId) continue;

        try {
            const questions = await generateQuestions(t.topic, 5);
            const gameId = uuidv4();

            const game = {
                id: gameId,
                type: 'tournament',
                tournamentId,
                matchIndex: match.id,
                roundIndex: t.currentRound,
                topic: t.topic,
                players: match.players.map(p => ({ ...p, score: 0, answers: [] })),
                questions,
                currentQuestion: 0,
                timeLimit: 10,
                questionStartTime: null,
                status: 'playing',
                chat: [],
                createdAt: Date.now(),
            };

            db.games.set(gameId, game);
            match.gameId = gameId;

            match.players.forEach(p => {
                if (p && p.socketId) {
                    const s = io.sockets.sockets.get(p.socketId);
                    if (s) s.join(gameId);
                }
            });

            setTimeout(() => startGameQuestion(gameId, io), 3000);
        } catch (err) {
            console.error('Tournament match question generation failed:', err.message);
        }
    }

    io.emit('tournaments-updated');

    // Check if all matches in new round have byes (auto-complete)
    setTimeout(() => checkRoundCompletion(tournamentId, io), 1000);
}

async function startTournament(tournamentId, io) {
    const t = db.tournaments.get(tournamentId);
    if (!t) return;

    t.status = 'playing';
    t.currentRound = 1;

    const shuffled = [...t.players].sort(() => Math.random() - 0.5);

    const pairs = [];
    for (let i = 0; i < shuffled.length; i += 2) {
        if (shuffled[i + 1]) {
            pairs.push([shuffled[i], shuffled[i + 1]]);
        } else {
            pairs.push([shuffled[i], null]);
        }
    }

    t.brackets.push({
        round: t.currentRound,
        matches: pairs.map((pair, idx) => ({
            id: idx,
            players: pair,
            winnerId: pair[1] === null ? pair[0].userId : null,
            gameId: null,
        })),
    });

    io.to(`tournament-${tournamentId}`).emit('tournament-round', { tournamentId, round: t.currentRound, brackets: t.brackets });

    for (const match of t.brackets[0].matches) {
        if (match.winnerId) continue;

        try {
            const questions = await generateQuestions(t.topic, 5);
            const gameId = uuidv4();

            const game = {
                id: gameId,
                type: 'tournament',
                tournamentId,
                matchIndex: match.id,
                roundIndex: 1,
                topic: t.topic,
                players: match.players.map(p => ({ ...p, score: 0, answers: [] })),
                questions,
                currentQuestion: 0,
                timeLimit: 10,
                questionStartTime: null,
                status: 'playing',
                chat: [],
                createdAt: Date.now(),
            };

            db.games.set(gameId, game);
            match.gameId = gameId;

            match.players.forEach(p => {
                if (p && p.socketId) {
                    const s = io.sockets.sockets.get(p.socketId);
                    if (s) s.join(gameId);
                }
            });

            setTimeout(() => startGameQuestion(gameId, io), 3000);
        } catch (err) {
            console.error('Tournament match question generation failed:', err.message);
        }
    }

    io.emit('tournaments-updated');

    // Check if all matches have byes (auto-complete)
    setTimeout(() => checkRoundCompletion(tournamentId, io), 1000);
}

module.exports = function (io, socket, getCurrentUser) {

    socket.on('create-tournament', ({ topic, maxPlayers }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;

        const tId = uuidv4();
        const max = [8, 16].includes(maxPlayers) ? maxPlayers : 8;

        const tournament = {
            id: tId,
            topic: sanitizeText(topic, 100) || 'General Knowledge',
            hostId: currentUser.id,
            hostUsername: currentUser.username,
            maxPlayers: max,
            players: [{ userId: currentUser.id, username: currentUser.username, socketId: socket.id }],
            brackets: [],
            currentRound: 0,
            status: 'waiting',
            createdAt: Date.now(),
            expiresAt: Date.now() + 15 * 60 * 1000,
        };

        db.tournaments.set(tId, tournament);
        socket.join(`tournament-${tId}`);
        socket.emit('tournament-created', tournament);
        io.emit('tournaments-updated');
    });

    socket.on('join-tournament', ({ tournamentId }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        if (typeof tournamentId !== 'string') return;
        const t = db.tournaments.get(tournamentId);
        if (!t || t.status !== 'waiting') return socket.emit('tournament-error', 'Tournament not available');
        if (t.players.length >= t.maxPlayers) return socket.emit('tournament-error', 'Tournament full');
        if (t.players.find(p => p.userId === currentUser.id)) return socket.emit('tournament-error', 'Already joined');

        t.players.push({ userId: currentUser.id, username: currentUser.username, socketId: socket.id });
        socket.join(`tournament-${tournamentId}`);
        io.to(`tournament-${tournamentId}`).emit('tournament-updated', t);
        io.emit('tournaments-updated');

        if (t.players.length >= t.maxPlayers) {
            startTournament(tournamentId, io);
        }
    });

    socket.on('start-tournament', ({ tournamentId }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        if (typeof tournamentId !== 'string') return;
        const t = db.tournaments.get(tournamentId);
        if (!t || t.hostId !== currentUser.id) return;
        if (t.players.length < 2) return socket.emit('tournament-error', 'Need at least 2 players');
        startTournament(tournamentId, io);
    });
};

// Export checkRoundCompletion for use in gameEngine.js when a tournament match ends
module.exports.checkRoundCompletion = checkRoundCompletion;
