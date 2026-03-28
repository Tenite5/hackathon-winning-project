# QUIZIO RANKED — Project Context for AI Agents

> **Read this file at the start of every session.** It contains everything needed to understand and work on this project without re-reading the entire codebase.

---

## 1. What Is This?

**QUIZIO** is a real-time competitive trivia game with ELO ranking, built for a hackathon and deployed on Railway. Players can:

- Play **quick 1v1 ranked matches** (AI-generated questions, random topic)
- Create **custom lobbies** (up to 8 players, custom topic/settings, optional ranking)
- Play **solo practice** (AI or preset questions, no ELO impact)
- Run **single-elimination tournaments** (4/8/16 players)
- Challenge friends directly
- Play against **bot-hosted lobbies** (auto-created, AI opponents)
- Upload PDFs and generate quizzes from them
- Chat globally, in-game, or via DMs
- Track wrong answers and get AI explanations

**Language**: Georgian preset questions + English UI.

---

## 2. Tech Stack

| Layer      | Tech                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| Runtime    | Node.js 18+                                                           |
| Server     | Express 5 + Socket.io 4                                                |
| Database   | MongoDB via Mongoose 9                                                 |
| Auth       | Firebase Auth (Google + Email/Password) → UUID session tokens          |
| AI (Q's)   | Google Gemini (`gemini-2.0-flash`) — question generation               |
| AI (Bios)  | Groq (`llama-3.3-70b-versatile`) — bios + wrong-answer explanations   |
| Client     | Vanilla JS SPA (no framework), single `index.html`                    |
| Security   | Helmet, in-memory rate limiting, XOR question obfuscation              |
| Deployment | Railway                                                                |

---

## 3. Commands

```bash
npm install        # Install dependencies
npm start          # Start server (node server.js)
npm run dev        # Same as npm start (no hot reload configured)
npm run build      # No-op (echo 'No build step')
```

**Env vars required** (in `.env`):
- `PORT` (default 3000)
- `CORS_ORIGIN` (default `http://localhost:3000`)
- `MONGODB_URI`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- Firebase vars: `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`
- `ADMIN_ENABLED=true` (optional, enables `/admin` panel)

---

## 4. Project Structure

```
hackathon-winning-project/
├── server.js                         # Entry point: loads env, connects MongoDB, starts HTTP
├── package.json                      # Dependencies & scripts
├── .env                              # Environment variables (not committed)
├── .gitignore
├── README.md                         # Public-facing project readme
├── CONTEXT.md                        # THIS FILE — AI agent context
│
├── src/                              # ── SERVER-SIDE CODE ──
│   ├── app.js                        # Express + Socket.io setup, mounts all routes under /api
│   ├── config.js                     # Constants: ranks, preset question banks, bio characters, topics
│   │
│   ├── db/
│   │   ├── store.js                  # Hybrid data store (in-memory Maps + MongoDB persistence)
│   │   └── models/
│   │       ├── User.js               # User schema
│   │       ├── Session.js            # Session schema (30-day TTL)
│   │       ├── Message.js            # DM messages schema
│   │       ├── WrongAnswer.js        # Wrong answer log schema
│   │       ├── Pdf.js                # Uploaded PDF schema
│   │       ├── QuestionCache.js      # Cached AI-generated questions
│   │       └── QuestionPool.js       # Pre-generated question pool
│   │
│   ├── middleware/
│   │   ├── auth.js                   # Session auth (requireAuth, socketAuth)
│   │   ├── rateLimit.js              # In-memory rate limiters (Express + Socket)
│   │   ├── dailyLimits.js            # Daily usage limits middleware
│   │   └── validate.js               # Input validation/sanitization helpers
│   │
│   ├── services/
│   │   ├── ai.js                     # Gemini for questions, Groq for bios + explanations
│   │   ├── elo.js                    # ELO calculation, rank lookup, user sanitization
│   │   ├── gameEngine.js             # Core game loop: questions → answers → scoring → game-over
│   │   ├── notifications.js          # Push notifications via socket + persist to user object
│   │   ├── questionPool.js           # Pre-generated question pool management
│   │   ├── botManager.js             # Bot player management for AI opponents
│   │   ├── botLobbies.js             # Auto-created bot-hosted lobby system
│   │   └── pdfAnalysis.js            # PDF upload → extract text → generate quiz questions
│   │
│   ├── sockets/
│   │   ├── index.js                  # Socket.io connection handler, auth, cleanup intervals
│   │   ├── game.js                   # In-game: answer submission, game chat
│   │   ├── lobby.js                  # Lobby CRUD, solo mode, preset games
│   │   ├── matchmaking.js            # Quick queue, friend challenges
│   │   ├── chat.js                   # Global chat
│   │   └── tournament.js             # Tournament lifecycle + bracket management
│   │
│   ├── routes/
│   │   ├── auth.js                   # Firebase auth, profile setup, session management
│   │   ├── profile.js                # Profile, leaderboard, bio, settings, match/ELO history
│   │   ├── friends.js                # Friend requests, accept/decline, friend list
│   │   ├── messages.js               # Direct messages (friends only)
│   │   ├── lobbies.js                # List public lobbies
│   │   ├── tournaments.js            # List tournaments
│   │   ├── questions.js              # Wrong-answer log, AI explain
│   │   ├── pdf.js                    # PDF upload and quiz generation endpoints
│   │   ├── subscription.js           # Subscription/premium features
│   │   └── admin.js                  # Admin panel routes (conditional, ADMIN_ENABLED)
│   │
│   ├── data/
│   │   └── botProfiles.js            # Bot profile data (names, avatars, personalities)
│   │
│   └── presets/
│       ├── math/                     # Georgian math exam preset questions (JSON files)
│       └── sat/                      # SAT preset questions (ALL SAT.json)
│
├── public/                           # ── CLIENT-SIDE CODE ──
│   ├── index.html                    # SPA HTML: all views, panels, modals (~1200 lines)
│   ├── styles.css                    # All CSS (~159KB)
│   ├── app.js                        # ⚠️ LEGACY monolith (partially duplicated by js/ modules)
│   │
│   ├── js/
│   │   ├── api.js                    # QV namespace, global state, socket, utils, XOR deobfuscation (LOAD FIRST)
│   │   ├── app.js                    # Main entry: sidebar nav, auto-login, onAuthenticated flow
│   │   ├── auth.js                   # Firebase auth UI, Google sign-in, email/password, profile setup
│   │   ├── game.js                   # Game UI: questions, timer, answers, round summary, game-over
│   │   ├── lobby.js                  # Lobby creation/join/browser
│   │   ├── chat.js                   # Global chat, in-game chat, DMs, online count
│   │   ├── friends.js                # Friends list, requests, challenge UI
│   │   ├── profile.js                # Profile panel, public profiles, leaderboard, ELO chart, settings
│   │   ├── tournament.js             # Tournament creation/join/list
│   │   ├── notifications.js          # Notification bell panel
│   │   ├── particles.js              # Canvas particle background animation
│   │   ├── mobile.js                 # Mobile nav, more menu, mobile chat overlay
│   │   ├── wronglog.js               # Wrong answers panel with individual AI explain
│   │   ├── customquiz.js             # Custom quiz creation UI
│   │   └── pdfmode.js                # PDF upload and quiz mode UI
│   │
│   └── images/
│       └── bots/                     # Bot avatar images
│
└── admin/
    └── index.html                    # Admin panel (enabled via ADMIN_ENABLED env var)
```

---

## 5. Critical Patterns & Gotchas

### ⚠️ Dual Client Files (MOST IMPORTANT)

**`public/app.js` (legacy monolith, ~62KB) AND `public/js/*.js` (modules) are BOTH loaded simultaneously.** Some socket event listeners and UI handlers exist in BOTH files. When editing any client feature, **always search both** `public/app.js` AND the relevant `public/js/*.js` module, or you will create bugs.

### `getCurrentUser()` Closure

Socket handlers on the server receive a `getCurrentUser` **function** (not the user object directly) because the user reference can change during a session (e.g., profile updates).

### Fire-and-Forget Persistence

All `db.save*()` calls in `store.js` are async but **never awaited**. They call Mongoose `findByIdAndUpdate` with `{ upsert: true }` and `.catch()` log errors. This means data loss is possible on crashes but is acceptable for this use case.

### Rate Limiting is In-Memory

Resets on every server restart. Per-IP for HTTP (120 req/min), per-socket for WebSocket (30 events/10s). Reads `x-forwarded-for` first, then `req.ip`.

### Question Obfuscation

Questions are XOR-encrypted with key `'QvZ!0_s3cR3t'` → base64 before being sent to clients. Not cryptographic — just preventing casual cheating via devtools. Client deobfuscation is in `public/js/api.js`.

### Cleanup Intervals (30s)

Server runs periodic cleanup: stale lobbies (10min), tournaments (15min), finished games (30min).

### Bio Auto-Regeneration

Triggers every 3rd game played (`gamesPlayed % 3 === 0`). All bio API calls have `.catch()`.

### Bot System

Bot-hosted lobbies are auto-created on server start. Bot profiles are defined in `src/data/botProfiles.js`. Bot AI behavior is managed by `botManager.js` and `botLobbies.js`.

### Question Pools

Pre-generated question pools are warmed up on server start (`questionPool.js`). This prevents cold-start latency for the first few games.

---

## 6. Data Store Design

### Hybrid Model

Everything lives in in-memory JS Maps for speed, with MongoDB backing for persistence.

#### Persistent (MongoDB-backed)

| Map               | Key                   | Value                                        | Model              |
| ----------------- | --------------------- | -------------------------------------------- | ------------------- |
| `db.users`        | `userId` (UUID)       | Full user object                             | `User.js`           |
| `db.sessions`     | `sessionToken` (UUID) | `userId`                                     | `Session.js` (30d)  |
| `db.messages`     | `"userId1_userId2"`   | `[{ from, to, text, ts }]`                   | `Message.js`        |
| `db.wrongAnswers` | `userId`              | `[{ question, options, correctIndex, … }]`   | `WrongAnswer.js`    |

#### Ephemeral (memory-only, lost on restart)

| Map/Array        | Key                   | Value                              |
| ---------------- | --------------------- | ---------------------------------- |
| `db.games`       | `gameId` (UUID)       | Game state object                  |
| `db.lobbies`     | `lobbyId` (UUID)      | Lobby state object                 |
| `db.tournaments` | `tournamentId` (UUID) | Tournament state object            |
| `db.quickQueue`  | (array)               | `[{ userId, socketId, joinedAt }]` |
| `db.globalChat`  | (array, max 100)      | `[{ userId, username, text, ts }]` |
| `db.challenges`  | `challengeId`         | `{ fromId, toId, topic, … }`      |

---

## 7. Authentication Flow

1. Client fetches Firebase config from `GET /api/firebase-config`
2. User signs in via Firebase (Google popup or Email/Password)
3. Client gets Firebase `idToken` → sends `POST /api/firebase-auth`
4. Server verifies via `admin.auth().verifyIdToken()`
5. Server creates/finds user, generates UUID session token, stores in `db.sessions`
6. Client stores token in `localStorage` (`quizio_token`), sends it as:
   - **HTTP**: `Authorization: Bearer {token}` header
   - **Socket**: `socket.emit('auth', token)` on connect
7. New users get `needsSetup: true` → must complete profile (username + optional avatar) before playing

---

## 8. Game Flow (End-to-End)

### Matchmaking

| Mode              | Flow                                                                           |
| ----------------- | ------------------------------------------------------------------------------ |
| **Quick 1v1**     | Join `quickQueue` → 2 matched → AI generates 7 questions on random topic → game |
| **Custom Lobby**  | Host creates → others join → host starts → AI generates questions → game       |
| **Solo Practice** | Start solo → AI generates or uses preset questions → solo game (no ELO)        |
| **Challenge**     | Challenge friend → friend accepts → AI generates → game                        |
| **Tournament**    | Bracket pairing → AI generates → game per match                                |
| **Bot Lobby**     | Auto-created → player joins → bot opponents → game                             |

### Question Delivery

Server XOR-obfuscates question text + options (key: `'QvZ!0_s3cR3t'`) → base64 → emits `game-question`. Client deobfuscates and renders.

### Scoring

- **Correct answer**: 70 base + speed bonus (up to 30). Speed bonus = `round(30 × max(0, 1 - elapsed/timeLimit))`
- **Wrong/Timeout**: 0 points
- Timer expiry buffer: `timeLimit + 1s`

### Round Flow

After all answers → `round-summary` emitted → wait 3s (2-player) or 5s (3+ players) → next question or game end.

### Game End (`endGame()`)

1. Determine winner (highest score)
2. If ranked (2 players, not draw, quick or custom+ranked): Calculate ELO changes (K=32)
3. Update stats: wins, losses, gamesPlayed, correctAnswers, totalAnswers, per-category stats
4. Record wrong answers (capped at 100/user)
5. Record match history (capped at 50) + ELO history (capped at 100)
6. Auto bio regen every 3rd game
7. Emit `game-over` with full review data

### Disconnect Forfeit

If a player disconnects mid-game in a ranked match: K-factor bumped to **48** (penalty), remaining player wins.

---

## 9. ELO System

| Parameter         | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| K-factor          | 32 (normal), 48 (disconnect forfeit)                                  |
| Starting ELO      | 1000                                                                  |
| ELO floor         | 0                                                                     |
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

## 10. AI Services

| Function                   | Provider | Purpose                       | Temp | Limit            |
| -------------------------- | -------- | ----------------------------- | ---- | ---------------- |
| `generateQuestions(topic, count, difficulty?)` | Gemini | Generate trivia questions | 0.6 | 4096 tokens |
| `generateBio(user)`        | Groq     | Creative narrative player bio | 0.95 | 50-60 words      |
| `explainQuestion(…)`       | Groq     | Explain a single wrong answer | 0.5  | 30 words max     |

All functions have fallbacks on error. Gemini has a **15s timeout** via `withTimeout()`.

### Bio Characters

Configurable bio narration styles defined in `config.js`:
`default` (Standard), `british` (Critical Brit), `vader` (Darth Vader), `shakespeare`, `ramsay` (Gordon Ramsay), `sherlock` (Sherlock Holmes).

---

## 11. Preset Question Banks

| ID     | Name                          | Language | Source         |
| ------ | ----------------------------- | -------- | -------------- |
| `math` | მათემატიკის ეროვნული გამოცდა  | Georgian | 40 JSON files  |
| `sat`  | SAT                           | English  | ALL SAT.json   |

Preset games pick random questions, shuffle option order, recalculate `correctIndex`, and run as **solo games** (not public lobbies).

---

## 12. API Endpoints

All under `/api`. Rate limit: 120 req/min per IP.

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

## 13. Socket Events

### Client → Server

| Event                 | Data                                                                | Handler               |
| --------------------- | ------------------------------------------------------------------- | --------------------- |
| `auth`                | `token`                                                             | `sockets/index.js`    |
| `queue-join`          | —                                                                   | `sockets/matchmaking.js` |
| `queue-leave`         | —                                                                   | `sockets/matchmaking.js` |
| `challenge-friend`    | `{ friendId, topic }`                                               | `sockets/matchmaking.js` |
| `challenge-accept`    | `{ challengeId }`                                                   | `sockets/matchmaking.js` |
| `challenge-decline`   | `{ challengeId }`                                                   | `sockets/matchmaking.js` |
| `challenge-cancel`    | `{ challengeId }`                                                   | `sockets/matchmaking.js` |
| `create-lobby`        | `{ topic, isPublic, timeLimit, questionCount, maxPlayers, ranked }` | `sockets/lobby.js`    |
| `join-lobby`          | `{ lobbyId }` or `{ inviteCode }`                                   | `sockets/lobby.js`    |
| `leave-lobby`         | `{ lobbyId }`                                                       | `sockets/lobby.js`    |
| `lobby-ready`         | `{ lobbyId }`                                                       | `sockets/lobby.js`    |
| `lobby-start`         | `{ lobbyId }`                                                       | `sockets/lobby.js`    |
| `solo-start`          | `{ topic, questionCount, timeLimit }`                               | `sockets/lobby.js`    |
| `preset-start`        | `{ presetId }`                                                      | `sockets/lobby.js`    |
| `game-answer`         | `{ gameId, answerIndex }`                                           | `sockets/game.js`     |
| `game-chat`           | `{ gameId, text }`                                                  | `sockets/game.js`     |
| `global-chat`         | `{ text }`                                                          | `sockets/chat.js`     |
| `global-chat-history` | —                                                                   | `sockets/chat.js`     |
| `create-tournament`   | `{ topic, maxPlayers, timeLimit, questionCount }`                   | `sockets/tournament.js` |
| `join-tournament`     | `{ tournamentId }`                                                  | `sockets/tournament.js` |
| `start-tournament`    | `{ tournamentId }`                                                  | `sockets/tournament.js` |

### Server → Client

| Event                          | Data                                                                          | Description                    |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------------------ |
| `auth-success`                 | `{ user }`                                                                    | Socket authenticated           |
| `auth-error`                   | `message`                                                                     | Auth failed                    |
| `online-count`                 | `number`                                                                      | Connected user count           |
| `friend-online/offline`        | `{ userId }`                                                                  | Friend status change           |
| `queue-matched`                | `{ opponent, topic }`                                                         | Matched for quick game         |
| `queue-status`                 | `{ position }`                                                                | Queue position update          |
| `queue-error`                  | `{ message }`                                                                 | Queue error                    |
| `challenge-sent`               | `{ challengeId }`                                                             | Challenge sent confirmation    |
| `challenge-received`           | `{ challengeId, from, topic }`                                                | Incoming challenge             |
| `challenge-accepted/declined`  | `{ challengeId }`                                                             | Challenge response             |
| `challenge-cancelled/expired`  | `{ challengeId }`                                                             | Challenge ended                |
| `lobby-created`                | `{ lobbyId, inviteCode, lobby }`                                              | Lobby created                  |
| `lobby-updated`                | `lobby`                                                                       | Lobby state changed            |
| `lobby-game-start`             | `{ gameId }`                                                                  | Lobby game starting            |
| `lobby-error`                  | `message`                                                                     | Lobby error                    |
| `lobbies-updated`              | —                                                                             | Refresh lobby list             |
| `solo-generating`              | —                                                                             | AI generating solo questions   |
| `solo-game-start`              | `{ gameId }`                                                                  | Preset/solo game ready         |
| `game-question`                | `{ gameId, question, options, timeLimit, qNum, totalQ, encoded, questionId }` | Next question (XOR obfuscated) |
| `answer-result`                | `{ correct, correctIndex, points, totalScore }`                               | Answer result                  |
| `opponent-answered`            | `{ opponentId, answered: true }`                                              | Opponent submitted             |
| `round-summary`                | `{ scores[], correctIndex, questionText }`                                    | Round results                  |
| `game-over`                    | `{ winner, players[], eloChanges, questions[], ranked, type }`                | Game finished                  |
| `game-chat-msg`                | `{ userId, username, text }`                                                  | In-game chat message           |
| `global-chat-msg`              | `{ userId, username, text, ts }`                                              | Global chat message            |
| `global-chat-history`          | `{ messages[] }`                                                              | Chat history                   |
| `dm`                           | `{ from, fromUsername, text, ts }`                                            | Direct message                 |
| `notification`                 | `{ notification }`                                                            | New notification               |
| `tournament-created`           | `{ tournament }`                                                              | Tournament created             |
| `tournament-updated`           | `{ tournament }`                                                              | Tournament state changed       |
| `tournament-round`             | `{ round, matches }`                                                          | New tournament round           |
| `tournament-match-result`      | `{ matchIndex, winnerId }`                                                    | Match ended                    |
| `tournament-finished`          | `{ winner }`                                                                  | Tournament complete            |
| `tournament-error`             | `message`                                                                     | Tournament error               |
| `tournaments-updated`          | —                                                                             | Refresh tournament list        |

---

## 14. Data Shapes

### User Object

```js
{
  id: 'uuid',
  username: 'string',
  firebaseUid: 'string',
  email: 'string',
  photoURL: 'string',             // avatar URL or base64 data URI
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

### Game Object

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
  currentQuestion: 0,
  timeLimit: 10,                 // seconds
  questionStartTime: null,
  status: 'playing' | 'finished',
  ranked: true/false,
  chat: [{ userId, username, text, ts }, ...],
  createdAt: Date,
  // Tournament games only:
  tournamentId: 'uuid',
  matchIndex: 0
}
```

### Lobby Object

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
  expiresAt: Date,               // +10 minutes
  // Preset lobbies only:
  presetId: 'string',
  presetQuestions: [...]
}
```

---

## 15. localStorage Keys (Client)

| Key              | Purpose                                |
| ---------------- | -------------------------------------- |
| `quizio_token`   | Session token for auth                 |
| `quizio_theme`   | Dark/light theme preference            |

Legacy keys `qvizio_token` and `qvizio_theme` are migrated automatically on load.

---

## 16. Key Dependencies

| Package          | Version  | Purpose                              |
| ---------------- | -------- | ------------------------------------ |
| `express`        | 5.x      | HTTP server framework                |
| `socket.io`      | 4.x      | WebSocket real-time communication    |
| `mongoose`       | 9.x      | MongoDB ODM                          |
| `firebase-admin` | 13.x     | Server-side Firebase auth            |
| `@google/genai`  | 1.x      | Google Gemini AI for questions       |
| `groq-sdk`       | 0.37.x   | Groq AI for bios + explanations      |
| `helmet`         | 8.x      | HTTP security headers                |
| `multer`         | 2.x      | File upload handling (PDF)           |
| `pdf-lib`        | 1.x      | PDF text extraction                  |
| `uuid`           | 13.x     | UUID generation                      |
| `dotenv`         | 17.x     | Environment variable loading         |

---

## 17. Deployment Notes

- **Platform**: Railway
- **Port**: Uses `process.env.PORT` (Railway sets this automatically)
- **No build step**: Static files served directly from `public/`
- **MongoDB**: Use MongoDB Atlas connection string in `MONGODB_URI`
- **Graceful shutdown**: `SIGTERM`/`SIGINT` handlers close server + MongoDB connection with 10s force timeout
