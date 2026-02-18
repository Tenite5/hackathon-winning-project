/**
 * @file db/store.js
 * @description In-memory data store — single source of truth for all application state.
 */

'use strict';

const db = {
    users: new Map(),          // id -> { id, username, passwordHash, elo, rank, stats, friends, bio, online, socketId }
    sessions: new Map(),       // sessionToken -> userId
    games: new Map(),          // gameId -> { ...gameState }
    lobbies: new Map(),        // lobbyId -> { ...lobbyState }
    tournaments: new Map(),    // tournamentId -> { ...tournamentState }
    quickQueue: [],            // [{ userId, socketId, joinedAt }]
    messages: new Map(),       // `${u1}_${u2}` -> [{ from, to, text, ts }]
    globalChat: [],            // [{ userId, username, text, ts }]
    wrongAnswers: new Map(),   // userId -> [ { question, topic, ... } ]
    challenges: new Map(),     // challengeId -> { id, fromId, fromUsername, toId, topic, createdAt }
};

module.exports = db;
