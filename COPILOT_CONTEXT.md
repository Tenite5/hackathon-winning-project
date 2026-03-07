# QVIZIO RANKED — Project Context for AI Assistants

> **Read this file at the start of every session.** It contains everything you need to understand the project without re-reading the entire codebase.

---

## What Is This?

QVIZIO is a **real-time competitive trivia game** with ELO ranking. Players can:

- Play **quick 1v1 ranked matches** (AI-generated questions, random topic)
- Create **custom lobbies** (up to 8 players, custom topic/settings)
- Play **solo practice** (AI or preset questions, no ELO impact)
- Run **single-elimination tournaments** (4/8/16 players)
- Challenge friends directly
- Chat globally, in-game, or via DMs
- Track wrong answers and get AI explanations

**Language**: Georgian + English mix (presets are in Georgian, UI is English)

---

## Tech Stack

| Layer    | Tech                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Runtime  | Node.js 18+                                                                                               |
| Server   | Express 5 + Socket.io 4                                                                                   |
| Database | MongoDB via Mongoose 9                                                                                    |
| Auth     | Firebase Auth (Google + Email/Password) → UUID session tokens                                             |
| AI       | Gemini (`gemini-3-flash-preview`) for questions; Groq (`llama-3.3-70b-versatile`) for bios + explanations |
| Client   | Vanilla JS SPA (no framework), single `index.html`                                                        |
| Security | Helmet, in-memory rate limiting, XOR question obfuscation                                                 |

**Start command**: `node server.js` (or `npm start`)  
**Port**: `process.env.PORT` or 3000  
**Env vars needed**: `MONGODB_URI`, `GEMINI_API_KEY`, `GROQ_API_KEY`, Firebase env vars (see `.env`)

---

## Architecture Overview

```
server.js                  → Entry point: loads env, connects MongoDB, starts server
src/app.js                 → Express + Socket.io setup, mounts routes under /api
src/config.js              → Constants: ranks, preset questions, quick-game topics
src/db/store.js            → Hybrid data store (in-memory Maps + MongoDB persistence)
src/db/models/*.js         → Mongoose schemas (User, Session, Message, WrongAnswer)
src/middleware/auth.js      → Session auth (requireAuth middleware, socketAuth)
src/middleware/rateLimit.js → In-memory rate limiters (Express + Socket)
src/middleware/validate.js  → Input validation/sanitization helpers
src/services/ai.js         → Gemini for questions, Groq for bios + explanations
src/services/elo.js        → ELO calculation, rank lookup, user sanitization
src/services/gameEngine.js → Core game loop: questions → answers → scoring → game-over
src/services/notifications.js → Push notifications via socket + persist to user object
src/sockets/index.js       → Socket.io connection handler, cleanup intervals
src/sockets/game.js        → In-game: answer submission, game chat
src/sockets/lobby.js       → Lobby CRUD, solo mode, preset games
src/sockets/matchmaking.js → Quick queue, friend challenges
src/sockets/chat.js        → Global chat
src/sockets/tournament.js  → Tournament lifecycle + bracket management
src/routes/auth.js         → Firebase auth, profile setup, session management
src/routes/profile.js      → Profile, leaderboard, bio, settings, match/ELO history, notifications
src/routes/friends.js      → Friend requests, accept/decline, friend list
src/routes/messages.js     → Direct messages (friends only)
src/routes/lobbies.js      → List public lobbies
src/routes/tournaments.js  → List tournaments
src/routes/questions.js    → Wrong-answer log, AI explain (single)
```

### Client-Side (`public/`)

```
public/index.html          → SPA HTML: all views, panels, modals (1158 lines)
public/styles.css           → All CSS
public/app.js               → Legacy monolith (partially duplicated by js/ modules)
public/js/api.js            → QV namespace, state, socket, utilities, deobfuscation (LOAD FIRST)
public/js/app.js            → Main entry: sidebar nav, auto-login, onAuthenticated flow
public/js/auth.js           → Firebase auth UI, Google sign-in, email/password, profile setup
public/js/chat.js           → Global chat, in-game chat, DMs, online count
public/js/friends.js        → Friends list, requests, challenge UI
public/js/game.js           → Game UI: questions, timer, answers, round summary, game-over
public/js/lobby.js          → Lobby creation/join/browser
public/js/mobile.js         → Mobile nav, more menu, mobile chat overlay
public/js/notifications.js  → Notification bell panel
public/js/particles.js      → Canvas particle background animation
public/js/profile.js        → Profile panel, public profiles, leaderboard, ELO chart, settings
public/js/tournament.js     → Tournament creation/join/list
public/js/wronglog.js       → Wrong answers panel with individual AI explain
```

> **IMPORTANT**: `public/app.js` is an older monolithic file that partially duplicates `public/js/*.js` modules. Both are loaded — some features exist in both. When editing client features, **check both** `public/app.js` AND the relevant `public/js/*.js` module.

---

## Data Store Design

**Hybrid model** — everything lives in in-memory JS Maps for speed, with MongoDB backing for persistence.

### Persistent (MongoDB-backed)

| Map               | Key                   | Value                                        | Mongoose Model            |
| ----------------- | --------------------- | -------------------------------------------- | ------------------------- |
| `db.users`        | `userId` (UUID)       | Full user object                             | `User.js`                 |
| `db.sessions`     | `sessionToken` (UUID) | `userId`                                     | `Session.js` (30-day TTL) |
| `db.messages`     | `"userId1_userId2"`   | `[{ from, to, text, ts }]`                   | `Message.js`              |
| `db.wrongAnswers` | `userId`              | `[{ question, options, correctIndex, ... }]` | `WrongAnswer.js`          |

### Ephemeral (memory-only, lost on restart)

| Map/Array        | Key                   | Value                              |
| ---------------- | --------------------- | ---------------------------------- |
| `db.games`       | `gameId` (UUID)       | Game state object                  |
| `db.lobbies`     | `lobbyId` (UUID)      | Lobby state object                 |
| `db.tournaments` | `tournamentId` (UUID) | Tournament state object            |
| `db.quickQueue`  | (array)               | `[{ userId, socketId, joinedAt }]` |
| `db.globalChat`  | (array, max 100)      | `[{ userId, username, text, ts }]` |
| `db.challenges`  | `challengeId`         | `{ fromId, toId, topic, ... }`     |

### Save pattern

All `db.save*()` methods are **fire-and-forget** upserts — they call Mongoose `findByIdAndUpdate` with `{ upsert: true }` and `.catch()` log errors.

---

## Authentication Flow

1. Client fetches Firebase config from `GET /api/firebase-config`
2. User signs in via Firebase (Google popup or Email/Password)
3. Client gets Firebase `idToken` → sends `POST /api/firebase-auth`
4. Server verifies via `admin.auth().verifyIdToken()`
5. Server creates/finds user, generates UUID session token, stores in `db.sessions`
6. Client stores token in `localStorage`, sends it as:
   - **HTTP**: `Authorization: Bearer {token}` header
   - **Socket**: `socket.emit('auth', token)` on connect
7. New users get `needsSetup: true` → must complete profile (username + optional avatar) before playing

---

## Game Flow (End-to-End)

### 1. Matchmaking

- **Quick game**: Player joins `quickQueue` → when 2 players queued → matched → AI generates 7 questions on random topic → game created
- **Custom lobby**: Host creates lobby → others join → host clicks start → AI generates questions → game created
- **Solo practice**: Player starts solo → AI generates questions (or uses preset) → solo game created (no lobby)
- **Challenge**: Player challenges friend → friend accepts → AI generates questions → game created
- **Tournament match**: Bracket pairing → AI generates questions → game created

### 2. Question Delivery

- Server XOR-obfuscates question text and options (key: `'QvZ!0_s3cR3t'`) → base64
- Emits `game-question` with obfuscated data + timer info
- Client deobfuscates and renders

### 3. Answering & Scoring

- Player clicks answer → `game-answer` socket event → server calculates:
  - **Correct**: 70 base + speed bonus (up to 30). Speed bonus = `round(30 × max(0, 1 - elapsed/timeLimit))`
  - **Wrong/Timeout**: 0 points
- Server emits `answer-result` to answerer, `opponent-answered` to others
- Timer expiry (timeLimit + 1s buffer): unanswered players get timeout (-1)

### 4. Round Progression

- After all answers: `round-summary` emitted with scores
- Wait 3s (2-player) or 5s (>2 players)
- Next question or → game end

### 5. Game End (`endGame()`)

- Determine winner (highest score)
- **If ranked** (2 players, not draw, quick/custom+ranked): Calculate ELO changes (K=32)
- Update stats: wins, losses, gamesPlayed, correctAnswers, totalAnswers, per-category stats
- Record wrong answers (capped at 100/user)
- Record match history (capped at 50) + ELO history (capped at 100)
- **Auto bio regen**: Every 3rd game played
- Emit `game-over` with full review data
- **Tournament**: Update bracket winner → check round completion → advance or finish

### Disconnect Forfeit

- If a player disconnects mid-game in a ranked match:
  - K-factor bumped to **48** (penalty)
  - Remaining player wins with ELO changes applied

---

## ELO System

| Parameter         | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| K-factor          | 32 (normal), 48 (disconnect forfeit)                                  |
| Starting ELO      | 1000                                                                  |
| ELO floor         | 0                                                                     |
| Formula           | Standard ELO: $E = \frac{1}{1 + 10^{(E_L - E_W)/400}}$                |
| Ranked conditions | 2 players, not a draw, type = `quick` or `custom` with `ranked: true` |

### Rank Tiers

| Rank        | ELO Range | Color     |
| ----------- | --------- | --------- |
| Bronze      | 0–999     | `#cd7f32` |
| Silver      | 1000–1199 | `#c0c0c0` |
| Gold        | 1200–1399 | `#ffd700` |
| Platinum    | 1400–1599 | `#e5e4e2` |
| Diamond     | 1600–1799 | `#b9f2ff` |
| Master      | 1800–1999 | `#9b59b6` |
| Grandmaster | 2000+     | `#e74c3c` |

---

## AI Services

**Question Generation** — Google Gemini (`gemini-3-flash-preview`)
**Bio + Explanations** — Groq (`llama-3.3-70b-versatile`) via `groq-sdk` — API key in `.env` (`GROQ_API_KEY`)

| Function                                       | Provider | Purpose                       | Temp | Limit            |
| ---------------------------------------------- | -------- | ----------------------------- | ---- | ---------------- |
| `generateQuestions(topic, count, difficulty?)` | Gemini   | Generate trivia questions     | 0.6  | 4096 tokens      |
| `generateBio(user)`                            | Groq     | Witty roast/boast player bio  | 0.85 | **40 words max** |
| `explainQuestion(...)`                         | Groq     | Explain a single wrong answer | 0.5  | **30 words max** |

All return parsed text/JSON. Fallbacks exist for all functions on error.

---

## Preset Question Banks

| ID          | Name             | Language | Questions | Time Limit |
| ----------- | ---------------- | -------- | --------- | ---------- |
| `hard-math` | ძნელი მათემატიკა | Georgian | 9         | 120s       |
| `sat`       | SAT              | English  | 6         | 30s        |
| `driving`   | Driving License  | English  | 3         | 30s        |

Preset games pick 3 random questions, shuffle option order, and run as **solo games** (not public lobbies).

---

## API Endpoints Reference

All endpoints are under `/api`. Rate limit: 120 req/min per IP.

### Auth

| Method | Path                | Auth | Description                              |
| ------ | ------------------- | ---- | ---------------------------------------- |
| GET    | `/firebase-config`  | No   | Firebase client config                   |
| POST   | `/firebase-auth`    | No   | Verify Firebase token → session (30/min) |
| POST   | `/complete-profile` | Yes  | Set username + avatar (first login)      |
| GET    | `/me`               | Yes  | Current user data                        |

### Profile

| Method | Path                            | Auth | Description                 |
| ------ | ------------------------------- | ---- | --------------------------- |
| GET    | `/leaderboard`                  | No   | Top 50 by ELO               |
| GET    | `/profile-by-name/:username`    | Yes  | Public profile by username  |
| GET    | `/profile/:userId`              | Yes  | Public profile by ID        |
| POST   | `/profile/regenerate-bio`       | Yes  | AI-generate new bio         |
| POST   | `/profile/update-settings`      | Yes  | Update username/avatar      |
| GET    | `/profile/match-history`        | Yes  | Last 50 matches             |
| GET    | `/profile/elo-history`          | Yes  | ELO chart data              |
| GET    | `/profile/notifications`        | Yes  | Notifications list          |
| POST   | `/profile/notifications/read`   | Yes  | Mark all notifications read |
| DELETE | `/profile/notifications/:index` | Yes  | Dismiss notification        |

### Social

| Method | Path                  | Auth | Description                 |
| ------ | --------------------- | ---- | --------------------------- |
| POST   | `/friends/request`    | Yes  | Send friend request         |
| POST   | `/friends/accept`     | Yes  | Accept friend request       |
| POST   | `/friends/decline`    | Yes  | Decline friend request      |
| GET    | `/friends`            | Yes  | Friends + pending requests  |
| GET    | `/messages/:friendId` | Yes  | DM thread (must be friends) |
| POST   | `/messages/:friendId` | Yes  | Send DM (max 500 chars)     |

### Game

| Method | Path                | Auth | Description                |
| ------ | ------------------- | ---- | -------------------------- |
| GET    | `/lobbies`          | Yes  | Public waiting lobbies     |
| GET    | `/tournaments`      | Yes  | All tournaments            |
| GET    | `/question-log`     | Yes  | Wrong answers list         |
| POST   | `/explain-question` | Yes  | AI explain single question |

---

## Socket Events Reference

### Client → Server

| Event                 | Data                                                                | Handler Location         |
| --------------------- | ------------------------------------------------------------------- | ------------------------ |
| `auth`                | `token`                                                             | `sockets/index.js`       |
| `queue-join`          | —                                                                   | `sockets/matchmaking.js` |
| `queue-leave`         | —                                                                   | `sockets/matchmaking.js` |
| `challenge-friend`    | `{ friendId, topic }`                                               | `sockets/matchmaking.js` |
| `challenge-accept`    | `{ challengeId }`                                                   | `sockets/matchmaking.js` |
| `challenge-decline`   | `{ challengeId }`                                                   | `sockets/matchmaking.js` |
| `challenge-cancel`    | `{ challengeId }`                                                   | `sockets/matchmaking.js` |
| `create-lobby`        | `{ topic, isPublic, timeLimit, questionCount, maxPlayers, ranked }` | `sockets/lobby.js`       |
| `join-lobby`          | `{ lobbyId }` or `{ inviteCode }`                                   | `sockets/lobby.js`       |
| `leave-lobby`         | `{ lobbyId }`                                                       | `sockets/lobby.js`       |
| `lobby-ready`         | `{ lobbyId }`                                                       | `sockets/lobby.js`       |
| `lobby-start`         | `{ lobbyId }`                                                       | `sockets/lobby.js`       |
| `solo-start`          | `{ topic, questionCount, timeLimit }`                               | `sockets/lobby.js`       |
| `preset-start`        | `{ presetId }`                                                      | `sockets/lobby.js`       |
| `game-answer`         | `{ gameId, answerIndex }`                                           | `sockets/game.js`        |
| `game-chat`           | `{ gameId, text }`                                                  | `sockets/game.js`        |
| `global-chat`         | `{ text }`                                                          | `sockets/chat.js`        |
| `global-chat-history` | —                                                                   | `sockets/chat.js`        |
| `create-tournament`   | `{ topic, maxPlayers, timeLimit, questionCount }`                   | `sockets/tournament.js`  |
| `join-tournament`     | `{ tournamentId }`                                                  | `sockets/tournament.js`  |
| `start-tournament`    | `{ tournamentId }`                                                  | `sockets/tournament.js`  |

### Server → Client

| Event                                       | Data                                                                          | Description                    |
| ------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------ |
| `auth-success`                              | `{ user }`                                                                    | Socket authenticated           |
| `auth-error`                                | `message`                                                                     | Auth failed                    |
| `online-count`                              | `number`                                                                      | Connected user count           |
| `friend-online` / `friend-offline`          | `{ userId }`                                                                  | Friend status change           |
| `queue-matched`                             | `{ opponent, topic }`                                                         | Matched for quick game         |
| `queue-status`                              | `{ position }`                                                                | Queue position update          |
| `queue-error`                               | `{ message }`                                                                 | Queue error                    |
| `challenge-sent`                            | `{ challengeId }`                                                             | Challenge sent confirmation    |
| `challenge-received`                        | `{ challengeId, from, topic }`                                                | Incoming challenge             |
| `challenge-accepted` / `challenge-declined` | `{ challengeId }`                                                             | Challenge response             |
| `challenge-cancelled` / `challenge-expired` | `{ challengeId }`                                                             | Challenge ended                |
| `lobby-created`                             | `{ lobbyId, inviteCode, lobby }`                                              | Lobby created                  |
| `lobby-updated`                             | `lobby`                                                                       | Lobby state changed            |
| `lobby-game-start`                          | `{ gameId }`                                                                  | Lobby game starting            |
| `lobby-error`                               | `message`                                                                     | Lobby error                    |
| `lobbies-updated`                           | —                                                                             | Refresh lobby list             |
| `solo-generating`                           | —                                                                             | AI generating solo questions   |
| `solo-game-start`                           | `{ gameId }`                                                                  | Preset solo game ready         |
| `game-question`                             | `{ gameId, question, options, timeLimit, qNum, totalQ, encoded, questionId }` | Next question (XOR obfuscated) |
| `answer-result`                             | `{ correct, correctIndex, points, totalScore }`                               | Your answer result             |
| `opponent-answered`                         | `{ opponentId, answered: true }`                                              | Opponent submitted answer      |
| `round-summary`                             | `{ scores[], correctIndex, questionText }`                                    | Round results                  |
| `game-over`                                 | `{ winner, players[], eloChanges, questions[], ranked, type }`                | Game finished                  |
| `game-chat-msg`                             | `{ userId, username, text }`                                                  | In-game chat message           |
| `global-chat-msg`                           | `{ userId, username, text, ts }`                                              | Global chat message            |
| `global-chat-history`                       | `{ messages[] }`                                                              | Chat history                   |
| `dm`                                        | `{ from, fromUsername, text, ts }`                                            | Direct message                 |
| `notification`                              | `{ notification }`                                                            | New notification               |
| `tournament-created`                        | `{ tournament }`                                                              | Tournament created             |
| `tournament-updated`                        | `{ tournament }`                                                              | Tournament state changed       |
| `tournament-round`                          | `{ round, matches }`                                                          | New tournament round           |
| `tournament-match-result`                   | `{ matchIndex, winnerId }`                                                    | Match in tournament ended      |
| `tournament-finished`                       | `{ winner }`                                                                  | Tournament complete            |
| `tournament-error`                          | `message`                                                                     | Tournament error               |
| `tournaments-updated`                       | —                                                                             | Refresh tournament list        |

---

## User Object Shape

```js
{
  id: 'uuid',
  username: 'string',
  passwordHash: '',           // unused (Firebase handles auth)
  googleId: '',
  firebaseUid: 'string',
  email: 'string',
  photoURL: 'string',         // avatar URL or base64 data URI
  needsSetup: false,
  elo: 1000,
  stats: {
    totalWins: 0,
    totalLosses: 0,
    totalAnswers: 0,
    correctAnswers: 0,
    gamesPlayed: 0,
    categories: {
      'Topic Name': { wins: 0, losses: 0, totalAnswers: 0, correctAnswers: 0, accuracy: 0.75 }
    }
  },
  friends: ['userId', ...],
  friendRequests: [{ from: 'userId', username: 'str', ts: 123 }, ...],
  bio: 'AI-generated witty bio',
  matchHistory: [{ matchId, type, topic, result, myScore, opponents[], eloChange, timestamp }, ...],  // max 50
  eloHistory: [{ elo, timestamp }, ...],   // max 100
  notifications: [{ id, type, title, message, fromUserId?, read, ts }, ...],  // max 50
  online: false,
  socketId: null,
  createdAt: Date
}
```

---

## Game Object Shape

```js
{
  id: 'uuid',
  type: 'quick' | 'custom' | 'solo' | 'tournament',
  topic: 'string',
  players: [{
    userId: 'uuid',
    username: 'string',
    socketId: 'string',
    score: 0,
    answers: [{ answerIndex, correct, points, time }, ...]
  }, ...],
  questions: [{ question, options[4], correct(0-3), difficulty, explanation? }, ...],
  currentQuestion: 0,          // index
  timeLimit: 10,               // seconds
  questionStartTime: null,     // timestamp when current question was sent
  status: 'playing' | 'finished',
  ranked: true/false,          // only for custom games
  chat: [{ userId, username, text, ts }, ...],
  createdAt: Date,
  // Tournament games only:
  tournamentId: 'uuid',
  matchIndex: 0
}
```

---

## Lobby Object Shape

```js
{
  id: 'uuid',
  inviteCode: 'ABC123',
  topic: 'string',
  isPublic: true/false,
  ranked: true/false,
  hostId: 'userId',
  hostUsername: 'string',
  maxPlayers: 2-8,
  questionCount: 3-20,
  timeLimit: 5-30,
  players: [{ userId, username, socketId, score: 0, answers: [], ready: true/false }, ...],
  status: 'waiting' | 'playing',
  createdAt: Date,
  expiresAt: Date,             // +10 minutes
  // Preset lobbies only:
  presetId: 'string',
  presetQuestions: [...]
}
```

---

## Known Patterns & Quirks

1. **Dual client files**: `public/app.js` (monolith) AND `public/js/*.js` (modules) — both loaded and active. Some event handlers exist in both. Always check both when editing.

2. **`getCurrentUser()` closure**: Socket handlers receive a `getCurrentUser` function (not the user directly) because the user reference can change during a session.

3. **Fire-and-forget persistence**: All `db.save*()` calls are async but not awaited. Errors are caught and logged but don't block the flow.

4. **Rate limiting is in-memory**: Resets on server restart. Per-IP for HTTP, per-socket for WebSocket (30 events/10s).

5. **Question obfuscation**: XOR with key `'QvZ!0_s3cR3t'` → base64. Not cryptographic, just prevents casual devtools cheating.

6. **Cleanup intervals (30s)**: Auto-expires stale lobbies (10min), tournaments (15min), finished games (30min).

7. **Bio auto-regen**: Triggers every 3rd game played (`gamesPlayed % 3 === 0`).

8. **DM thread key ordering**: Checks both `"a_b"` and `"b_a"` for existing threads. New threads created with consistent ordering.

9. **Preset games**: Create a solo game directly (not a lobby). Options are shuffled, correctIndex recalculated.

10. **Tournament bracket**: Single elimination. Odd players get bye (auto-advance). Matches are independent games with their own AI questions.

---

## Recent Changes Log

### March 7, 2026

- **Fixed**: Preset games from solo practice no longer create public lobbies — they now create solo games directly and emit `solo-game-start` instead of `lobby-created`
- **Added**: `solo-game-start` socket event handler on client (both `game.js` and `app.js`)
- **Changed**: Bio generation now uses **Groq API** (`llama-3.3-70b-versatile`) instead of Gemini — much faster
- **Changed**: Bio limit changed from token-based (600 tokens) to **40 words max** in prompt
- **Changed**: Mistake explanations now use **Groq API** instead of Gemini — much faster
- **Changed**: Explanation limit changed from token-based (500 tokens) to **30 words max** in prompt
- **Removed**: `explainQuestionsBatch()` function and `POST /explain-questions-batch` route
- **Removed**: "Explain All" batch button from wronglog.js (individual explains are now fast enough via Groq)
- **Added**: `groq-sdk` dependency in package.json
- **Fixed**: Moved Groq API key from hardcoded in `ai.js` to `.env` (`GROQ_API_KEY`) to avoid GitHub secret scanning blocks
- **Added**: `groq-sdk` dependency in package.json
