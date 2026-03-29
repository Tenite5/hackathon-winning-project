/**
 * @file db/store.js
 * @description Hybrid data store — in-memory Maps for fast access, MongoDB for persistence.
 *
 * Persistent (MongoDB-backed): users, sessions, messages, wrongAnswers
 * Ephemeral (memory-only):     games, lobbies, tournaments, quickQueue, challenges, globalChat
 */

'use strict';

const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

// Mongoose models
const UserModel = require('./models/User');
const SessionModel = require('./models/Session');
const MessageThreadModel = require('./models/Message');
const WrongAnswerModel = require('./models/WrongAnswer');

// Bot profiles and question pool
const BOT_PROFILES = require('../data/botProfiles');
const { loadPoolsFromDB, warmUpPools } = require('../services/questionPool');

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
    async init() {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URI is not set in .env');

        await mongoose.connect(uri);
        console.log('✅ Connected to MongoDB');

        // Load users — skip bots (they'll be re-seeded fresh below)
        const users = await UserModel.find().lean();
        for (const u of users) {
            if (u.isBot) continue;  // old bots get wiped + re-seeded below
            db.users.set(u._id, {
                id: u._id,
                username: u.username,
                passwordHash: u.passwordHash || '',
                googleId: u.googleId || '',
                firebaseUid: u.firebaseUid || '',
                email: u.email || '',
                photoURL: u.photoURL || '',
                needsSetup: !!u.needsSetup,
                elo: u.elo,
                stats: u.stats || { totalWins: 0, totalLosses: 0, totalAnswers: 0, correctAnswers: 0, gamesPlayed: 0, categories: {} },
                friends: u.friends || [],
                friendRequests: u.friendRequests || [],
                bio: u.bio || '',
                matchHistory: u.matchHistory || [],
                eloHistory: u.eloHistory || [],
                notifications: u.notifications || [],
                points: u.points || 0,
                purchasedItems: u.purchasedItems || [],
                activeFrame: u.activeFrame || null,
                isDiamondPro: !!u.isDiamondPro,
                diamondSince: u.diamondSince || 0,
                diamondExpiresAt: u.diamondExpiresAt || 0,
                diamondOrderId: u.diamondOrderId || '',
                paypalSubscriptionId: u.paypalSubscriptionId || '',
                bioCharacter: u.bioCharacter || 'default',
                online: false,
                socketId: null,
                createdAt: u.createdAt,
            });
        }
        console.log(`   Loaded ${db.users.size} users`);

        // ── Seed / refresh bots ───────────────────────────────────────────
        // Wipe ALL old bots from MongoDB, then seed fresh
        await UserModel.deleteMany({ isBot: true }).catch(() => {});

        for (const profile of BOT_PROFILES) {
            const botId = randomUUID();
            const botUser = {
                id: botId,
                username: profile.username,
                _baseName: profile._baseName,
                nameVariants: profile.nameVariants,
                passwordHash: '',
                googleId: '',
                firebaseUid: '',
                email: '',
                photoURL: profile.photoURL,
                needsSetup: false,
                elo: profile.elo,
                stats: profile.stats,
                friends: [],
                friendRequests: [],
                bio: profile.bio || '',
                matchHistory: [],
                eloHistory: [],
                notifications: [],
                isDiamondPro: profile.isDiamondPro,
                diamondSince: 0,
                diamondOrderId: '',
                bioCharacter: profile.bioCharacter || 'default',
                isBot: true,
                online: false,
                socketId: null,
                createdAt: Date.now(),
            };
            db.users.set(botId, botUser);
            UserModel.create({
                _id: botId,
                ...Object.fromEntries(Object.entries(botUser).filter(([k]) => !['online', 'socketId', '_baseName', 'nameVariants'].includes(k))),
            }).catch(err => console.error('Bot seed error:', err.message));
        }
        console.log(`   Bots loaded: ${[...db.users.values()].filter(u => u.isBot).length}`);

        // ── Load question pools from MongoDB ─────────────────────────────
        await loadPoolsFromDB();

        // ── Expire lapsed Diamond Pro subscriptions on startup
        const now = Date.now();
        for (const [, user] of db.users) {
            if (user.isDiamondPro && user.diamondExpiresAt && user.diamondExpiresAt < now) {
                user.isDiamondPro = false;
                user.diamondExpiresAt = 0;
                user.paypalSubscriptionId = '';
                db.saveUser(user.id);
                console.log(`   ✦ Diamond Pro expired for ${user.username}`);
            }
        }

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
        const u = db.users.get(userId);
        if (!u) return;
        const doc = {
            _id: u.id,
            username: u.username,
            passwordHash: u.passwordHash || '',
            googleId: u.googleId || '',
            firebaseUid: u.firebaseUid || '',
            email: u.email || '',
            photoURL: u.photoURL || '',
            needsSetup: !!u.needsSetup,
            elo: u.elo,
            stats: u.stats,
            friends: u.friends,
            friendRequests: u.friendRequests,
            bio: u.bio,
            matchHistory: u.matchHistory || [],
            eloHistory: u.eloHistory || [],
            notifications: u.notifications || [],
            points: u.points || 0,
            purchasedItems: u.purchasedItems || [],
            activeFrame: u.activeFrame || null,
            isDiamondPro: !!u.isDiamondPro,
            diamondSince: u.diamondSince || 0,
            diamondExpiresAt: u.diamondExpiresAt || 0,
            diamondOrderId: u.diamondOrderId || '',
            paypalSubscriptionId: u.paypalSubscriptionId || '',
            bioCharacter: u.bioCharacter || 'default',
            createdAt: u.createdAt,
        };
        UserModel.findByIdAndUpdate(u.id, doc, { upsert: true, returnDocument: 'after' })
            .catch(err => console.error('saveUser error:', err.message));
    },

    /** Persist a session token. */
    saveSession(token, userId) {
        SessionModel.findByIdAndUpdate(token, { _id: token, userId }, { upsert: true, returnDocument: 'after' })
            .catch(err => console.error('saveSession error:', err.message));
    },

    /** Delete a session token from MongoDB. */
    deleteSession(token) {
        SessionModel.findByIdAndDelete(token)
            .catch(err => console.error('deleteSession error:', err.message));
    },

    /** Persist a message thread. */
    saveMessages(key) {
        const msgs = db.messages.get(key);
        if (!msgs) return;
        MessageThreadModel.findByIdAndUpdate(key, { _id: key, messages: msgs }, { upsert: true, returnDocument: 'after' })
            .catch(err => console.error('saveMessages error:', err.message));
    },

    /** Persist a user's wrong-answer log. */
    saveWrongAnswers(userId) {
        const entries = db.wrongAnswers.get(userId);
        if (!entries) return;
        WrongAnswerModel.findByIdAndUpdate(userId, { _id: userId, entries }, { upsert: true, returnDocument: 'after' })
            .catch(err => console.error('saveWrongAnswers error:', err.message));
    },
};

module.exports = db;
