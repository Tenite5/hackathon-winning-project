/**
 * @file services/botLobbies.js
 * @description Maintains 5-7 bot-hosted custom lobbies with pre-generated questions.
 *
 * - Bots create public lobbies on interesting topics
 * - Questions come from: (1) cached user-generated questions, (2) question pool, (3) live AI generation
 * - When a lobby is played or expires, a new one replaces it
 * - User-generated questions are saved to a cache for later reuse
 * - Bot lobbies simulate activity: topics rotate, fake player counts fluctuate
 */

'use strict';

const { randomUUID } = require('crypto');
const db = require('../db/store');
const { generateQuestions } = require('./ai');
const QuestionCacheModel = require('../db/models/QuestionCache');

// ── Bot lobby topics — interesting, diverse, things people would click on ────
const BOT_LOBBY_TOPICS = [
    'Space Exploration & NASA',
    'Marvel vs DC Superheroes',
    'World Cup Football History',
    'Famous Inventions & Inventors',
    'Ancient Civilizations',
    'Video Game History',
    'Famous Movie Quotes',
    'Human Body & Medicine',
    'Ocean Life & Deep Sea',
    'Mythology: Greek, Norse & Egyptian',
    'World Geography Capitals',
    'Internet Culture & Memes',
    'Greatest Athletes of All Time',
    'Dinosaurs & Prehistoric Life',
    'Famous Scientists',
    'Music Legends & Iconic Albums',
    'Cars & Motorsport',
    'Artificial Intelligence & Robots',
    'Psychology & Human Behavior',
    'Cryptography & Codes',
    'Famous Battles in History',
    'Extreme Weather & Natural Disasters',
    'World Cuisines & Food Origins',
    'Classic Literature & Authors',
    'The Solar System & Planets',
    'Olympic Games History',
    'Conspiracy Theories Debunked',
    'Weird Animal Facts',
    'History of the Internet',
    'Unsolved Mysteries of Science',
];

const TARGET_BOT_LOBBIES = 6;    // maintain this many bot lobbies
let _isReplenishing = false;     // guard against concurrent replenish runs
let _consecutiveFailures = 0;    // track AI failures to back off
const LOBBY_LIFETIME = 3 * 60 * 1000;  // 3 minutes before topic rotation
const QUESTION_COUNT = 7;
const TIME_LIMIT = 12;
const PLAYER_SHUFFLE_INTERVAL = 20 * 1000; // shuffle fake players every 20s
const TOPIC_ROTATE_INTERVAL = 45 * 1000;   // rotate 1-2 lobby topics every 45s

// ── Question cache (in-memory mirror of MongoDB) ────────────────────────────
const questionCache = new Map(); // topic -> [{questions, createdAt}]

async function loadQuestionCache() {
    try {
        const docs = await QuestionCacheModel.find().lean();
        for (const doc of docs) {
            if (doc.sets && doc.sets.length) {
                questionCache.set(doc._id, doc.sets);
            }
        }
        console.log(`   Loaded ${questionCache.size} question cache entries for bot lobbies`);
    } catch (err) {
        console.error('Failed to load question cache:', err.message);
    }
}

/** Save a set of questions to the cache for a topic (called after user games finish). */
function cacheQuestions(topic, questions) {
    if (!topic || !questions || questions.length < 3) return;

    // Normalize topic for caching
    const key = topic.replace(/^📄\s*|^📚\s*/, '').trim().toLowerCase();
    if (key.length < 3) return;

    const sets = questionCache.get(key) || [];
    sets.push({ questions, createdAt: Date.now() });

    // Keep max 5 sets per topic
    if (sets.length > 5) sets.shift();
    questionCache.set(key, sets);

    // Persist to MongoDB (fire-and-forget)
    QuestionCacheModel.findByIdAndUpdate(
        key,
        { _id: key, topic: key, sets, updatedAt: new Date() },
        { upsert: true }
    ).catch(() => {});
}

/** Get cached questions for a topic, or null if none available. */
function getCachedQuestions(topic) {
    const key = topic.toLowerCase();
    const sets = questionCache.get(key);
    if (!sets || !sets.length) return null;

    // Use the freshest set
    sets.sort((a, b) => b.createdAt - a.createdAt);
    return sets[0].questions;
}

/** Pick a random bot user to be the host. */
function pickBotHost() {
    const bots = [...db.users.values()].filter(u => u.isBot);
    if (!bots.length) return null;

    // Pick bots that aren't already hosting a lobby
    const hostingIds = new Set();
    for (const [, lobby] of db.lobbies) {
        if (lobby._isBotLobby) hostingIds.add(lobby.hostId);
    }
    const available = bots.filter(b => !hostingIds.has(b.id));
    if (!available.length) return bots[Math.floor(Math.random() * bots.length)];
    return available[Math.floor(Math.random() * available.length)];
}

/** Pick a random bot that is NOT already in this lobby. */
function pickFillerBot(lobby) {
    const bots = [...db.users.values()].filter(u => u.isBot);
    if (!bots.length) return null;
    const inLobby = new Set(lobby.players.map(p => p.userId));
    const available = bots.filter(b => !inLobby.has(b.id));
    if (!available.length) return null;
    return available[Math.floor(Math.random() * available.length)];
}

/** Pick a topic not currently used by another bot lobby. */
function pickTopic() {
    const usedTopics = new Set();
    for (const [, lobby] of db.lobbies) {
        if (lobby._isBotLobby) usedTopics.add(lobby.topic);
    }
    const available = BOT_LOBBY_TOPICS.filter(t => !usedTopics.has(t));
    if (!available.length) return BOT_LOBBY_TOPICS[Math.floor(Math.random() * BOT_LOBBY_TOPICS.length)];
    return available[Math.floor(Math.random() * available.length)];
}

/** Check if a lobby has any real (non-bot) players. */
function hasRealPlayers(lobby) {
    return lobby.players.some(p => {
        const u = db.users.get(p.userId);
        return u && !u.isBot;
    });
}

/** Remove all fake filler bots from a lobby (keep only the host bot). */
function stripFillerBots(lobby) {
    lobby.players = lobby.players.filter(p => p.userId === lobby.hostId);
}

/** Create a single bot lobby with pre-generated questions. Returns false on AI failure. */
async function createBotLobby(io) {
    const bot = pickBotHost();
    if (!bot) return;

    const topic = pickTopic();
    let questions = getCachedQuestions(topic);

    if (!questions) {
        try {
            questions = await generateQuestions(topic, QUESTION_COUNT);
            _consecutiveFailures = 0; // reset on success
        } catch (err) {
            _consecutiveFailures++;
            console.warn(`Bot lobby question generation failed (${_consecutiveFailures} consecutive):`, err.message);
            return false;
        }
    } else {
        _consecutiveFailures = 0; // cached questions count as success
    }

    if (!questions || questions.length < 3) return;

    const lobbyId = randomUUID();
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Start with 1-2 fake players for variety
    const initialPlayers = [{ userId: bot.id, username: bot.username, socketId: null, score: 0, answers: [], ready: true }];
    if (Math.random() < 0.5) {
        const filler = pickFillerBot({ players: initialPlayers });
        if (filler) {
            initialPlayers.push({ userId: filler.id, username: filler.username, socketId: null, score: 0, answers: [], ready: true, _isFiller: true });
        }
    }

    const lobby = {
        id: lobbyId,
        inviteCode,
        topic,
        isPublic: true,
        ranked: false,
        hostId: bot.id,
        hostUsername: bot.username,
        maxPlayers: 4,
        questionCount: questions.length,
        timeLimit: TIME_LIMIT,
        players: initialPlayers,
        presetQuestions: questions,
        status: 'waiting',
        createdAt: Date.now(),
        expiresAt: Date.now() + LOBBY_LIFETIME,
        _isBotLobby: true,
    };

    db.lobbies.set(lobbyId, lobby);
    if (io) io.emit('lobbies-updated');
}

/** Count current bot lobbies. */
function countBotLobbies() {
    let count = 0;
    for (const [, lobby] of db.lobbies) {
        if (lobby._isBotLobby && lobby.status === 'waiting') count++;
    }
    return count;
}

/** Replenish bot lobbies up to TARGET_BOT_LOBBIES. */
async function replenishBotLobbies(io) {
    if (_isReplenishing) return; // prevent concurrent runs stacking AI calls
    _isReplenishing = true;

    try {
        // If AI has been failing repeatedly, back off to avoid hammering
        if (_consecutiveFailures >= 3) {
            console.warn(`Bot lobby replenish skipped — ${_consecutiveFailures} consecutive AI failures, backing off`);
            return;
        }

        const current = countBotLobbies();
        const needed = TARGET_BOT_LOBBIES - current;
        if (needed <= 0) return;

        for (let i = 0; i < needed; i++) {
            // Stagger creation to avoid hammering AI
            await new Promise(r => setTimeout(r, i * 3000));
            const ok = await createBotLobby(io);
            if (ok === false) {
                // AI failure — stop trying to create more this cycle
                break;
            }
        }
    } finally {
        _isReplenishing = false;
    }
}

/**
 * Shuffle fake player counts on bot lobbies.
 * Purely in-memory — no network, no AI, no DB writes.
 */
function shuffleFakePlayers(io) {
    let changed = false;
    for (const [, lobby] of db.lobbies) {
        if (!lobby._isBotLobby || lobby.status !== 'waiting') continue;
        if (hasRealPlayers(lobby)) continue; // don't mess with lobbies that have real users

        const currentFake = lobby.players.filter(p => p._isFiller).length;
        // Target: 0-2 filler bots (host is always there, so total 1-3)
        const target = Math.floor(Math.random() * 3); // 0, 1, or 2

        if (target > currentFake) {
            // Add filler bots
            for (let i = currentFake; i < target; i++) {
                const filler = pickFillerBot(lobby);
                if (filler) {
                    lobby.players.push({ userId: filler.id, username: filler.username, socketId: null, score: 0, answers: [], ready: true, _isFiller: true });
                    changed = true;
                }
            }
        } else if (target < currentFake) {
            // Remove some filler bots
            let toRemove = currentFake - target;
            lobby.players = lobby.players.filter(p => {
                if (toRemove > 0 && p._isFiller) { toRemove--; return false; }
                return true;
            });
            changed = true;
        }
    }
    if (changed && io) io.emit('lobbies-updated');
}

/**
 * Rotate topics on 1-2 bot lobbies that have been sitting idle.
 * Uses cached questions only — no AI calls, no network cost.
 * If no cached questions are available for the new topic, the lobby is
 * simply deleted and replenishBotLobbies will recreate it later.
 */
function rotateTopics(io) {
    const botLobbies = [];
    for (const [, lobby] of db.lobbies) {
        if (lobby._isBotLobby && lobby.status === 'waiting' && !hasRealPlayers(lobby)) {
            botLobbies.push(lobby);
        }
    }
    if (!botLobbies.length) return;

    // Sort oldest first — rotate the stalest ones
    botLobbies.sort((a, b) => a.createdAt - b.createdAt);

    // Rotate 1-2 lobbies per tick
    const rotateCount = Math.min(1 + Math.floor(Math.random() * 2), botLobbies.length);

    let changed = false;
    for (let i = 0; i < rotateCount; i++) {
        const lobby = botLobbies[i];
        // Only rotate if older than 90 seconds (avoid thrashing brand new lobbies)
        if (Date.now() - lobby.createdAt < 90 * 1000) continue;

        const newTopic = pickTopic();
        const cachedQ = getCachedQuestions(newTopic);

        if (cachedQ && cachedQ.length >= 3) {
            // Swap topic and questions in-place — zero cost
            lobby.topic = newTopic;
            lobby.presetQuestions = cachedQ;
            lobby.questionCount = cachedQ.length;
            lobby.createdAt = Date.now();
            lobby.expiresAt = Date.now() + LOBBY_LIFETIME;
            lobby.inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            // Refresh host bot
            const newHost = pickBotHost();
            if (newHost) {
                lobby.hostId = newHost.id;
                lobby.hostUsername = newHost.username;
                // Rebuild players (host + random fillers)
                stripFillerBots(lobby);
                lobby.players = [{ userId: newHost.id, username: newHost.username, socketId: null, score: 0, answers: [], ready: true }];
            }
            changed = true;
        } else {
            // No cached questions — just delete and let replenish handle it
            db.lobbies.delete(lobby.id);
            changed = true;
        }
    }

    if (changed && io) io.emit('lobbies-updated');
}

/** Initialize bot lobbies — called after server starts and pools are warm. */
function initBotLobbies(io) {
    // Load cached questions first, then create initial lobbies
    loadQuestionCache().then(() => {
        // Stagger initial creation
        setTimeout(() => {
            replenishBotLobbies(io);
        }, 15000); // wait 15s for question pools to warm up

        // Periodic replenishment every 60s
        setInterval(() => {
            // Gradually recover from AI failure backoff (reset after ~5 min)
            if (_consecutiveFailures >= 3) {
                _consecutiveFailures = Math.max(0, _consecutiveFailures - 1);
            }
            replenishBotLobbies(io).catch(() => {});
        }, 60000);

        // Shuffle fake player counts every 20s (pure in-memory, no cost)
        setInterval(() => {
            shuffleFakePlayers(io);
        }, PLAYER_SHUFFLE_INTERVAL);

        // Rotate 1-2 lobby topics every 45s (uses cached questions, no AI)
        setInterval(() => {
            rotateTopics(io);
        }, TOPIC_ROTATE_INTERVAL);
    });
}

module.exports = {
    initBotLobbies,
    cacheQuestions,
    loadQuestionCache,
    stripFillerBots,
};
