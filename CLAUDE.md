# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Start server (node server.js)
npm run dev        # Same as npm start (no hot reload)
# No build step, no linter, no test framework configured
```

**Env vars required**: `MONGODB_URI`, `GEMINI_API_KEY`, `GROQ_API_KEY`, plus Firebase vars (see `.env`)
**Port**: `process.env.PORT` or 3000. Deployed on Railway.

## Architecture

QVIZIO RANKED is a real-time competitive trivia game with ELO ranking. Node.js + Express 5 + Socket.io 4 + MongoDB (Mongoose 9). Vanilla JS SPA client. Language mix: Georgian presets, English UI.

### Server

- `server.js` — Entry point. Connects MongoDB via `db.init()`, starts HTTP, handles graceful SIGTERM/SIGINT shutdown.
- `src/app.js` — Express + Socket.io setup. All routes under `/api`. `trust proxy = 1`. `app.get('io')` exposes Socket.io instance.
- `src/db/store.js` — **Hybrid data store**: in-memory JS Maps + MongoDB persistence. All `db.save*()` are **fire-and-forget** upserts (not awaited). Persistent: `users`, `sessions`, `messages`, `wrongAnswers`. Ephemeral: `games`, `lobbies`, `tournaments`, `quickQueue`, `globalChat`, `challenges`.
- `src/services/ai.js` — Gemini (`gemini-3-flash-preview`) for questions with **15s timeout** via `withTimeout()`. Groq (`llama-3.3-70b-versatile`) for bios + explanations. All functions have fallbacks.
- `src/services/gameEngine.js` — Core game loop: question delivery (XOR obfuscated, key `'QvZ!0_s3cR3t'`), answer scoring (70 base + speed bonus up to 30), ELO updates (K=32, K=48 on disconnect), wrong-answer recording.
- `src/sockets/*.js` — Socket event handlers. Each exports `function(io, socket, getCurrentUser)`.
- `src/routes/*.js` — Express route files under `/api`. Rate limit: 120 req/min per IP.

### Client (CRITICAL: dual-file system)

**`public/app.js` (legacy monolith) AND `public/js/*.js` (modules) are BOTH loaded simultaneously.** Some socket listeners and UI handlers exist in BOTH files. When editing any client feature, always check both.

- `public/js/api.js` — `QV` namespace, global state, socket, utilities, XOR deobfuscation. **Must load first.**
- `public/js/game.js` — Game UI, timer, answer handling, game-over screen
- `public/js/lobby.js` — Lobby creation/join/browser
- `public/js/auth.js` — Firebase auth UI
- `public/js/profile.js` — Profile, leaderboard, ELO chart, settings
- `public/js/friends.js` — Friends list, challenge UI
- `public/js/chat.js` — Global chat, in-game chat, DMs

## Key Patterns

- **`getCurrentUser()` closure**: Socket handlers receive a function, not the user directly, because the reference changes mid-session.
- **Queue matching lock**: `_queueMatching` boolean in `matchmaking.js` prevents race conditions during async AI generation.
- **Bio auto-regen**: Every 3rd game (`gamesPlayed % 3 === 0`). All bio calls have `.catch()`.
- **ELO**: K=32 normal, K=48 disconnect. Floor 0. Starting 1000. Ranked = 2 players + not draw + `quick` or `custom+ranked`.
- **Cleanup intervals (30s)**: Stale lobbies (10min), tournaments (15min), finished games (30min).
- **Rate limiting**: In-memory sliding window. Reads `x-forwarded-for` first, then `req.ip`. Resets on restart.

## Game Modes

- **Quick 1v1**: `quickQueue` → 2 players matched → AI generates 7 questions → ranked
- **Custom lobby**: Host creates → others join → host starts → AI generates questions → ranked optional
- **Solo practice**: AI or preset questions → no ELO impact
- **Tournament**: Single elimination bracket, 4/8/16 players
- **Friend challenge**: Direct challenge → friend accepts → AI generates questions

## Data Shapes

**User**: `{ id, username, firebaseUid, email, photoURL, elo, stats: { totalWins, totalLosses, gamesPlayed, correctAnswers, totalAnswers, categories }, friends[], friendRequests[], bio, matchHistory[50], eloHistory[100], notifications[50] }`

**Game**: `{ id, type(quick|custom|solo|tournament), topic, players[{userId, username, socketId, score, answers[]}], questions[{question, options[4], correct(0-3), difficulty}], currentQuestion, timeLimit, status(playing|finished) }`

**Ranks**: Bronze(0-999), Silver(1000-1199), Gold(1200-1399), Platinum(1400-1599), Diamond(1600-1799), Master(1800-1999), Grandmaster(2000+)
