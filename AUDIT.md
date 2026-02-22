# QVIZIO — Comprehensive Project Audit

*Generated: 2026-02-22*

---

## Table of Contents

1. [🐛 Bugs to Fix](#-bugs-to-fix)
2. [✨ New Feature Suggestions](#-new-feature-suggestions)
3. [💎 Professionalism Improvements](#-professionalism-improvements)
4. [📋 Pre-Release Checklist](#-pre-release-checklist)
5. [🖥️ Live UI/UX Testing — Visual & Feel Issues](#️-live-uiux-testing--visual--feel-issues)

---

## 🐛 Bugs to Fix

### **CRITICAL — Must Fix Before Release**

#### 1. 🔑 API Keys & Secrets Exposed in `.env` (Committed to Git)
- **File:** `.env`  
- **Issue:** The `.env` file contains your **Groq API key**, **MongoDB connection string** (with username & password `tenite:tenite199!`), and **Firebase credentials**. Even though `.env` is in `.gitignore`, the file currently exists in your repo copy. If this was ever pushed to GitHub, **all secrets are compromised**.
- **Fix:** 
  - Rotate ALL credentials immediately (Groq API key, MongoDB password, Firebase API key).
  - Ensure `.env` is listed in `.gitignore` (it is ✅) and was never committed.
  - Use `.env.example` with placeholder values for documentation.

#### 2. 🔓 No Session Expiration / Token Invalidation
- **File:** `src/db/models/Session.js`, `src/db/store.js`
- **Issue:** Sessions never expire. Once a token is created, it exists forever in the database. There is no `createdAt` or `expiresAt` field on sessions. A stolen token grants permanent access.
- **Fix:** Add `createdAt` to the Session model, and add a cleanup job that deletes sessions older than X days (e.g., 30 days). Also add a TTL index in MongoDB.

#### 3. 🚨 Login Form References Non-Existent Elements & Routes
- **File:** `public/app.js` (lines 185-203)
- **Issue:** The login form tries to read `$('login-username')` and the register form reads `$('register-username')`, but the HTML has email-based inputs (`login-email`, `register-email`). The form POSTs to `/api/login` and `/api/register`, but **there are no `/login` or `/register` routes defined** on the server — only Firebase auth via `/firebase-auth`. This means the **email/password sign-in form is completely broken** and will always error.
- **Fix:** Either wire up the login/register forms to use Firebase email/password auth (via the Firebase client SDK, similar to the Google auth flow), or remove the non-functional legacy forms entirely and update the frontend to only use Firebase auth.

#### 4. 🔥 `bcryptjs` Is Imported But Never Used
- **File:** `package.json`
- **Issue:** The `bcryptjs` dependency is listed but no route uses it — there is no password-hashing logic in the server code. The old username/password auth was likely removed when Firebase was added, but the dependency remains. The frontend still shows login/register forms that reference non-existent server endpoints.
- **Fix:** Remove `bcryptjs` from `package.json` if not needed, or implement legacy email/password auth properly.

#### 5. 🎮 Opponent Scoring Bug in Game Answer Handler
- **File:** `src/services/gameEngine.js`, `handleAnswer()` (line 327)
- **Issue:** `const opponent = game.players.find(p => p.userId !== currentUser.id);` assumes a 2-player game. In multiplayer games (3-8 players), this only notifies ONE opponent, not all remaining players.
- **Fix:** Change to a loop that notifies all other players:
  ```js
  game.players.forEach(p => {
      if (p.userId !== currentUser.id && p.socketId) {
          io.to(p.socketId).emit('opponent-answered', { hasAnswered: true });
      }
  });
  ```

#### 6. 💾 Fire-and-Forget DB Writes Can Silently Lose Data
- **File:** `src/db/store.js` (lines 95-144)
- **Issue:** All `saveUser()`, `saveSession()`, `saveMessages()`, `saveWrongAnswers()` methods use fire-and-forget patterns (`.catch(err => console.error(...))`). If MongoDB is temporarily unavailable, mutations are lost forever since they only existed in memory.
- **Fix:** Add retry logic with exponential backoff, or at least queue failed writes for a later retry.

#### 7. 📊 Double-Counting of Category Stats in Ranked Games
- **File:** `src/services/gameEngine.js`, `endGame()` (lines 192-214)
- **Issue:** In ranked 2-player games, the function manually updates `categories[cat].wins++`, `categories[cat].losses++`, AND then loops through players again updating `totalAnswered`, `correctAnswers`, and `accuracy`. This means category wins/losses and accuracy stats are computed separately from the `updateCategoryStats()` function (which is unused in this path). The `updateCategoryStats()` function (lines 56-79) exists but is never called.
- **Fix:** Either use `updateCategoryStats()` consistently, or remove it. Consolidate stat-updating logic into a single place.

#### 8. 🔄 Race Condition in Quick Queue Matchmaking
- **File:** `src/sockets/matchmaking.js` (lines 30-70)
- **Issue:** Between `db.quickQueue.shift()` (lines 31-32) and the `await generateQuestions()` (line 42), the two matched players have already been removed from the queue. If question generation fails (API error), both players are stuck — they've been removed from the queue, no game was created, and no error is sent back to them.
- **Fix:** Wrap the question generation in a try/catch. On failure, emit an error to both sockets and consider re-adding them to the queue.

#### 9. 🏆 Tournament Doesn't Progress Past Round 1
- **File:** `src/sockets/tournament.js`
- **Issue:** There is no code to detect when all matches in a round are finished and advance winners to the next round. The `startTournament()` function creates Round 1 matches, but there's no `onTournamentMatchEnd()` handler. Tournaments are stuck at Round 1 forever.
- **Fix:** Add logic in `endGame()` (or a separate handler) that checks if the game was a tournament match, marks the winner in the bracket, and if all matches in the round are done, generates the next round's matches.

#### 10. ⏱️ Timer Leak on Question Timeout
- **File:** `src/services/gameEngine.js`, `startGameQuestion()` (line 110)
- **Issue:** `game.questionTimer` is set to a `setTimeout`, but there's no cleanup if the game object is deleted from `db.games` before the timer fires. The cleanup timer in `sockets/index.js` deletes finished games, but if a game is deleted mid-question, the timer callback will try to access a `null` game.
- **Fix:** Check `db.games.has(gameId)` at the beginning of the timeout callback. Also clear timers when explicitly ending games.

---

### **MEDIUM — Should Fix Before Release**

#### 11. 📝 `server_helper_wrong_answers.js` is Dead Code
- **File:** `server_helper_wrong_answers.js`
- **Issue:** This file at the project root references `db` without importing it and is never required anywhere. It appears to be an older version of the `recordWrongAnswers` function.
- **Fix:** Delete this file.

#### 12. 🗃️ `server.old.js` (81KB) is Dead Code
- **File:** `server.old.js`
- **Issue:** This massive file appears to be an old monolithic server. Keeping it in the project adds confusion and bloat.
- **Fix:** Delete it or move to a `_deprecated` folder if you want to keep it for reference.

#### 13. 🌐 CORS Origin Hardcoded to `localhost:3000`
- **File:** `.env` (line 2), `src/app.js` (line 27)
- **Issue:** `CORS_ORIGIN=http://localhost:3000`. When deployed to Railway, the origin will be different (e.g., `qvizio-production.up.railway.app`). Socket.io will reject connections from the production domain.
- **Fix:** Set `CORS_ORIGIN` to `*` for development, or dynamically set it to the deployment URL. Consider allowing multiple origins.

#### 14. 🔀 `questions.txt` File Unused
- **File:** `questions.txt`
- **Issue:** Contains 11KB of question data but is never read by any server or client code.
- **Fix:** Remove or integrate into preset questions.

#### 15. 🧑‍💻 Profile Lookup Iterates All Users (O(n))
- **Files:** `src/routes/friends.js`, `src/routes/profile.js`, `src/routes/auth.js`
- **Issue:** Multiple routes iterate over ALL users to find one by username: `for (const [, u] of db.users) { if (u.username.toLowerCase() === ...) }`. With thousands of users this becomes slow.
- **Fix:** Maintain a `usernameIndex` Map (lowercase username → userId) for O(1) lookups.

#### 16. 🔒 No Input Validation on `explain-question` Route
- **File:** `src/routes/questions.js` (lines 21-27)
- **Issue:** The `correctIndex` and `yourAnswerIndex` are passed directly from the client without validation. A malicious client could pass arbitrary data to the AI prompt.
- **Fix:** Validate `correctIndex` is 0-3 and `yourAnswerIndex` is 0-3 or -1.

#### 17. 📱 `needsSetup` Flow: Profile Setup Never Shown After Firebase Auth
- **File:** `public/app.js`
- **Issue:** When a new user registers via Firebase, the server sets `needsSetup: true`, but the client `tryAutoLogin()` function doesn't check `needsSetup` — it just calls `onAuthenticated()`. The Firebase auth handler in the JS client does check `needsSetup`, but only for the initial Firebase auth flow. If the user refreshes the page before completing setup, `tryAutoLogin()` bypasses the setup view.
- **Fix:** Add a `needsSetup` check in `tryAutoLogin()` and `onAuthenticated()` to redirect to the setup view.

#### 18. 💬 DM Messages Have No Authentication Check for Friendship
- **File:** `src/routes/messages.js` (lines 23-47)
- **Issue:** Anyone with a valid token can send messages to any user by ID — the route doesn't verify the sender and receiver are actually friends.
- **Fix:** Add a check: `if (!user.friends.includes(friendId)) return res.status(403).json(...)`.

#### 19. 🎯 Preset Game Answer Shuffle Bug
- **File:** `src/sockets/lobby.js` (lines 211-222)
- **Issue:** When shuffling preset options, `correct: optionsCopy.indexOf(q.options[q.correct])` finds the new position of the correct answer. However, if two options have identical text, `indexOf` might return the wrong index.
- **Fix:** Track the correct answer value before shuffling and find its index after, or use a more explicit shuffle tracking method.

---

### **LOW — Nice to Fix**

#### 20. Global Chat Not Bounded
- **File:** `src/sockets/chat.js` (line 20)
- **Issue:** `db.globalChat` is capped at 100 messages in memory, which is fine, but the array is never persisted — all history is lost on server restart.

#### 21. No Error Handling in `tryAutoLogin`
- **File:** `public/app.js` (line 241)
- **Issue:** `catch {}` silently swallows all errors. If the server returns a 500 error, the user sees a blank page with no feedback.

#### 22. `escapeHtml()` Function Not Visible in Code
- **File:** `public/app.js`
- **Issue:** Multiple places reference `escapeHtml()` but we need to confirm it actually exists and properly escapes all XSS vectors.

---

## ✨ New Feature Suggestions

### **High Impact / Must-Have**

#### 1. 🔐 "Forgot Password" / Password Reset
The forgot password link exists in the HTML but goes nowhere. Implement Firebase password reset email flow.

#### 2. 📊 Match History
Allow users to view their past games (opponent, topic, score, result, ELO change). Store completed games in MongoDB with a `GameHistory` model.

#### 3. 🚫 Block / Report System
Users need the ability to block others from friend requests, challenges, and messaging. Add a report button for toxic behavior in chat.

#### 4. 🔔 Notification System
Replace the basic toast with a persistent notification panel showing:
- Friend requests
- Challenge invitations
- Tournament starts
- New DMs

#### 5. 📱 Progressive Web App (PWA)
Add a `manifest.json` and service worker so users can "install" QVIZIO on their phones. This makes it feel like a native app.

#### 6. 🎵 Sound Effects
Add optional sound effects for:
- Correct/wrong answers
- Timer running low
- Game start/end
- New message
Add a mute toggle in Settings.

### **Medium Impact / Nice-to-Have**

#### 7. 🏅 Season / Leaderboard Reset System
Weekly/monthly seasons with leaderboard snapshots. Players could earn badges for finishing in the top 10 each season.

#### 8. 🎯 Achievements / Badges
Award badges for milestones: "Win 10 games", "100% accuracy in a game", "Answer in under 2 seconds", "Play 50 games in Geography", etc.

#### 9. 👀 Spectator Mode
Allow users to watch ongoing games without participating. Great for tournaments.

#### 10. 🤖 AI Opponent (Bot) for Solo Mode
Instead of just answering questions solo, simulate an AI opponent with varying difficulty levels.

#### 11. 💬 Emoji Reactions in Chat
Allow quick emoji reactions (😂, 🔥, 😤, 👏) during games and in global chat.

#### 12. 📈 Player Statistics Dashboard
A detailed stats page with:
- Win rate over time (chart)
- ELO history graph
- Best/worst categories
- Average answer speed
- Streak tracking

#### 13. 🎲 Random Topic Mode
A "Random" option for quick games that picks a truly random or obscure topic for variety.

#### 14. 🌍 Multi-Language Support (i18n)
The app already has some Georgian text in preset questions. Add proper language switching for the UI.

### **Low Impact / Future Ideas**

#### 15. 🎨 Custom Themes / Dark Mode Toggle
Let users pick accent colors or toggle between light/dark modes.

#### 16. 📤 Share Results
After a game, let users share a results card/image to social media.

#### 17. 🏠 Clan / Team System
Groups of players who can compete in team-based tournaments.

#### 18. 💰 Virtual Currency & Cosmetics
Earn coins from winning games → spend on profile frames, name colors, etc.

---

## 💎 Professionalism Improvements

### **Branding & Design**

1. **Favicon**: Add a proper favicon (favicon.ico + apple-touch-icon). Currently missing.
2. **Open Graph / Social Meta Tags**: Add `og:title`, `og:description`, `og:image` for rich link previews on Discord, Twitter, etc.
3. **Loading Screen**: Add a proper branded loading/splash screen instead of a blank page during auth check.
4. **Consistent Font Loading**: The `Outfit` font is referenced in the SVG logo but never loaded from Google Fonts. Add it to the font import.
5. **Custom 404 Page**: The catch-all route serves `index.html` for everything. Add a styled 404 page for non-API routes.
6. **Terms of Service & Privacy Policy**: Required for any public app, especially one with user accounts.
7. **Footer**: Add a simple footer with copyright, version, and links to ToS/Privacy.

### **Code Quality**

8. **README.md is Inaccurate**: 
   - Lists "React.js" as frontend (it's vanilla JS)
   - Lists "Python (Django/Flask)" (not used)
   - Lists "OpenAI API (GPT-4o)" (you use Groq/Llama)
   - Lists "LangChain" (not used)
   - Lists "PostgreSQL" (not used)
   - Fix these to match actual technology stack.

9. **DEPLOY.md is Inaccurate**: Same issues — lists Python, OpenAI, PostgreSQL. Update to match reality.

10. **Add ESLint / Prettier**: Enforce consistent code style across the team. Add a `.eslintrc.json` and `.prettierrc`.

11. **Add Environment Variable Validation**: The server should fail fast with a clear error if any required env var is missing (not just MongoDB URI — also Groq key, Firebase project ID).

12. **Use `helmet` Middleware**: Add security headers (CSP, HSTS, X-Frame-Options) via the `helmet` npm package.

13. **Structured Logging**: Replace `console.log`/`console.error` with a proper logging library (e.g., `pino` or `winston`) that includes timestamps, log levels, and can output JSON for production parsing.

14. **Add Health Check Endpoint**: Add `GET /health` returning `{ status: 'ok', uptime, version }` for monitoring and Railway health checks.

### **Performance**

15. **Compress Responses**: Add `compression` middleware for gzip/brotli. The CSS file alone is 76KB uncompressed.
16. **Cache Static Assets**: Set `Cache-Control` headers for `/styles.css`, `/app.js`, and JS files. Currently they're served with default (no-cache) Express static settings.
17. **Minify Frontend Assets**: The public JS files total ~150KB+ uncompressed. A simple build step with `esbuild` or `terser` would cut this significantly.
18. **Lazy Load Client JS Modules**: Instead of one giant `app.js` (71KB), split into modules and load on demand.

### **User Experience**

19. **Add Accessibility (a11y)**: 
    - Add `aria-label` to icon-only buttons
    - Ensure proper focus management for modals
    - Add keyboard navigation for the sidebar
    - Ensure sufficient color contrast ratios

20. **Add Responsive Design Testing**: The mobile layout exists but needs thorough testing on actual devices.

21. **Add Offline Detection**: Show a "You're offline" banner when internet drops, especially important during games.

22. **Reconnection Handling**: If the socket disconnects briefly (e.g., Wi-Fi switch), auto-reconnect and rejoin the current game/lobby instead of losing state.

---

## 📋 Pre-Release Checklist

### **Phase 1: Security & Critical Fixes** (Do First!)
- [ ] **Rotate ALL API keys and credentials** (Groq, MongoDB, Firebase)
- [ ] **Verify `.env` was never committed** to git history — if it was, scrub with `git filter-branch` or BFG Repo Cleaner
- [ ] **Create `.env.example`** with placeholder values
- [ ] **Fix the login/register forms** — either implement email/password Firebase auth or remove broken forms
- [ ] **Add session expiration** (e.g., 30-day TTL)
- [ ] **Add `helmet` middleware** for security headers
- [ ] **Validate all user inputs** on the server (especially `explain-question`, `challenge-friend`, `messages`)
- [ ] **Add friendship check** to the DM route
- [ ] **Fix the queue matchmaking** race condition (try/catch around question generation)

### **Phase 2: Bug Fixes** (Do Second)
- [ ] Fix multiplayer `opponent-answered` notification (notify all players, not just one)
- [ ] Fix the preset answer shuffle potential bug
- [ ] Implement tournament progression (Round 2+)
- [ ] Clean up dead code (`server.old.js`, `server_helper_wrong_answers.js`, `questions.txt`)
- [ ] Fix the `needsSetup` flow for page refreshes
- [ ] Fix CORS origin for production deployment
- [ ] Remove unused `bcryptjs` dependency

### **Phase 3: Documentation & Accuracy** (Do Third)
- [ ] **Update README.md** — fix the technology stack to match reality:
  - Frontend: Vanilla JavaScript (not React)
  - Backend: Node.js / Express (not Python/Django)
  - AI: Groq API / Llama 3.3 (not OpenAI/GPT)
  - Database: MongoDB (not PostgreSQL)
  - Remove LangChain reference
- [ ] **Update DEPLOY.md** to match actual stack
- [ ] Add **Contributing Guide** (`CONTRIBUTING.md`) if open source
- [ ] Document all environment variables

### **Phase 4: Professionalism Polish** (Do Before Public Launch)
- [ ] Add favicon and apple-touch-icon
- [ ] Add Open Graph meta tags
- [ ] Add Terms of Service page
- [ ] Add Privacy Policy page
- [ ] Add a branded loading/splash screen
- [ ] Fix the `Outfit` font not being loaded
- [ ] Add a health check endpoint (`GET /health`)
- [ ] Add `compression` middleware
- [ ] Set proper `Cache-Control` headers for static assets

### **Phase 5: Feature Enhancements** (Post-Launch Roadmap)
- [ ] Implement password reset flow (forgot password)
- [ ] Add match history
- [ ] Add sound effects with mute toggle
- [ ] Add block/report system
- [ ] Add notification panel
- [ ] Add PWA support (manifest.json + service worker)
- [ ] Add achievements/badges
- [ ] Add spectator mode
- [ ] Add ELO history graph
- [ ] Season/leaderboard system

### **Phase 6: DevOps & Monitoring**
- [ ] Set up error monitoring (Sentry, LogRocket, etc.)
- [ ] Add uptime monitoring (UptimeRobot, etc.)
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Add automated testing (at minimum: API route tests)
- [ ] Database backup strategy
- [ ] Rate limit tuning for production traffic
- [ ] Load testing with expected user count

---

## 🖥️ Live UI/UX Testing — Visual & Feel Issues

*Tested live on 2026-02-22 by running `node server.js` and navigating all pages in-browser.*

### **Auth / Landing Page**

#### A1. 🎨 Heavy Blue Outer Glow Is Distracting
- **Severity:** Medium  
- **Issue:** The entire viewport has an aggressive blue glow/shadow around the edges. It looks like a "Web 2.0" era design choice rather than a modern UI. It competes visually with the actual content and makes the page feel claustrophobic.
- **Fix:** Reduce or remove the outer glow. Use a subtle gradient or vignette instead if a framing effect is desired.

#### A2. 📒 Notebook/Lined Paper Background Feels Dated
- **Severity:** Medium  
- **Issue:** The lined notebook paper background is thematically connected to "trivia/school" but comes across as amateur. The horizontal ruled lines clutter the visual space and make text harder to parse at a glance. Combined with the yellow "tape" decoration on the auth card, it creates a skeuomorphic look that clashes with the modern flat buttons and input styles.
- **Fix:** Consider a cleaner background — a solid color, subtle noise texture, or minimal pattern that doesn't compete with UI elements. If keeping the notebook theme, make the lines much more subtle (lower opacity, lighter color).

#### A3. 🏷️ Yellow "Tape" Decoration on Auth Card Looks Cheap
- **Severity:** Low  
- **Issue:** The small yellow rectangle at the top of the auth card is meant to look like tape holding a note to a wall, but it's too small, too flat, and doesn't read clearly. It just looks like a rendering glitch to most users.
- **Fix:** Either commit to the skeuomorphic tape look with shadows and texture, or remove it entirely for a clean card design.

#### A4. 🔤 Logo Font ("QVIZIO") Is Informal/Handwritten
- **Severity:** Medium  
- **Issue:** The QVIZIO wordmark uses a playful, handwritten-style font. While it fits the "school notebook" theme, it undermines the "competitive" positioning of the platform. For a real-time ranked trivia game, the branding should feel more bold and serious.
- **Fix:** Use a modern, bold sans-serif for the wordmark (e.g., Inter Black, Poppins Bold, or a custom logotype). Reserve the playful font for decorative elements only.

#### A5. 🔘 Sign In / Sign Up Tab Inconsistency
- **Severity:** Low  
- **Issue:** The "Sign In" tab uses a filled blue style, while "Sign Up" is grey/outline. When switching to Sign Up, it becomes a filled purple. The color change between tabs (blue vs. purple) is jarring — users expect tabs to share the same active color.
- **Fix:** Use a single consistent accent color for both tabs' active states.

#### A6. 🔗 "Forgot password?" Link Goes Nowhere
- **Severity:** High  
- **Issue:** The "Forgot password?" link is visible on the Sign In form but clicking it does nothing. This is a broken user flow — users who forget their password have no recovery path.
- **Fix:** Implement Firebase password reset email flow, or hide the link until it's implemented.

#### A7. 🚫 "Continue with Google" Silent Failure
- **Severity:** High  
- **Issue:** Clicking "Continue with Google" often fails silently — no pop-up appears, no error message is shown. The console logged COOP policy errors. Users clicking this button get zero feedback.
- **Fix:** Wrap the Google auth call in a try/catch and show a visible error toast if the popup fails or is blocked.

#### A8. 📐 Profile Setup Card — Help Text Cramped
- **Severity:** Low  
- **Issue:** On the "Almost there! Create your player identity" screen, the "2-20 characters - letters, numbers, underscores" helper text is very small and nearly overlaps with the input field border. It's hard to read.
- **Fix:** Add more margin between the input and helper text. Increase the helper text font size slightly.

---

### **Main Dashboard (Home)**

#### D1. 📜 Bottom Row Cards Require Scrolling — Key Features Hidden
- **Severity:** High  
- **Issue:** On a standard 1080p screen, the bottom row ("Solo Practice", "Tournament", "Wrong Answers") is cut off and requires scrolling. Many users will never discover these features because the page looks "complete" with just the top three cards visible. The "Ready to Compete?" header + subtext consumes valuable vertical space.
- **Fix:** Either make the cards smaller so all 6 fit above the fold, or move to a scrollable card carousel. Alternatively, reduce the header size to reclaim space.

#### D2. 📌 Red "Pin" Dots on Bottom Cards Look Like Error Indicators  
- **Severity:** Medium  
- **Issue:** The Tournament and Wrong Answers cards have small red circles at the top. These are presumably decorative (representing a pushpin holding the card), but they look like notification badges or error indicators. Users may think they have pending notifications.
- **Fix:** Remove the red dots, or make them look more obviously decorative (e.g., add a pin shadow/texture).

#### D3. 🎨 Top Row vs Bottom Row Card Design Inconsistency
- **Severity:** Medium  
- **Issue:** Top row cards (Quick Game, Custom Game, Preset Game) have a green/mint tint, yellow tape decoration, and teal or blue action buttons. Bottom row cards (Solo Practice, Tournament, Wrong Answers) have pastel pink/orange backgrounds, no tape, red dots as pins, and orange/red/pink action buttons. The two rows look like they belong to different apps.
- **Fix:** Unify the card styling — same background treatment, same decoration, same button color scheme.

#### D4. 🎨 Sidebar Active Color (Red) Clashes with Primary Color (Blue)
- **Severity:** Medium  
- **Issue:** The sidebar uses a **red left border** to indicate the active/selected page, while the primary action buttons throughout the app are **blue** (Quick Game "Play Now") or **teal** (Custom Game "Create Lobby"). The sidebar text turns red when active. This creates a disjointed brand — the app has no single primary color.
- **Fix:** Unify the active/accent color. Either change the sidebar indicator to blue/teal to match the primary actions, or adopt red as the primary and update all buttons accordingly.

#### D5. ⭕ Sidebar Navigation "Dots" Are Unexplained
- **Severity:** Low  
- **Issue:** There are small grey circles on the far left edge of the sidebar (outside the nav items). Their purpose is unclear — they appear to be decorative or part of the notebook binding theme, but they add visual noise.
- **Fix:** Remove them, or make them clearly part of the notebook binding motif with better styling.

#### D6. 💬 Global Chat "1 online" Indicator Placement
- **Severity:** Low  
- **Issue:** The "● 1 online" indicator in the chat sidebar header is pushed to the extreme right edge, almost off-screen. It looks tight and poorly aligned.
- **Fix:** Add more padding between the "Global Chat" text and the online indicator. Consider putting it on a second line or below the header.

#### D7. 💬 Chat Input Box Has Yellow Background
- **Severity:** Low  
- **Issue:** The chat input box at the bottom of the Global Chat sidebar has a noticeable yellow/cream background that doesn't match the rest of the UI. It stands out in a distracting way.
- **Fix:** Match the input background to the chat panel background or make it white/neutral.

---

### **Profile Page**

#### P1. 🖼️ Avatar Is a Plain Colored Circle
- **Severity:** Medium  
- **Issue:** The user's avatar is a flat, solid-colored circle with a single letter (first letter of username). While this is fine as a default, there's no obvious way to change it from this page. The circle lacks any shadow, border, or avatar frame to make it feel premium.
- **Fix:** Add a slight gradient or shadow to the avatar circle. Show a "Change Avatar" overlay on hover. Link to the Settings page avatar upload section.

#### P2. 📊 Stats Boxes Look Plain When All Zeroes
- **Severity:** Medium  
- **Issue:** The four stat boxes (WINS, LOSSES, ACCURACY, GAMES) all showing "0" or "0%" look very bare and uninspiring for a new user. Large blue numbers with simple grey labels on a lined-paper background feel like a spreadsheet.
- **Fix:** Add subtle icons to each stat box (trophy for wins, etc.) and color-code them. For new users, consider adding motivational text like "Play your first game!" instead of showing all zeroes.

#### P3. 📝 AI Bio Text Is Generic
- **Severity:** Low  
- **Issue:** The AI Bio for a new user shows "test_player_123 just arrived. Watch out." — this is uninspiring. While it's auto-generated, the tone is too simple for a feature highlight.
- **Fix:** Generate a more engaging default bio, or show a prompt like "Play some games to generate your unique AI bio!" for new users.

#### P4. ❌ Large Empty Space Below Stats
- **Severity:** Medium  
- **Issue:** Below the 4 stat boxes, the rest of the Profile page is completely empty lined paper. On a 1080p screen, about 40% of the page is just empty notebook lines. It feels like unfinished content.
- **Fix:** Add upcoming features here (match history, category breakdown, ELO graph) or at minimum, remove the excess empty space.

---

### **Rankings Page**

#### R1. 🏅 Rank Badges Look Generic
- **Severity:** Medium  
- **Issue:** All "Silver" badges appear as identical small grey rounded rectangles with grey text. The sole "Bronze" badge is a similar shape in a slightly different color. They don't look or feel like prestigious rank indicators — they look like plain HTML tags.
- **Fix:** Add rank-specific colors/icons: Gold = ⭐ gold pill, Silver = ⚪ silver pill, Bronze = 🥉 bronze pill. Consider adding rank-specific gradients or small trophy icons.

#### R2. 📏 Leaderboard Row Spacing Is Too Generous
- **Severity:** Low  
- **Issue:** Each leaderboard row has significant vertical padding. On a 1080p screen, only ~7 players are visible at once. For a "Top 50" leaderboard, this means a lot of scrolling.
- **Fix:** Reduce row padding slightly to show 10-12 players without scrolling.

#### R3. 🥇 No Visual Distinction for Top 3 Players
- **Severity:** Low  
- **Issue:** The #1, #2, and #3 players have the same styling as #4, #5, etc. There's no gold/silver/bronze treatment, no highlighting, no visual emphasis that being #1 is special.
- **Fix:** Add special styling for the top 3: gold highlight for #1, silver for #2, bronze for #3. Consider a small trophy icon next to the top 3.

---

### **Friends Page**

#### F1. 📭 Empty State Is Too Plain
- **Severity:** Medium  
- **Issue:** When a user has no friends, they see "No friends yet. Add someone!" in grey text centered on an empty lined page. There's no illustration, no prominent CTA, and no explanation of why they should add friends (challenges, DMs, etc.).
- **Fix:** Add an illustration (e.g., two people playing), a more prominent "Add your first friend!" button, and a brief explanation of what friends can do.

#### F2. 🔍 Friend Search Input Is Oversized
- **Severity:** Low  
- **Issue:** The "Enter username to add..." input box takes up the full width of the content panel and is taller than necessary. The surrounding container has its own beige background that doesn't quite match the page, creating a "floating box in a box" effect.
- **Fix:** Reduce the input width or make it inline with the "Add Friend" button. Match the container background to the page.

---

### **Browse (Public Lobbies) Page**

#### B1. 📭 Empty State — Same Problem as Friends
- **Severity:** Medium  
- **Issue:** "No public lobbies available. Create one!" — same minimal empty state issue. No illustration, no prominent action button.
- **Fix:** Add a "Create a Lobby" button directly in the empty state, along with a brief visual or icon.

#### B2. 🔄 "Refresh" and "Join by Code" Button Style Mismatch
- **Severity:** Low  
- **Issue:** The "Refresh" button is a grey/outline pill, while "Join by Code" is a teal filled pill. They sit side by side but have completely different visual weights. "Join by Code" looks like the primary CTA when "Refresh" is arguably more common.
- **Fix:** Either make both outlined or both filled. The actions have equal importance.

---

### **Tournament Page**

#### T1. 🔴 "Create" Button Is Red — Why?
- **Severity:** Medium  
- **Issue:** The "Create" button on the Tournament page is red. Red is universally associated with destructive actions (delete, cancel, danger). Creating a tournament is a positive action and should use the primary blue/teal color.
- **Fix:** Change the Create button color to blue or teal to match the app's primary action color.

#### T2. 📐 Form Layout — "Create" Button Is Misaligned
- **Severity:** Low  
- **Issue:** The "Create" button floats to the right of the "8 Players" dropdown, but is vertically centered with it while the "TOPIC" input is above. The layout feels awkward — the button appears disconnected from the topic input.
- **Fix:** Place the Create button below the form fields, full-width or centered, as a clear submission CTA.

---

### **Mistakes (Wrong Answers) Page**

#### M1. 😊 Empty State Is Actually Good! ✅
- **Severity:** N/A  
- **Issue:** This is a positive note — the Mistakes page has a nice empty state with a sad-face emoji icon, friendly text "No wrong answers yet — you're perfect! 🎯", and helpful text "Play some games and any mistakes will show up here for review." This is the best empty state in the app.
- **Recommendation:** Use this as the template for all other empty states (Friends, Browse, etc.).

---

### **Settings Page**

#### S1. 🖼️ Profile Picture Section Is a Giant Empty Box
- **Severity:** High  
- **Issue:** The "Profile Picture" section is a massive empty container (roughly 250px tall) showing only a "Remove Photo" button at the bottom. There is no upload button, no current photo, no drag-and-drop zone, and no placeholder avatar. It looks completely broken — like a missing feature. This is the most visually jarring element in the entire app.
- **Fix:** Add a visible avatar preview (or the default circle initial avatar), a clear "Upload Photo" button, and optionally a drag-and-drop zone. Show "Remove Photo" only when a photo is actually uploaded.

#### S2. 🔘 "Save Changes" Button Placement
- **Severity:** Medium  
- **Issue:** The "Save Changes" button is positioned at the bottom-left of the page. This is unconventional — most apps place save/submit buttons at the bottom-right or centered. Users may miss it.
- **Fix:** Move the button to the bottom-right or center it below the form fields.

#### S3. ⚙️ Settings Page Is Too Sparse
- **Severity:** Medium  
- **Issue:** The entire Settings page only has two options: Profile Picture and Display Name. For a competitive trivia game, users would expect settings like: sound on/off, notification preferences, theme/dark mode, account email, change password, delete account, privacy settings, etc.
- **Fix:** Add more settings options or show a "More settings coming soon" section to indicate the page isn't incomplete.

---

### **General / Cross-Page Issues**

#### G1. 🅰️ Font Usage Is Inconsistent
- **Severity:** Medium  
- **Issue:** The app mixes at least 3 font styles: a handwritten/informal font for the QVIZIO logo and headings, a standard sans-serif for body text, and the lined-paper background suggests a monospace/notebook feel. This creates visual confusion about the brand identity.
- **Fix:** Choose 2 fonts maximum — one for headings and one for body. Load them consistently from Google Fonts.

#### G2. 🎨 No Cohesive Color System
- **Severity:** High  
- **Issue:** The app uses at least 5 distinct accent colors with no consistent hierarchy:
  - **Blue** for login buttons, Quick Game "Play Now", stat numbers
  - **Teal/Cyan** for Custom/Preset Game buttons, Browse "Join by Code"
  - **Red** for sidebar active state, Tournament "Create" button
  - **Orange/Yellow** for Solo Practice button
  - **Pink/Coral** for Tournament "Enter" button
  
  There is no single "brand color" or clear primary/secondary/accent hierarchy. This makes the app feel like it was designed by several different people.
- **Fix:** Establish a design system with 1 primary color (for main CTAs), 1 secondary color (for secondary actions), and 1 accent color (for highlights/notifications). Apply consistently across all pages.

#### G3. 📱 Mobile Responsiveness Not Verified
- **Severity:** High  
- **Issue:** While mobile CSS exists in the codebase, the three-column layout (sidebar + content + chat) will likely break or become unusable on narrow screens. This was not tested but is a significant risk given the complexity of the layout.
- **Fix:** Test on actual mobile viewports (375px, 414px) and ensure the sidebar collapses into a hamburger/drawer and the chat becomes a toggleable overlay.

#### G4. 🔄 No Page Transition Animations
- **Severity:** Low  
- **Issue:** Switching between sidebar pages is instantaneous — the content just swaps with no fade, slide, or transition. This makes navigation feel abrupt and cheap.
- **Fix:** Add a subtle CSS transition (e.g., 150ms fade-in) when switching panels.

#### G5. 🔔 No Visual Feedback for Actions
- **Severity:** Medium  
- **Issue:** Many actions provide no visual feedback:
  - Adding a friend shows no confirmation until you manually reload
  - Clicking "Regenerate" on AI bio shows no loading state
  - Sending a chat message has no "sending..." indicator
- **Fix:** Add loading spinners, success toasts, and optimistic UI updates throughout.

---

## Summary

| Category | Count |
|----------|-------|
| 🔴 Critical Bugs | 10 |
| 🟡 Medium Bugs | 9 |
| 🟢 Low Bugs | 3 |
| ✨ Feature Suggestions | 18 |
| 💎 Professionalism Items | 22 |
| 🖥️ Visual/UX Issues (NEW) | 30+ |
| 📋 Pre-Release Steps | 40+ |

**The most urgent items are:**
1. Rotate all exposed API keys/credentials
2. Fix the broken login/register forms
3. Fix queue matchmaking race condition
4. Add DM friendship validation
5. Fix CORS for production deployment
6. **NEW:** Fix the Settings page broken avatar section
7. **NEW:** Establish a cohesive color system
8. **NEW:** Ensure bottom-row home cards are visible without scrolling
9. **NEW:** Fix the Google login silent failure
10. **NEW:** Make empty states more engaging across all pages
