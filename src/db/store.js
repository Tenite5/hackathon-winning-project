/**
 * @file db/store.js
 * @description Hybrid data store — in-memory Maps for fast access, MongoDB for persistence.
 *
 * Persistent (MongoDB-backed): users, sessions, messages, wrongAnswers
 * Ephemeral (memory-only):     games, lobbies, tournaments, quickQueue, challenges, globalChat
 */

'use strict';

const mongoose = require('mongoose');

// Mongoose models
const UserModel         = require('./models/User');
const SessionModel      = require('./models/Session');
const MessageThreadModel = require('./models/Message');
const WrongAnswerModel  = require('./models/WrongAnswer');

const db = {
    // ── Persistent (loaded from MongoDB on init, saved on mutation) ──
    users: new Map(),          // id -> { id, username, passwordHash, elo, stats, friends, friendRequests, bio, online, socketId, ... }
    sessions: new Map(),       // sessionToken -> userId
    messages: new Map(),       // `${u1}_${u2}` -> [{ from, fromUsername, to, text, ts }]
    wrongAnswers: new Map(),   // userId -> [ { id, question, topic, ... } ]

    // ── Ephemeral (memory-only, never persisted) ─────────────────────
    games: new Map(),          // gameId -> { ...gameState }
    lobbies: new Map(),        // lobbyId -> { ...lobbyState }
    tournaments: new Map(),    // tournamentId -> { ...tournamentState }
    quickQueue: [],            // [{ userId, socketId, joinedAt }]
    globalChat: [],            // [{ userId, username, text, ts }]
    challenges: new Map(),     // challengeId -> { id, fromId, fromUsername, toId, topic, createdAt }

    // ═══════════════════════════════════════════════════════════════
    // INIT — connect to MongoDB and hydrate Maps
    // ═══════════════════════════════════════════════════════════════
    mongoConnected: false,

    async init() {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            console.warn('⚠️  MONGODB_URI not set — running in memory-only mode (data will NOT persist across restarts)');
            return;
        }

        try {
            await mongoose.connect(uri);
            db.mongoConnected = true;
            console.log('✅ Connected to MongoDB');
        } catch (err) {
            console.error('⚠️  MongoDB connection failed — running in memory-only mode:', err.message);
            return;
        }

        // Load users
        const users = await UserModel.find().lean();
        for (const u of users) {
            db.users.set(u._id, {
                id: u._id,
                username: u.username,
                passwordHash: u.passwordHash,
                elo: u.elo,
                stats: u.stats || { totalWins: 0, totalLosses: 0, totalAnswers: 0, correctAnswers: 0, gamesPlayed: 0, categories: {} },
                friends: u.friends || [],
                friendRequests: u.friendRequests || [],
                bio: u.bio || '',
                online: false,
                socketId: null,
                createdAt: u.createdAt,
            });
        }
        console.log(`   Loaded ${db.users.size} users`);

        // Load sessions
        const sessions = await SessionModel.find().lean();
        for (const s of sessions) {
            db.sessions.set(s._id, s.userId);
        }
        console.log(`   Loaded ${db.sessions.size} sessions`);

        // Load message threads
        const threads = await MessageThreadModel.find().lean();
        for (const t of threads) {
            db.messages.set(t._id, t.messages || []);
        }
        console.log(`   Loaded ${db.messages.size} message threads`);

        // Load wrong-answer logs
        const wrongLogs = await WrongAnswerModel.find().lean();
        for (const w of wrongLogs) {
            db.wrongAnswers.set(w._id, w.entries || []);
        }
        console.log(`   Loaded ${db.wrongAnswers.size} wrong-answer logs`);
    },

    // ═══════════════════════════════════════════════════════════════
    // PERSISTENCE HELPERS — fire-and-forget (errors are logged)
    // ═══════════════════════════════════════════════════════════════

    /** Persist a user to MongoDB. Call after creating or mutating a user object. */
    saveUser(userId) {
        if (!db.mongoConnected) return;
        const u = db.users.get(userId);
        if (!u) return;
        const doc = {
            _id: u.id,
            username: u.username,
            passwordHash: u.passwordHash,
            elo: u.elo,
            stats: u.stats,
            friends: u.friends,
            friendRequests: u.friendRequests,
            bio: u.bio,
            createdAt: u.createdAt,
        };
        UserModel.findByIdAndUpdate(u.id, doc, { upsert: true, returnDocument: 'after' })
            .catch(err => console.error('saveUser error:', err.message));
    },

    /** Persist a session token. */
    saveSession(token, userId) {
        if (!db.mongoConnected) return;
        SessionModel.findByIdAndUpdate(token, { _id: token, userId }, { upsert: true, returnDocument: 'after' })
            .catch(err => console.error('saveSession error:', err.message));
    },

    /** Delete a session token from MongoDB. */
    deleteSession(token) {
        if (!db.mongoConnected) return;
        SessionModel.findByIdAndDelete(token)
            .catch(err => console.error('deleteSession error:', err.message));
    },

    /** Persist a message thread. */
    saveMessages(key) {
        if (!db.mongoConnected) return;
        const msgs = db.messages.get(key);
        if (!msgs) return;
        MessageThreadModel.findByIdAndUpdate(key, { _id: key, messages: msgs }, { upsert: true, returnDocument: 'after' })
            .catch(err => console.error('saveMessages error:', err.message));
    },

    /** Persist a user's wrong-answer log. */
    saveWrongAnswers(userId) {
        if (!db.mongoConnected) return;
        const entries = db.wrongAnswers.get(userId);
        if (!entries) return;
        WrongAnswerModel.findByIdAndUpdate(userId, { _id: userId, entries }, { upsert: true, returnDocument: 'after' })
            .catch(err => console.error('saveWrongAnswers error:', err.message));
    },
};

module.exports = db;
