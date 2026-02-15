// ═══════════════════════════════════════════════════════════════
// QVIZIO — 1v1 Competitive Trivia Game Server
// ═══════════════════════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const { randomUUID: uuidv4 } = require('crypto');
const Groq = require('groq-sdk');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Groq AI Client ──────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'YOUR_GROQ_API_KEY_HERE' });

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY DATA STORE
// ═══════════════════════════════════════════════════════════════
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
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const RANKS = [
    { name: 'Bronze', min: 0, max: 999, color: '#cd7f32' },
    { name: 'Silver', min: 1000, max: 1199, color: '#c0c0c0' },
    { name: 'Gold', min: 1200, max: 1399, color: '#ffd700' },
    { name: 'Platinum', min: 1400, max: 1599, color: '#e5e4e2' },
    { name: 'Diamond', min: 1600, max: 1799, color: '#b9f2ff' },
    { name: 'Master', min: 1800, max: 1999, color: '#9b59b6' },
    { name: 'Grandmaster', min: 2000, max: Infinity, color: '#e74c3c' },
];

function getRank(elo) {
    return RANKS.find(r => elo >= r.min && elo <= r.max) || RANKS[0];
}

function calculateElo(winnerElo, loserElo) {
    const K = 32;
    const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    return {
        winnerNew: Math.round(winnerElo + K * (1 - expected)),
        loserNew: Math.round(loserElo + K * (0 - (1 - expected))),
    };
}

function getUserBySession(token) {
    const userId = db.sessions.get(token);
    if (!userId) return null;
    return db.users.get(userId) || null;
}

function sanitizeUser(user) {
    if (!user) return null;
    // Strip category stats — they are internal-only, revealed through AI bio
    const publicStats = {
        totalWins: user.stats.totalWins,
        totalLosses: user.stats.totalLosses,
        gamesPlayed: user.stats.gamesPlayed,
        totalAnswers: user.stats.totalAnswers,
        correctAnswers: user.stats.correctAnswers,
    };
    return {
        id: user.id,
        username: user.username,
        elo: user.elo,
        rank: getRank(user.elo),
        stats: publicStats,
        bio: user.bio,
        online: user.online,
        friends: user.friends,
    };
}

// ═══════════════════════════════════════════════════════════════
// AI QUESTION GENERATION
// ═══════════════════════════════════════════════════════════════
async function generateQuestions(topic, count = 5) {
    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: `You are a trivia question generator. Generate exactly ${count} trivia questions about the given topic. 
Return ONLY a valid JSON array with no additional text, markdown, or code blocks. Each object must have:
- "question": the question text
- "options": array of exactly 4 answer strings
- "correct": index (0-3) of the correct answer
- "difficulty": "easy", "medium", or "hard"
- "explanation": a 1-2 sentence explanation of why the correct answer is correct

Example format: [{"question":"...","options":["A","B","C","D"],"correct":0,"difficulty":"medium","explanation":"..."}]`,
                },
                {
                    role: 'user',
                    content: `Generate ${count} trivia questions about: ${topic}`,
                },
            ],
            temperature: 0.8,
            max_tokens: 4096,
        });

        const raw = completion.choices[0].message.content.trim();
        // Try to extract JSON array from the response
        let jsonStr = raw;
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) jsonStr = match[0];
        const questions = JSON.parse(jsonStr);
        return questions.slice(0, count).map(q => ({
            ...q,
            explanation: q.explanation || 'No explanation available.',
        }));
    } catch (err) {
        console.error('AI generation error:', err.message);
        // Fallback questions
        return Array.from({ length: count }, (_, i) => ({
            question: `Sample question ${i + 1} about ${topic}?`,
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correct: 0,
            difficulty: 'medium',
            explanation: 'This is a sample question.',
        }));
    }
}

async function generateBio(user) {
    try {
        const stats = user.stats;
        const cats = stats.categories || {};
        const catEntries = Object.entries(cats);

        // Build per-subject summary highlighting strengths & weaknesses
        let subjectBreakdown = '';
        if (catEntries.length > 0) {
            const sorted = catEntries.sort((a, b) => {
                const aWinRate = a[1].wins / (a[1].wins + a[1].losses || 1);
                const bWinRate = b[1].wins / (b[1].wins + b[1].losses || 1);
                return bWinRate - aWinRate;
            });
            const strengths = sorted.filter(([, d]) => d.wins > d.losses).slice(0, 3)
                .map(([cat, d]) => `${cat} (${d.wins}W/${d.losses}L, ${Math.round(d.accuracy * 100)}% acc)`).join(', ');
            const weaknesses = sorted.filter(([, d]) => d.losses >= d.wins).slice(-3)
                .map(([cat, d]) => `${cat} (${d.wins}W/${d.losses}L, ${Math.round(d.accuracy * 100)}% acc)`).join(', ');
            subjectBreakdown = `\nBest subjects: ${strengths || 'None yet'}. Worst subjects: ${weaknesses || 'None yet'}.`;
        }

        const statsStr = catEntries
            .map(([cat, data]) => `${cat}: ${data.wins}W/${data.losses}L, ${Math.round(data.accuracy * 100)}% accuracy`)
            .join(', ');

        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: `You write short, witty, roast/boast bios for trivia players. Focus heavily on their SPECIFIC subject strengths and weaknesses. If they dominate a subject, brag about it. If they're bad at a subject, roast them for it. Be funny, specific, and use casual internet language. STRICT LIMIT: 100 words maximum.`,
                },
                {
                    role: 'user',
                    content: `Write a bio for "${user.username}" with Elo ${user.elo}, ${stats.totalWins || 0} wins, ${stats.totalLosses || 0} losses.${subjectBreakdown}\nAll categories: ${statsStr || 'No category data yet'}. Total questions answered correctly: ${stats.correctAnswers || 0}/${stats.totalAnswers || 0}.`,
                },
            ],
            temperature: 1.0,
            max_tokens: 150,
        });

        return completion.choices[0].message.content.trim();
    } catch (err) {
        console.error('Bio generation error:', err.message);
        return `${user.username} is a mysterious competitor with untold trivia powers.`;
    }
}

// ═══════════════════════════════════════════════════════════════
// REST API — AUTH
// ═══════════════════════════════════════════════════════════════
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 2 || username.length > 20) return res.status(400).json({ error: 'Username must be 2-20 characters' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    // Check duplicate
    for (const [, u] of db.users) {
        if (u.username.toLowerCase() === username.toLowerCase()) {
            return res.status(409).json({ error: 'Username already taken' });
        }
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
        id,
        username,
        passwordHash,
        elo: 1000,
        stats: { totalWins: 0, totalLosses: 0, totalAnswers: 0, correctAnswers: 0, categories: {}, gamesPlayed: 0 },
        friends: [],
        friendRequests: [],
        bio: `${username} just arrived. Watch out.`,
        online: false,
        socketId: null,
        createdAt: Date.now(),
    };

    db.users.set(id, user);
    const token = uuidv4();
    db.sessions.set(token, id);
    res.json({ token, user: sanitizeUser(user) });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    let user = null;
    for (const [, u] of db.users) {
        if (u.username.toLowerCase() === username.toLowerCase()) {
            user = u;
            break;
        }
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = uuidv4();
    db.sessions.set(token, user.id);
    res.json({ token, user: sanitizeUser(user) });
});

app.get('/api/me', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserBySession(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ user: sanitizeUser(user) });
});

// ── LEADERBOARD ──────────────────────────────────────────────
app.get('/api/leaderboard', (req, res) => {
    const users = Array.from(db.users.values())
        .map(u => sanitizeUser(u))
        .sort((a, b) => b.elo - a.elo)
        .slice(0, 50);
    res.json({ leaderboard: users });
});

// ── PROFILE ──────────────────────────────────────────────────
app.get('/api/profile/:userId', (req, res) => {
    const user = db.users.get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: sanitizeUser(user) });
});

// Lookup profile by username (public)
app.get('/api/profile-by-name/:username', (req, res) => {
    let user = null;
    for (const [, u] of db.users) {
        if (u.username.toLowerCase() === req.params.username.toLowerCase()) {
            user = u;
            break;
        }
    }
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: sanitizeUser(user) });
});

app.post('/api/profile/regenerate-bio', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserBySession(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const bio = await generateBio(user);
    user.bio = bio;
    res.json({ bio });
});

// ── FRIENDS ──────────────────────────────────────────────────
app.post('/api/friends/request', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserBySession(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { username } = req.body;
    let target = null;
    for (const [, u] of db.users) {
        if (u.username.toLowerCase() === username.toLowerCase()) {
            target = u;
            break;
        }
    }
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === user.id) return res.status(400).json({ error: 'Cannot add yourself' });
    if (user.friends.includes(target.id)) return res.status(400).json({ error: 'Already friends' });
    if (target.friendRequests.includes(user.id)) return res.status(400).json({ error: 'Request already sent' });

    target.friendRequests.push(user.id);
    // Notify target via socket
    if (target.socketId) {
        io.to(target.socketId).emit('friend-request', { from: sanitizeUser(user) });
    }
    res.json({ success: true });
});

app.post('/api/friends/accept', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserBySession(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { userId } = req.body;
    const idx = user.friendRequests.indexOf(userId);
    if (idx === -1) return res.status(400).json({ error: 'No request from this user' });

    user.friendRequests.splice(idx, 1);
    user.friends.push(userId);
    const other = db.users.get(userId);
    if (other) {
        other.friends.push(user.id);
        if (other.socketId) {
            io.to(other.socketId).emit('friend-accepted', { user: sanitizeUser(user) });
        }
    }
    res.json({ success: true });
});

app.post('/api/friends/decline', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserBySession(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { userId } = req.body;
    const idx = user.friendRequests.indexOf(userId);
    if (idx === -1) return res.status(400).json({ error: 'No request from this user' });
    user.friendRequests.splice(idx, 1);
    res.json({ success: true });
});

app.get('/api/friends', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserBySession(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const friends = user.friends.map(fId => {
        const f = db.users.get(fId);
        return f ? sanitizeUser(f) : null;
    }).filter(Boolean);

    const requests = user.friendRequests.map(fId => {
        const f = db.users.get(fId);
        return f ? sanitizeUser(f) : null;
    }).filter(Boolean);

    res.json({ friends, requests });
});

// ── MESSAGING ────────────────────────────────────────────────
app.get('/api/messages/:friendId', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserBySession(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const key1 = `${user.id}_${req.params.friendId}`;
    const key2 = `${req.params.friendId}_${user.id}`;
    const msgs = db.messages.get(key1) || db.messages.get(key2) || [];
    res.json({ messages: msgs });
});

app.post('/api/messages/:friendId', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserBySession(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Message required' });

    const friendId = req.params.friendId;
    const key1 = `${user.id}_${friendId}`;
    const key2 = `${friendId}_${user.id}`;
    let key = key1;
    if (db.messages.has(key2)) key = key2;
    if (!db.messages.has(key)) db.messages.set(key, []);

    const msg = { from: user.id, fromUsername: user.username, to: friendId, text: text.trim(), ts: Date.now() };
    db.messages.get(key).push(msg);

    // Notify friend
    const friend = db.users.get(friendId);
    if (friend && friend.socketId) {
        io.to(friend.socketId).emit('dm', msg);
    }
    res.json({ message: msg });
});

// ── LOBBIES ──────────────────────────────────────────────────
app.get('/api/lobbies', (req, res) => {
    const public_lobbies = [];
    for (const [, lobby] of db.lobbies) {
        if (lobby.isPublic && lobby.status === 'waiting') {
            public_lobbies.push({
                id: lobby.id,
                topic: lobby.topic,
                host: lobby.hostUsername,
                playerCount: lobby.players.length,
                maxPlayers: lobby.maxPlayers,
                questionCount: lobby.questionCount,
                timeLimit: lobby.timeLimit,
                createdAt: lobby.createdAt,
            });
        }
    }
    res.json({ lobbies: public_lobbies });
});

// ── TOURNAMENT ──────────────────────────────────────────────
app.get('/api/tournaments', (req, res) => {
    const list = [];
    for (const [, t] of db.tournaments) {
        list.push({
            id: t.id,
            topic: t.topic,
            status: t.status,
            playerCount: t.players.length,
            maxPlayers: t.maxPlayers,
            round: t.currentRound,
            createdAt: t.createdAt,
        });
    }
    res.json({ tournaments: list });
});

// ── WRONG QUESTIONS LOG ──────────────────────────────────────
app.get('/api/question-log', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserBySession(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const wrongQuestions = db.wrongAnswers.get(user.id) || [];

    // Sort newest first
    wrongQuestions.sort((a, b) => b.playedAt - a.playedAt);
    res.json({ wrongQuestions });
});

// ── AI EXPLANATION GENERATOR ─────────────────────────────────
app.post('/api/explain-question', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = getUserBySession(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { question, options, correctIndex, yourAnswerIndex } = req.body;
    if (!question || !options) return res.status(400).json({ error: 'Missing data' });

    try {
        const yourAnswer = yourAnswerIndex >= 0 ? options[yourAnswerIndex] : 'No answer (timed out)';
        const correctAnswer = options[correctIndex];

        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: `You are a friendly, knowledgeable tutor. A trivia player got a question wrong. Explain WHY the correct answer is right in a clear, educational, and slightly encouraging way. Also explain why the wrong answer they chose is incorrect. Keep it concise (2-4 sentences). Use simple language. Be helpful, not condescending.`,
                },
                {
                    role: 'user',
                    content: `Question: "${question}"\nOptions: ${options.map((o, i) => `${i === correctIndex ? '✓' : '✗'} ${o}`).join(', ')}\nCorrect answer: "${correctAnswer}"\nPlayer answered: "${yourAnswer}"\n\nExplain why the correct answer is right and why the player's answer was wrong.`,
                },
            ],
            temperature: 0.7,
            max_tokens: 200,
        });

        const explanation = completion.choices[0].message.content.trim();
        res.json({ explanation });
    } catch (err) {
        console.error('Explain error:', err.message);
        res.json({ explanation: `The correct answer is "${options[correctIndex]}". Unfortunately I couldn't generate a detailed explanation right now. Try again later!` });
    }
});

// ═══════════════════════════════════════════════════════════════
// SOCKET.IO — REAL-TIME
// ═══════════════════════════════════════════════════════════════
io.on('connection', (socket) => {
    let currentUser = null;

    // Broadcast updated online count
    function broadcastOnlineCount() {
        let count = 0;
        for (const [, u] of db.users) {
            if (u.online) count++;
        }
        io.emit('online-count', count);
    }

    // ── Auth ─────────────────────────────────────────────────
    socket.on('auth', (token) => {
        const user = getUserBySession(token);
        if (!user) return socket.emit('auth-error', 'Invalid session');
        currentUser = user;
        currentUser.online = true;
        currentUser.socketId = socket.id;
        socket.emit('auth-success', sanitizeUser(currentUser));

        // Broadcast updated online count
        broadcastOnlineCount();

        // Notify friends
        currentUser.friends.forEach(fId => {
            const f = db.users.get(fId);
            if (f && f.socketId) {
                io.to(f.socketId).emit('friend-online', { userId: currentUser.id, username: currentUser.username });
            }
        });
    });

    // ── Quick Game Queue ─────────────────────────────────────
    socket.on('queue-join', async () => {
        if (!currentUser) return;
        // Remove if already in queue
        db.quickQueue = db.quickQueue.filter(q => q.userId !== currentUser.id);
        db.quickQueue.push({ userId: currentUser.id, socketId: socket.id, joinedAt: Date.now() });

        socket.emit('queue-status', { position: db.quickQueue.length, waiting: true });

        if (db.quickQueue.length >= 2) {
            const p1 = db.quickQueue.shift();
            const p2 = db.quickQueue.shift();

            const user1 = db.users.get(p1.userId);
            const user2 = db.users.get(p2.userId);

            // Generate questions
            const topics = ['General Knowledge', 'Science', 'History', 'Geography', 'Pop Culture', 'Technology', 'Sports', 'Movies', 'Music', 'Literature'];
            const topic = topics[Math.floor(Math.random() * topics.length)];

            io.to(p1.socketId).emit('queue-matched', { opponent: sanitizeUser(user2), topic });
            io.to(p2.socketId).emit('queue-matched', { opponent: sanitizeUser(user1), topic });

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

            // Start the game after a short delay
            setTimeout(() => startGameQuestion(gameId), 2000);
        }
    });

    socket.on('queue-leave', () => {
        if (!currentUser) return;
        db.quickQueue = db.quickQueue.filter(q => q.userId !== currentUser.id);
        socket.emit('queue-status', { waiting: false });
    });

    // ── Game Answer ──────────────────────────────────────────
    socket.on('game-answer', ({ gameId, answerIndex }) => {
        if (!currentUser) return;
        const game = db.games.get(gameId);
        if (!game || game.status !== 'playing') return;

        const player = game.players.find(p => p.userId === currentUser.id);
        if (!player) return;

        const q = game.questions[game.currentQuestion];
        if (!q) return;

        // Check if already answered this question
        if (player.answers[game.currentQuestion] !== undefined) return;

        const elapsed = (Date.now() - game.questionStartTime) / 1000;
        const timeLimit = game.timeLimit || 10;
        const isCorrect = answerIndex === q.correct;

        let points = 0;
        if (isCorrect) {
            // Base 70 points for correctness + up to 30 speed bonus
            const speedBonus = Math.round(30 * Math.max(0, 1 - elapsed / timeLimit));
            points = 70 + speedBonus;
        }

        player.answers[game.currentQuestion] = { answerIndex, isCorrect, points, elapsed };
        player.score += points;

        // Emit to the player their result
        socket.emit('answer-result', {
            correct: isCorrect,
            points,
            correctAnswer: q.correct,
            playerScore: player.score,
        });

        // Notify opponent
        const opponent = game.players.find(p => p.userId !== currentUser.id);
        if (opponent && opponent.socketId) {
            io.to(opponent.socketId).emit('opponent-answered', { hasAnswered: true });
        }

        // Check if both answered
        const allAnswered = game.players.every(p => p.answers[game.currentQuestion] !== undefined);
        if (allAnswered) {
            clearTimeout(game.questionTimer);
            proceedToNextQuestion(gameId);
        }
    });

    // ── In-Game Chat ─────────────────────────────────────────
    socket.on('game-chat', ({ gameId, text }) => {
        if (!currentUser) return;
        const game = db.games.get(gameId);
        if (!game) return;
        const msg = { userId: currentUser.id, username: currentUser.username, text, ts: Date.now() };
        game.chat.push(msg);
        io.to(gameId).emit('game-chat-msg', msg);
    });

    // ── Global Chat ──────────────────────────────────────────
    socket.on('global-chat', ({ text }) => {
        if (!currentUser) return;
        const msg = { userId: currentUser.id, username: currentUser.username, text, ts: Date.now() };
        db.globalChat.push(msg);
        if (db.globalChat.length > 100) db.globalChat.shift();
        io.emit('global-chat-msg', msg);
    });

    socket.on('global-chat-history', () => {
        socket.emit('global-chat-history', db.globalChat.slice(-50));
    });

    // ── Custom Lobby ──────────────────────────────────────────
    socket.on('create-lobby', async ({ topic, isPublic, timeLimit, questionCount, maxPlayers, ranked }) => {
        if (!currentUser) return;

        const lobbyId = uuidv4();
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        const lobby = {
            id: lobbyId,
            inviteCode,
            topic: topic || 'General Knowledge',
            isPublic: isPublic !== false,
            ranked: ranked !== false, // ranked by default
            hostId: currentUser.id,
            hostUsername: currentUser.username,
            maxPlayers: Math.min(maxPlayers || 2, 8),
            questionCount: Math.min(questionCount || 5, 20),
            timeLimit: Math.min(timeLimit || 10, 30),
            players: [{ userId: currentUser.id, username: currentUser.username, socketId: socket.id, score: 0, answers: [], ready: true }],
            status: 'waiting',
            createdAt: Date.now(),
            expiresAt: Date.now() + 10 * 60 * 1000, // 10 min expiry
        };

        db.lobbies.set(lobbyId, lobby);
        socket.join(lobbyId);

        socket.emit('lobby-created', { lobbyId, inviteCode, lobby });
        io.emit('lobbies-updated');
    });

    // ── Leave Lobby ─────────────────────────────────────────────
    socket.on('leave-lobby', ({ lobbyId }) => {
        if (!currentUser) return;
        const lobby = db.lobbies.get(lobbyId);
        if (!lobby) return;

        // Remove the player from the lobby
        lobby.players = lobby.players.filter(p => p.userId !== currentUser.id);
        socket.leave(lobbyId);

        // If lobby is now empty or host left, delete the lobby
        if (lobby.players.length === 0 || lobby.hostId === currentUser.id) {
            db.lobbies.delete(lobbyId);
            // Notify remaining players if host left
            if (lobby.players.length > 0) {
                io.to(lobbyId).emit('lobby-error', 'Host left the lobby. Lobby has been closed.');
                // Remove remaining players from the room
                lobby.players.forEach(p => {
                    const s = io.sockets.sockets.get(p.socketId);
                    if (s) s.leave(lobbyId);
                });
            }
        } else {
            // Notify remaining players about the update
            io.to(lobbyId).emit('lobby-updated', lobby);
        }

        io.emit('lobbies-updated');
    });

    socket.on('join-lobby', ({ lobbyId, inviteCode }) => {
        if (!currentUser) return;

        let lobby = null;
        if (lobbyId) {
            lobby = db.lobbies.get(lobbyId);
        } else if (inviteCode) {
            for (const [, l] of db.lobbies) {
                if (l.inviteCode === inviteCode.toUpperCase() && l.status === 'waiting') {
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
        if (!currentUser) return;
        const lobby = db.lobbies.get(lobbyId);
        if (!lobby) return;
        const player = lobby.players.find(p => p.userId === currentUser.id);
        if (player) player.ready = true;
        io.to(lobbyId).emit('lobby-updated', lobby);
    });

    socket.on('lobby-start', async ({ lobbyId }) => {
        if (!currentUser) return;
        const lobby = db.lobbies.get(lobbyId);
        if (!lobby || lobby.hostId !== currentUser.id) return;
        if (lobby.players.length < 2) return socket.emit('lobby-error', 'Need at least 2 players');

        lobby.status = 'playing';
        const questions = await generateQuestions(lobby.topic, lobby.questionCount);

        const gameId = uuidv4();
        const game = {
            id: gameId,
            type: 'custom',
            ranked: lobby.ranked, // carry ranked flag from lobby
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

        // Move all players to game room
        lobby.players.forEach(p => {
            const s = io.sockets.sockets.get(p.socketId);
            if (s) s.join(gameId);
        });

        io.to(lobbyId).emit('lobby-game-start', { gameId, topic: lobby.topic });
        io.emit('lobbies-updated');

        setTimeout(() => startGameQuestion(gameId), 2000);
    });

    // ── Solo Practice Mode ─────────────────────────────────
    socket.on('solo-start', async ({ topic, questionCount, timeLimit }) => {
        if (!currentUser) return;

        socket.emit('solo-generating', { topic });

        const questions = await generateQuestions(topic || 'General Knowledge', questionCount || 5);
        const gameId = uuidv4();

        const game = {
            id: gameId,
            type: 'solo',
            topic: topic || 'General Knowledge',
            players: [{ userId: currentUser.id, username: currentUser.username, socketId: socket.id, score: 0, answers: [] }],
            questions,
            currentQuestion: 0,
            timeLimit: timeLimit || 10,
            questionStartTime: null,
            status: 'playing',
            chat: [],
            createdAt: Date.now(),
        };

        db.games.set(gameId, game);
        socket.join(gameId);

        setTimeout(() => startGameQuestion(gameId), 1500);
    });

    // ── Tournament ─────────────────────────────────────────
    // ── Friend Challenge ───────────────────────────────────────
    socket.on('challenge-friend', ({ friendId, topic }) => {
        if (!currentUser) return;
        if (!currentUser.friends.includes(friendId)) return socket.emit('challenge-error', 'Not friends with this user');

        const friend = db.users.get(friendId);
        if (!friend || !friend.online || !friend.socketId) return socket.emit('challenge-error', 'Friend is offline');

        const challengeId = uuidv4();
        db.challenges = db.challenges || new Map();
        db.challenges.set(challengeId, {
            id: challengeId,
            fromId: currentUser.id,
            fromUsername: currentUser.username,
            toId: friendId,
            topic: topic || 'General Knowledge',
            createdAt: Date.now(),
        });

        io.to(friend.socketId).emit('challenge-received', {
            challengeId,
            from: sanitizeUser(currentUser),
            topic: topic || 'General Knowledge',
        });
        socket.emit('challenge-sent', { challengeId, to: friend.username });

        // Auto-expire challenge after 60s
        setTimeout(() => {
            if (db.challenges && db.challenges.has(challengeId)) {
                db.challenges.delete(challengeId);
                socket.emit('challenge-expired', { challengeId });
            }
        }, 60000);
    });

    socket.on('challenge-accept', async ({ challengeId }) => {
        if (!currentUser) return;
        if (!db.challenges) return;
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

        setTimeout(() => startGameQuestion(gameId), 2000);
    });

    socket.on('challenge-decline', ({ challengeId }) => {
        if (!currentUser || !db.challenges) return;
        const challenge = db.challenges.get(challengeId);
        if (!challenge || challenge.toId !== currentUser.id) return;
        db.challenges.delete(challengeId);

        const challenger = db.users.get(challenge.fromId);
        if (challenger && challenger.socketId) {
            io.to(challenger.socketId).emit('challenge-declined', { challengeId, by: currentUser.username });
        }
    });

    socket.on('create-tournament', ({ topic, maxPlayers }) => {
        if (!currentUser) return;

        const tId = uuidv4();
        const max = [8, 16].includes(maxPlayers) ? maxPlayers : 8;

        const tournament = {
            id: tId,
            topic: topic || 'General Knowledge',
            hostId: currentUser.id,
            hostUsername: currentUser.username,
            maxPlayers: max,
            players: [{ userId: currentUser.id, username: currentUser.username, socketId: socket.id }],
            brackets: [],
            currentRound: 0,
            status: 'waiting',
            createdAt: Date.now(),
            expiresAt: Date.now() + 15 * 60 * 1000, // 15 min expiry
        };

        db.tournaments.set(tId, tournament);
        socket.join(`tournament-${tId}`);
        socket.emit('tournament-created', tournament);
        io.emit('tournaments-updated');
    });

    socket.on('join-tournament', ({ tournamentId }) => {
        if (!currentUser) return;
        const t = db.tournaments.get(tournamentId);
        if (!t || t.status !== 'waiting') return socket.emit('tournament-error', 'Tournament not available');
        if (t.players.length >= t.maxPlayers) return socket.emit('tournament-error', 'Tournament full');
        if (t.players.find(p => p.userId === currentUser.id)) return socket.emit('tournament-error', 'Already joined');

        t.players.push({ userId: currentUser.id, username: currentUser.username, socketId: socket.id });
        socket.join(`tournament-${tournamentId}`);
        io.to(`tournament-${tournamentId}`).emit('tournament-updated', t);
        io.emit('tournaments-updated');

        // Auto-start when full
        if (t.players.length >= t.maxPlayers) {
            startTournament(tournamentId);
        }
    });

    socket.on('start-tournament', ({ tournamentId }) => {
        if (!currentUser) return;
        const t = db.tournaments.get(tournamentId);
        if (!t || t.hostId !== currentUser.id) return;
        if (t.players.length < 2) return socket.emit('tournament-error', 'Need at least 2 players');
        startTournament(tournamentId);
    });

    // ── Disconnect ────────────────────────────────────────────
    socket.on('disconnect', () => {
        if (currentUser) {
            currentUser.online = false;
            currentUser.socketId = null;
            db.quickQueue = db.quickQueue.filter(q => q.userId !== currentUser.id);

            // Broadcast updated online count
            broadcastOnlineCount();

            // Notify friends
            currentUser.friends.forEach(fId => {
                const f = db.users.get(fId);
                if (f && f.socketId) {
                    io.to(f.socketId).emit('friend-offline', { userId: currentUser.id });
                }
            });

            // Handle lobbies — clean up if player was in a waiting lobby
            for (const [lobbyId, lobby] of db.lobbies) {
                if (lobby.status !== 'waiting') continue;
                const inLobby = lobby.players.find(p => p.userId === currentUser.id);
                if (!inLobby) continue;

                lobby.players = lobby.players.filter(p => p.userId !== currentUser.id);
                if (lobby.players.length === 0 || lobby.hostId === currentUser.id) {
                    // Notify remaining players if host disconnected
                    if (lobby.players.length > 0) {
                        io.to(lobbyId).emit('lobby-error', 'Host disconnected. Lobby has been closed.');
                        lobby.players.forEach(p => {
                            const s = io.sockets.sockets.get(p.socketId);
                            if (s) s.leave(lobbyId);
                        });
                    }
                    db.lobbies.delete(lobbyId);
                } else {
                    io.to(lobbyId).emit('lobby-updated', lobby);
                }
                io.emit('lobbies-updated');
            }

            // Handle in-progress games
            for (const [, game] of db.games) {
                if (game.status === 'playing') {
                    const player = game.players.find(p => p.userId === currentUser.id);
                    if (player) {
                        game.status = 'finished';
                        clearTimeout(game.questionTimer);
                        recordWrongAnswers(game);
                        const winner = game.players.find(p => p.userId !== currentUser.id);
                        if (winner) {
                            io.to(game.id).emit('game-over', {
                                reason: 'opponent-disconnect',
                                winner: { userId: winner.userId, username: winner.username, score: winner.score },
                                players: game.players,
                                questions: game.questions,
                            });
                        }
                    }
                }
            }
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// GAME FLOW LOGIC
// ═══════════════════════════════════════════════════════════════

function recordWrongAnswers(game) {
    if (!game) return;

    game.players.forEach(player => {
        const userId = player.userId;
        if (!db.wrongAnswers) db.wrongAnswers = new Map();
        if (!db.wrongAnswers.has(userId)) {
            db.wrongAnswers.set(userId, []);
        }
        const userLog = db.wrongAnswers.get(userId);

        // Only iterate up to the number of questions actually played, not all generated questions.
        // This prevents correct answers or unplayed questions from being logged as wrong.
        const questionsPlayed = Math.min(game.currentQuestion + 1, game.questions.length);
        game.questions.slice(0, questionsPlayed).forEach((q, idx) => {
            const myAnswer = player.answers[idx];
            // If answer is correct, skip.
            // If myAnswer is undefined, it's a timeout/skip.

            if (myAnswer && myAnswer.isCorrect) return;

            // Simple unique ID for the wrong answer entry
            const entryId = `${game.id}_${idx}`;
            // Avoid duplicates if function called multiple times
            if (userLog.find(e => e.id === entryId)) return;

            userLog.push({
                id: entryId,
                topic: game.topic,
                question: q.question,
                options: q.options,
                correctIndex: q.correct,
                correctAnswer: q.options[q.correct],
                yourAnswerIndex: myAnswer ? myAnswer.answerIndex : -1,
                yourAnswer: myAnswer && myAnswer.answerIndex >= 0 ? q.options[myAnswer.answerIndex] : 'No answer (timed out)',
                timedOut: !myAnswer || myAnswer.answerIndex < 0,
                difficulty: q.difficulty || 'medium',
                explanation: q.explanation || null,
                playedAt: game.createdAt || Date.now(),
            });
        });

        // Limit log size per user (last 100)
        userLog.sort((a, b) => b.playedAt - a.playedAt);
        if (userLog.length > 100) {
            userLog.length = 100;
        }
    });
}

function startGameQuestion(gameId) {
    const game = db.games.get(gameId);
    if (!game || game.status !== 'playing') return;

    if (game.currentQuestion >= game.questions.length) {
        endGame(gameId);
        return;
    }

    const q = game.questions[game.currentQuestion];
    game.questionStartTime = Date.now();

    // Unique ID per question round to prevent race conditions / glitches
    const questionId = `${gameId}_q${game.currentQuestion}_${Date.now()}`;
    game.currentQuestionId = questionId;

    io.to(gameId).emit('game-question', {
        gameId,
        questionId,
        questionIndex: game.currentQuestion,
        totalQuestions: game.questions.length,
        question: q.question,
        options: q.options,
        difficulty: q.difficulty,
        timeLimit: game.timeLimit,
        playerCount: game.players.length,
        scores: game.players.map(p => ({ userId: p.userId, username: p.username, score: p.score })),
    });

    // Timer
    game.questionTimer = setTimeout(() => {
        // Verify this timer is still for the current question (prevent stale timers)
        if (game.currentQuestionId !== questionId) return;

        // Auto-fill unanswered
        game.players.forEach(p => {
            if (p.answers[game.currentQuestion] === undefined) {
                p.answers[game.currentQuestion] = { answerIndex: -1, isCorrect: false, points: 0, elapsed: game.timeLimit };
                if (p.socketId) {
                    io.to(p.socketId).emit('answer-result', {
                        correct: false,
                        points: 0,
                        correctAnswer: q.correct,
                        playerScore: p.score,
                        timeout: true,
                    });
                }
            }
        });
        proceedToNextQuestion(gameId);
    }, (game.timeLimit + 1) * 1000);
}

function proceedToNextQuestion(gameId) {
    const game = db.games.get(gameId);
    if (!game) return;

    const q = game.questions[game.currentQuestion];

    // Send round summary with explanation
    io.to(gameId).emit('round-summary', {
        gameId,
        questionIndex: game.currentQuestion,
        correctAnswer: q.correct,
        correctAnswerText: q.options[q.correct],
        explanation: q.explanation || 'No explanation available.',
        playerCount: game.players.length,
        players: game.players.map(p => ({
            userId: p.userId,
            username: p.username,
            score: p.score,
            answer: p.answers[game.currentQuestion],
        })),
    });

    game.currentQuestion++;

    // Longer delay for 3+ player games so round results can be displayed
    const delay = game.players.length > 2 ? 5000 : 3000;
    setTimeout(() => {
        startGameQuestion(gameId);
    }, delay);
}

function endGame(gameId) {
    const game = db.games.get(gameId);
    if (!game) return;
    game.status = 'finished';

    // Determine winner
    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];

    // Record wrong answers for history
    recordWrongAnswers(game);

    const isDraw = sorted.length > 1 && sorted[0].score === sorted[1].score;

    // Ranked games: quick mode always ranked; custom games ranked if flag is set (default on)
    const isRanked = !isDraw && game.players.length === 2 && (
        game.type === 'quick' || (game.type === 'custom' && game.ranked !== false)
    );

    if (isRanked) {
        const winnerUser = db.users.get(winner.userId);
        const loserUser = db.users.get(sorted[1].userId);
        if (winnerUser && loserUser) {
            const { winnerNew, loserNew } = calculateElo(winnerUser.elo, loserUser.elo);
            const eloDelta = winnerNew - winnerUser.elo;
            winnerUser.elo = Math.max(0, winnerNew);
            loserUser.elo = Math.max(0, loserNew);

            // Update stats
            winnerUser.stats.totalWins++;
            loserUser.stats.totalLosses++;
            winnerUser.stats.gamesPlayed++;
            loserUser.stats.gamesPlayed++;

            // Category stats
            const cat = game.topic;
            [winnerUser, loserUser].forEach(u => {
                if (!u.stats.categories[cat]) u.stats.categories[cat] = { wins: 0, losses: 0, accuracy: 0, totalAnswered: 0, correctAnswers: 0 };
            });
            winnerUser.stats.categories[cat].wins++;
            loserUser.stats.categories[cat].losses++;

            // Answer stats
            game.players.forEach(p => {
                const u = db.users.get(p.userId);
                if (u) {
                    const correct = p.answers.filter(a => a && a.isCorrect).length;
                    const total = p.answers.filter(a => a).length;
                    u.stats.totalAnswers += total;
                    u.stats.correctAnswers += correct;
                    if (u.stats.categories[cat]) {
                        u.stats.categories[cat].totalAnswered += total;
                        u.stats.categories[cat].correctAnswers += correct;
                        u.stats.categories[cat].accuracy = u.stats.categories[cat].totalAnswered > 0
                            ? u.stats.categories[cat].correctAnswers / u.stats.categories[cat].totalAnswered
                            : 0;
                    }
                }
            });

            io.to(gameId).emit('game-over', {
                gameId,
                winner: { userId: winner.userId, username: winner.username, score: winner.score },
                isDraw: false,
                eloDelta,
                playerCount: game.players.length,
                players: game.players.map(p => {
                    const u = db.users.get(p.userId);
                    return {
                        userId: p.userId,
                        username: p.username,
                        score: p.score,
                        answers: p.answers,
                        elo: u ? u.elo : 0,
                        eloChange: p.userId === winner.userId ? eloDelta : -eloDelta,
                    };
                }),
                questions: game.questions,
                topic: game.topic,
            });

            // Regenerate bio if enough games played
            if (winnerUser.stats.gamesPlayed % 3 === 0) generateBio(winnerUser).then(bio => { winnerUser.bio = bio; });
            if (loserUser.stats.gamesPlayed % 3 === 0) generateBio(loserUser).then(bio => { loserUser.bio = bio; });

            return;
        }
    }

    // Non-ranked games: update stats but not Elo (custom >2 players, solo, etc.)
    if (game.type !== 'solo') {
        const cat = game.topic;
        game.players.forEach(p => {
            const u = db.users.get(p.userId);
            if (u) {
                u.stats.gamesPlayed++;
                if (!u.stats.categories[cat]) u.stats.categories[cat] = { wins: 0, losses: 0, accuracy: 0, totalAnswered: 0, correctAnswers: 0 };
                if (!isDraw && winner.userId === p.userId) {
                    u.stats.totalWins++;
                    u.stats.categories[cat].wins++;
                } else if (!isDraw) {
                    u.stats.totalLosses++;
                    u.stats.categories[cat].losses++;
                }
                const correct = p.answers.filter(a => a && a.isCorrect).length;
                const total = p.answers.filter(a => a).length;
                u.stats.totalAnswers += total;
                u.stats.correctAnswers += correct;
                u.stats.categories[cat].totalAnswered += total;
                u.stats.categories[cat].correctAnswers += correct;
                u.stats.categories[cat].accuracy = u.stats.categories[cat].totalAnswered > 0
                    ? u.stats.categories[cat].correctAnswers / u.stats.categories[cat].totalAnswered
                    : 0;
                if (u.stats.gamesPlayed % 3 === 0) generateBio(u).then(bio => { u.bio = bio; });
            }
        });
    }

    io.to(gameId).emit('game-over', {
        gameId,
        winner: isDraw ? null : { userId: winner.userId, username: winner.username, score: winner.score },
        isDraw,
        playerCount: game.players.length,
        players: game.players.map(p => ({
            userId: p.userId,
            username: p.username,
            score: p.score,
            answers: p.answers,
        })),
        questions: game.questions,
        topic: game.topic,
    });
}

// ═══════════════════════════════════════════════════════════════
// TOURNAMENT LOGIC
// ═══════════════════════════════════════════════════════════════
async function startTournament(tournamentId) {
    const t = db.tournaments.get(tournamentId);
    if (!t) return;

    t.status = 'playing';
    t.currentRound = 1;

    // Shuffle players
    const shuffled = [...t.players].sort(() => Math.random() - 0.5);

    // Create bracket pairs
    const pairs = [];
    for (let i = 0; i < shuffled.length; i += 2) {
        if (shuffled[i + 1]) {
            pairs.push([shuffled[i], shuffled[i + 1]]);
        } else {
            // Bye — auto-advance
            pairs.push([shuffled[i], null]);
        }
    }

    t.brackets.push({ round: t.currentRound, matches: pairs.map((pair, idx) => ({ id: idx, players: pair, winnerId: pair[1] === null ? pair[0].userId : null, gameId: null })) });

    io.to(`tournament-${tournamentId}`).emit('tournament-round', { tournamentId, round: t.currentRound, brackets: t.brackets });

    // Start matches
    for (const match of t.brackets[0].matches) {
        if (match.winnerId) continue; // Bye

        const questions = await generateQuestions(t.topic, 5);
        const gameId = uuidv4();

        const game = {
            id: gameId,
            type: 'tournament',
            tournamentId,
            matchIndex: match.id,
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

        setTimeout(() => startGameQuestion(gameId), 3000);
    }

    io.emit('tournaments-updated');
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP TIMER — auto-expire stale lobbies & tournaments
// ═══════════════════════════════════════════════════════════════
setInterval(() => {
    const now = Date.now();
    let lobbiesRemoved = 0;
    let tourneysRemoved = 0;

    for (const [id, lobby] of db.lobbies) {
        if (lobby.status === 'waiting' && lobby.expiresAt && now > lobby.expiresAt) {
            io.to(id).emit('lobby-error', 'Lobby expired due to inactivity.');
            db.lobbies.delete(id);
            lobbiesRemoved++;
        }
    }

    for (const [id, t] of db.tournaments) {
        if (t.status === 'waiting' && t.expiresAt && now > t.expiresAt) {
            io.to(`tournament-${id}`).emit('tournament-error', 'Tournament expired due to inactivity.');
            db.tournaments.delete(id);
            tourneysRemoved++;
        }
    }

    // Also clean finished games older than 30 min
    for (const [id, game] of db.games) {
        if (game.status === 'finished' && now - game.createdAt > 30 * 60 * 1000) {
            db.games.delete(id);
        }
    }

    if (lobbiesRemoved || tourneysRemoved) {
        io.emit('lobbies-updated');
        io.emit('tournaments-updated');
    }
}, 30000); // Check every 30 seconds

// ═══════════════════════════════════════════════════════════════
// SPA CATCH-ALL
// ═══════════════════════════════════════════════════════════════
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n⚡ QVIZIO server running on http://localhost:${PORT}\n`);
});
