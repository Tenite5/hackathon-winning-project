// ═══════════════════════════════════════════════════════════════
// QVIZIO — Client Application
// ═══════════════════════════════════════════════════════════════

(() => {
    'use strict';

    // ── State ──────────────────────────────────────────────────
    const state = {
        token: localStorage.getItem('qvizio_token') || null,
        user: null,
        currentGameId: null,
        currentLobbyId: null,
        currentView: 'auth',
        currentPanel: 'home',
        gameTimerInterval: null,
        gameTimeLeft: 0,
        gameTimeLimit: 10,
        dmFriendId: null,
        lastGameData: null,
    };

    // ── Socket ─────────────────────────────────────────────────
    const socket = io();

    // ═══════════════════════════════════════════════════════════════
    // PARTICLES BACKGROUND
    // ═══════════════════════════════════════════════════════════════
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 0.5;
            this.speedX = (Math.random() - 0.5) * 0.3;
            this.speedY = (Math.random() - 0.5) * 0.3;
            this.opacity = Math.random() * 0.4 + 0.1;
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
                this.reset();
            }
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(164, 191, 227, ${this.opacity})`;
            ctx.fill();
        }
    }

    for (let i = 0; i < 30; i++) particles.push(new Particle());

    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw connections
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(164, 191, 227, ${0.08 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }

        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animateParticles);
    }
    animateParticles();

    // ═══════════════════════════════════════════════════════════════
    // UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════
    function $(id) { return document.getElementById(id); }
    function $$(sel) { return document.querySelectorAll(sel); }

    function showView(viewId) {
        $$('.view').forEach(v => v.classList.remove('active'));
        $(viewId).classList.add('active');
        state.currentView = viewId;
        // Show/hide mobile nav based on view
        const mobileNav = $('mobile-nav');
        if (mobileNav) {
            mobileNav.style.display = (viewId === 'view-dashboard') ? '' : 'none';
        }
    }

    function showPanel(panelId) {
        $$('.panel').forEach(p => p.classList.remove('active'));
        $(`panel-${panelId}`).classList.add('active');
        // Sync desktop sidebar
        $$('.sidebar-btn').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.sidebar-btn[data-panel="${panelId}"]`);
        if (btn) btn.classList.add('active');
        // Sync mobile bottom nav
        $$('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
        const mobileBtn = document.querySelector(`.mobile-nav-btn[data-panel="${panelId}"]`);
        if (mobileBtn) mobileBtn.classList.add('active');
        state.currentPanel = panelId;
    }

    function showModal(id) { $(id).classList.remove('hidden'); }
    function hideModal(id) { $(id).classList.add('hidden'); }

    function toast(message, type = 'info') {
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = message;
        $('toast-container').appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
    }

    async function api(path, options = {}) {
        const headers = { 'Content-Type': 'application/json' };
        if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
        const res = await fetch(`/api${path}`, {
            ...options,
            headers: { ...headers, ...(options.headers || {}) },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }

    function formatTime(ts) {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function getRankColor(elo) {
        if (elo >= 2000) return '#e74c3c';
        if (elo >= 1800) return '#9b59b6';
        if (elo >= 1600) return '#b9f2ff';
        if (elo >= 1400) return '#e5e4e2';
        if (elo >= 1200) return '#ffd700';
        if (elo >= 1000) return '#c0c0c0';
        return '#cd7f32';
    }

    // ═══════════════════════════════════════════════════════════════
    // AUTH
    // ═══════════════════════════════════════════════════════════════
    // Tab switching
    $$('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            $('form-login').classList.toggle('hidden', tab.dataset.tab !== 'login');
            $('form-register').classList.toggle('hidden', tab.dataset.tab !== 'register');
            $('auth-error').classList.add('hidden');
        });
    });

    function showAuthError(msg) {
        const el = $('auth-error');
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    $('form-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('auth-error').classList.add('hidden');
        try {
            const data = await api('/login', {
                method: 'POST',
                body: {
                    username: $('login-username').value.trim(),
                    password: $('login-password').value,
                },
            });
            state.token = data.token;
            state.user = data.user;
            localStorage.setItem('qvizio_token', data.token);
            onAuthenticated();
        } catch (err) {
            showAuthError(err.message);
        }
    });

    $('form-register').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('auth-error').classList.add('hidden');
        try {
            const data = await api('/register', {
                method: 'POST',
                body: {
                    username: $('register-username').value.trim(),
                    password: $('register-password').value,
                },
            });
            state.token = data.token;
            state.user = data.user;
            localStorage.setItem('qvizio_token', data.token);
            onAuthenticated();
        } catch (err) {
            showAuthError(err.message);
        }
    });

    $('btn-logout').addEventListener('click', () => {
        state.token = null;
        state.user = null;
        localStorage.removeItem('qvizio_token');
        socket.disconnect();
        socket.connect();
        showView('view-auth');
    });

    // ── Auto-login ─────────────────────────────────────────────
    async function tryAutoLogin() {
        if (!state.token) return;
        try {
            const data = await api('/me');
            state.user = data.user;
            onAuthenticated();
        } catch {
            localStorage.removeItem('qvizio_token');
            state.token = null;
        }
    }

    function onAuthenticated() {
        showView('view-dashboard');
        updateNavUser();
        socket.emit('auth', state.token);
        socket.emit('global-chat-history');
        loadLeaderboard();
        loadFriends();
        loadLobbies();
        loadTournaments();
        updateProfile();
    }

    function updateNavUser() {
        $('nav-username').textContent = state.user.username;
        $('nav-elo').textContent = `⭐ ${state.user.elo} Elo`;
    }

    // ═══════════════════════════════════════════════════════════════
    // SIDEBAR NAVIGATION
    // ═══════════════════════════════════════════════════════════════
    $$('.sidebar-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showPanel(btn.dataset.panel);
            // Refresh data on panel switch
            if (btn.dataset.panel === 'leaderboard') loadLeaderboard();
            if (btn.dataset.panel === 'friends') loadFriends();
            if (btn.dataset.panel === 'browser') loadLobbies();
            if (btn.dataset.panel === 'tournament') loadTournaments();
            if (btn.dataset.panel === 'profile') updateProfile();
            if (btn.dataset.panel === 'wronglog') loadWrongQuestions();
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // QUICK GAME
    // ═══════════════════════════════════════════════════════════════
    $('btn-quick-game').addEventListener('click', () => {
        socket.emit('queue-join');
        $('overlay-queue').classList.remove('hidden');
    });

    $('btn-cancel-queue').addEventListener('click', () => {
        socket.emit('queue-leave');
        $('overlay-queue').classList.add('hidden');
    });

    socket.on('queue-matched', ({ opponent, topic }) => {
        $('overlay-queue').classList.add('hidden');
        toast(`Matched with ${opponent.username}! Topic: ${topic}`, 'success');
    });

    // ═══════════════════════════════════════════════════════════════
    // CUSTOM LOBBY
    // ═══════════════════════════════════════════════════════════════
    $('btn-custom-game').addEventListener('click', () => showModal('modal-create-lobby'));

    $('btn-create-lobby').addEventListener('click', () => {
        const topic = $('lobby-topic').value.trim() || 'General Knowledge';
        const timeLimit = parseInt($('lobby-time').value) || 10;
        const questionCount = parseInt($('lobby-questions').value) || 5;
        const maxPlayers = parseInt($('lobby-players').value) || 2;
        const isPublic = $('lobby-public').checked;
        const ranked = $('lobby-ranked').checked;

        socket.emit('create-lobby', { topic, isPublic, timeLimit, questionCount, maxPlayers, ranked });
        hideModal('modal-create-lobby');
    });

    socket.on('lobby-created', ({ lobbyId, inviteCode, lobby }) => {
        state.currentLobbyId = lobbyId;
        showLobbyView(lobby, inviteCode);
        toast(`Lobby created! Code: ${inviteCode}`, 'success');
    });

    socket.on('lobby-updated', (lobby) => {
        if (state.currentLobbyId === lobby.id) {
            showLobbyView(lobby);
        }
    });

    socket.on('lobby-error', (msg) => {
        toast(msg, 'error');
        // If we're in a lobby view and get an error (e.g. host left), return to dashboard
        if (state.currentView === 'view-lobby') {
            state.currentLobbyId = null;
            showView('view-dashboard');
        }
    });

    socket.on('lobby-game-start', ({ gameId }) => {
        state.currentGameId = gameId;
        state.currentLobbyId = null;
        showView('view-game');
        toast('Game starting!', 'info');
    });

    function showLobbyView(lobby, code) {
        showView('view-lobby');
        $('lobby-view-topic').textContent = lobby.topic;
        $('lobby-view-code').textContent = code || lobby.inviteCode || '';
        $('lobby-view-settings').textContent = `${lobby.questionCount} questions · ${lobby.timeLimit}s per question`;

        const list = $('lobby-players-list');
        list.innerHTML = '';
        lobby.players.forEach(p => {
            const card = document.createElement('div');
            card.className = `lobby-player-card ${p.ready ? 'ready' : ''}`;
            card.innerHTML = `
        <div class="lobby-player-avatar">${p.username[0].toUpperCase()}</div>
        <div class="lobby-player-name">${p.username}</div>
        <div class="lobby-player-status ${p.ready ? 'ready-yes' : 'ready-no'}">${p.ready ? '✓ Ready' : 'Waiting...'}</div>
      `;
            list.appendChild(card);
        });

        // Show start button for host
        const startBtn = $('btn-lobby-start');
        if (lobby.hostId === state.user.id && lobby.players.length >= 2) {
            startBtn.style.display = 'inline-flex';
        } else {
            startBtn.style.display = 'none';
        }
    }

    $('btn-lobby-start').addEventListener('click', () => {
        socket.emit('lobby-start', { lobbyId: state.currentLobbyId });
    });

    $('btn-lobby-leave').addEventListener('click', () => {
        if (state.currentLobbyId) {
            socket.emit('leave-lobby', { lobbyId: state.currentLobbyId });
        }
        state.currentLobbyId = null;
        showView('view-dashboard');
    });

    // ── Join lobby ─────────────────────────────────────────────
    $('btn-join-code').addEventListener('click', () => showModal('modal-join-code'));

    $('btn-join-with-code').addEventListener('click', () => {
        const code = $('join-code-input').value.trim().toUpperCase();
        if (!code) return;
        socket.emit('join-lobby', { inviteCode: code });
        hideModal('modal-join-code');
    });

    // ═══════════════════════════════════════════════════════════════
    // SOLO MODE
    // ═══════════════════════════════════════════════════════════════
    $('btn-solo-mode').addEventListener('click', () => showModal('modal-solo'));

    $('btn-start-solo').addEventListener('click', () => {
        const topic = $('solo-topic').value.trim() || 'General Knowledge';
        const questionCount = parseInt($('solo-questions').value) || 5;
        const timeLimit = parseInt($('solo-time').value) || 10;
        socket.emit('solo-start', { topic, questionCount, timeLimit });
        hideModal('modal-solo');
        toast('Generating questions...', 'info');
    });

    socket.on('solo-generating', () => {
        showView('view-game');
        $('game-question-text').textContent = 'AI is generating questions...';
        $('game-options').innerHTML = '';
    });

    // ═══════════════════════════════════════════════════════════════
    // PRESET GAME
    // ═══════════════════════════════════════════════════════════════
    $('btn-preset-game').addEventListener('click', () => showModal('modal-preset'));

    document.querySelectorAll('.preset-card').forEach(card => {
        card.addEventListener('click', () => {
            const presetId = card.dataset.preset;
            socket.emit('preset-start', { presetId });
            hideModal('modal-preset');
            toast('Creating preset lobby...', 'info');
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // GAME LOGIC
    // ═══════════════════════════════════════════════════════════════
    socket.on('game-question', (data) => {
        // Track questionId to prevent stale question data from rendering
        if (data.questionId) {
            if (state.currentQuestionId && state.currentQuestionId === data.questionId) return; // duplicate
            state.currentQuestionId = data.questionId;
        }

        state.currentGameId = data.gameId;
        state.gameTimeLimit = data.timeLimit;
        state.gameTimeLeft = data.timeLimit;

        showView('view-game');

        // Hide scoreboard for 3+ player games (results shown via overlay between rounds)
        const scoreboard = $('game-scoreboard');
        if (data.playerCount && data.playerCount > 2) {
            scoreboard.style.display = 'none';
        } else {
            scoreboard.style.display = '';
            // Update scoreboard
            const me = data.scores.find(s => s.userId === state.user.id);
            const opponent = data.scores.find(s => s.userId !== state.user.id);

            $('game-p1-name').textContent = me ? me.username : 'You';
            $('game-p1-score').textContent = me ? me.score : '0';
            $('game-p2-name').textContent = opponent ? opponent.username : 'AI';
            $('game-p2-score').textContent = opponent ? opponent.score : '-';
        }

        // Hide round results overlay when new question comes
        const roundOverlay = document.getElementById('round-results-overlay');
        if (roundOverlay) roundOverlay.classList.add('hidden');

        $('game-q-counter').textContent = `Q${data.questionIndex + 1}/${data.totalQuestions}`;

        // Question
        $('game-question-text').textContent = data.question;
        $('game-feedback').classList.add('hidden');

        // Options
        const optionsEl = $('game-options');
        optionsEl.innerHTML = '';
        const letters = ['A', 'B', 'C', 'D'];
        data.options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = 'game-option';
            btn.innerHTML = `<span class="option-letter">${letters[idx]}</span><span>${opt}</span>`;
            btn.addEventListener('click', () => {
                if (btn.classList.contains('disabled')) return;
                // Disable all options
                optionsEl.querySelectorAll('.game-option').forEach(b => b.classList.add('disabled'));
                btn.style.borderColor = 'var(--accent-primary)';
                socket.emit('game-answer', { gameId: state.currentGameId, answerIndex: idx });
            });
            optionsEl.appendChild(btn);
        });

        // Timer
        startGameTimer(data.timeLimit);
    });

    function startGameTimer(limit) {
        clearInterval(state.gameTimerInterval);
        state.gameTimeLeft = limit;
        const fill = $('game-timer-fill');
        fill.style.width = '100%';
        fill.className = 'game-timer-fill';

        const startTime = Date.now();
        state.gameTimerInterval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const remaining = Math.max(0, limit - elapsed);
            const pct = (remaining / limit) * 100;

            fill.style.width = pct + '%';
            if (pct < 30) fill.className = 'game-timer-fill danger';
            else if (pct < 60) fill.className = 'game-timer-fill warning';

            if (remaining <= 0) clearInterval(state.gameTimerInterval);
        }, 50);
    }

    socket.on('answer-result', ({ correct, points, correctAnswer, playerScore, timeout }) => {
        clearInterval(state.gameTimerInterval);

        $('game-p1-score').textContent = playerScore;

        // Highlight options
        const options = $('game-options').querySelectorAll('.game-option');
        options.forEach((opt, idx) => {
            opt.classList.add('disabled');
            if (idx === correctAnswer) opt.classList.add('correct');
        });

        // Show feedback
        const feedback = $('game-feedback');
        feedback.classList.remove('hidden', 'correct', 'wrong', 'timeout');

        if (timeout) {
            feedback.classList.add('timeout');
            feedback.textContent = `⏰ Time's up!`;
        } else if (correct) {
            feedback.classList.add('correct');
            feedback.textContent = `✅ Correct! +${points} points`;
        } else {
            feedback.classList.add('wrong');
            feedback.textContent = `❌ Wrong answer!`;
            // Mark the selected answer
            options.forEach(opt => {
                if (opt.style.borderColor && !opt.classList.contains('correct')) {
                    opt.classList.add('wrong');
                }
            });
        }
    });

    socket.on('opponent-answered', () => {
        // Optional: show indicator that opponent answered
    });

    socket.on('round-summary', (data) => {
        // Update scores for 2-player games
        if (!data.playerCount || data.playerCount <= 2) {
            const me = data.players.find(p => p.userId === state.user.id);
            if (me) $('game-p1-score').textContent = me.score;
            const opp = data.players.find(p => p.userId !== state.user.id);
            if (opp) $('game-p2-score').textContent = opp.score;
        }

        // For 3+ player games, show round results overlay
        if (data.playerCount && data.playerCount > 2) {
            const overlay = document.getElementById('round-results-overlay');
            const list = document.getElementById('round-results-list');
            if (overlay && list) {
                const sorted = [...data.players].sort((a, b) => b.score - a.score);
                list.innerHTML = '';
                sorted.forEach((p, idx) => {
                    const rankClass = idx === 0 ? 'first' : idx === 1 ? 'second' : idx === 2 ? 'third' : '';
                    const isMe = p.userId === state.user.id;
                    const pointsThisRound = p.answer ? p.answer.points : 0;
                    const changeClass = pointsThisRound > 0 ? 'positive' : pointsThisRound === 0 ? 'negative' : '';
                    const row = document.createElement('div');
                    row.className = `round-result-row ${rankClass}`;
                    row.innerHTML = `
                        <span class="round-result-rank">#${idx + 1}</span>
                        <span class="round-result-name">${isMe ? '⭐ ' : ''}${escapeHtml(p.username)}</span>
                        <span class="round-result-score">${p.score} pts</span>
                        <span class="round-result-change ${changeClass}">${pointsThisRound > 0 ? '+' + pointsThisRound : pointsThisRound === 0 ? '+0' : ''}</span>
                    `;
                    list.appendChild(row);
                });
                overlay.classList.remove('hidden');
            }
        }
    });

    // ── Game Over ──────────────────────────────────────────────
    socket.on('game-over', (data) => {
        clearInterval(state.gameTimerInterval);
        state.lastGameData = data;
        state.currentGameId = null;

        showView('view-game-over');

        const banner = $('game-over-banner');
        const title = $('game-over-title');
        const subtitle = $('game-over-subtitle');

        banner.className = 'game-over-banner';

        if (data.reason === 'opponent-disconnect') {
            banner.classList.add('victory');
            title.textContent = '🏆 Victory!';
            subtitle.textContent = 'Your opponent disconnected.';
        } else if (data.isDraw) {
            banner.classList.add('draw');
            title.textContent = '🤝 Draw!';
            subtitle.textContent = 'Perfectly matched. Rematch?';
        } else if (data.winner && data.winner.userId === state.user.id) {
            banner.classList.add('victory');
            title.textContent = '🏆 Victory!';
            subtitle.textContent = 'You dominated that round!';
        } else {
            banner.classList.add('defeat');
            title.textContent = '💀 Defeated';
            subtitle.textContent = 'Better luck next time.';
        }

        // Scores
        const scoresEl = $('game-over-scores');
        scoresEl.innerHTML = '';
        (data.players || []).forEach(p => {
            const card = document.createElement('div');
            card.className = `go-score-card ${data.winner && p.userId === data.winner.userId ? 'winner' : ''}`;
            card.innerHTML = `
        <div class="go-score-name">${p.username}</div>
        <div class="go-score-value">${p.score}</div>
      `;
            scoresEl.appendChild(card);
        });

        // Elo change
        const eloSection = $('game-over-elo');
        if (data.eloDelta !== undefined) {
            eloSection.classList.remove('hidden');
            const me = data.players.find(p => p.userId === state.user.id);
            if (me) {
                const display = $('elo-change-display');
                display.className = `elo-change ${me.eloChange > 0 ? 'positive' : 'negative'}`;
                display.textContent = `Elo: ${me.elo} (${me.eloChange > 0 ? '+' : ''}${me.eloChange})`;
            }
            // Update local state
            if (me) {
                state.user.elo = me.elo;
                updateNavUser();
            }
        } else {
            eloSection.classList.add('hidden');
        }

        // Question review
        const reviewEl = $('game-over-questions');
        reviewEl.innerHTML = '';
        (data.questions || []).forEach((q, idx) => {
            const me = (data.players || []).find(p => p.userId === state.user.id);
            const myAnswer = me && me.answers ? me.answers[idx] : null;

            let status = 'review-timeout';
            if (myAnswer && myAnswer.isCorrect) status = 'review-correct';
            else if (myAnswer && myAnswer.answerIndex >= 0) status = 'review-wrong';

            const item = document.createElement('div');
            item.className = `review-item ${status}`;
            item.innerHTML = `
        <div class="review-question">${idx + 1}. ${q.question}</div>
        <div class="review-answer">
          ${myAnswer && myAnswer.answerIndex >= 0 && !myAnswer.isCorrect
                    ? `<span class="review-your-answer">Your answer: ${q.options[myAnswer.answerIndex]}</span>` : ''}
          ${myAnswer && myAnswer.isCorrect
                    ? `<span class="review-correct-answer">✓ ${q.options[q.correct]}</span>`
                    : `<span class="review-correct-answer">Correct: ${q.options[q.correct]}</span>`}
        </div>
      `;
            reviewEl.appendChild(item);
        });
    });

    $('btn-play-again').addEventListener('click', () => {
        showView('view-dashboard');
        showPanel('home');
    });

    $('btn-back-dashboard').addEventListener('click', () => {
        showView('view-dashboard');
        showPanel('home');
    });

    // ═══════════════════════════════════════════════════════════════
    // IN-GAME CHAT
    // ═══════════════════════════════════════════════════════════════
    $('game-chat-toggle').addEventListener('click', () => {
        $('game-chat-panel').classList.toggle('hidden');
    });

    $('btn-game-chat-send').addEventListener('click', sendGameChat);
    $('game-chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendGameChat();
    });

    function sendGameChat() {
        const input = $('game-chat-input');
        const text = input.value.trim();
        if (!text || !state.currentGameId) return;
        socket.emit('game-chat', { gameId: state.currentGameId, text });
        input.value = '';
    }

    socket.on('game-chat-msg', (msg) => {
        const el = document.createElement('div');
        el.className = 'chat-msg';
        el.innerHTML = `<span class="chat-msg-author">${msg.username}:</span> <span class="chat-msg-text">${escapeHtml(msg.text)}</span>`;
        $('game-chat-messages').appendChild(el);
        $('game-chat-messages').scrollTop = $('game-chat-messages').scrollHeight;
    });

    // ═══════════════════════════════════════════════════════════════
    // GLOBAL CHAT
    // ═══════════════════════════════════════════════════════════════
    $('btn-global-chat-send').addEventListener('click', sendGlobalChat);
    $('global-chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendGlobalChat();
    });

    function sendGlobalChat() {
        const input = $('global-chat-input');
        const text = input.value.trim();
        if (!text) return;
        socket.emit('global-chat', { text });
        input.value = '';
    }

    socket.on('global-chat-msg', (msg) => {
        appendGlobalChatMsg(msg);
    });

    socket.on('global-chat-history', (msgs) => {
        $('global-chat-messages').innerHTML = '';
        msgs.forEach(msg => appendGlobalChatMsg(msg));
    });

    function appendGlobalChatMsg(msg) {
        const el = document.createElement('div');
        el.className = 'chat-msg';
        el.innerHTML = `
      <span class="chat-msg-author">${escapeHtml(msg.username)}:</span>
      <span class="chat-msg-text">${escapeHtml(msg.text)}</span>
      <span class="chat-msg-time">${formatTime(msg.ts)}</span>
    `;
        $('global-chat-messages').appendChild(el);
        $('global-chat-messages').scrollTop = $('global-chat-messages').scrollHeight;
    }

    // ═══════════════════════════════════════════════════════════════
    // LOBBY BROWSER
    // ═══════════════════════════════════════════════════════════════
    $('btn-refresh-lobbies').addEventListener('click', loadLobbies);

    socket.on('lobbies-updated', loadLobbies);

    async function loadLobbies() {
        try {
            const data = await api('/lobbies');
            const list = $('lobby-list');

            if (data.lobbies.length === 0) {
                list.innerHTML = `<div class="empty-state"><p>No public lobbies available. Create one!</p></div>`;
                return;
            }

            list.innerHTML = '';
            data.lobbies.forEach(lobby => {
                const item = document.createElement('div');
                item.className = 'lobby-item';
                item.innerHTML = `
          <div class="lobby-item-info">
            <h4>${escapeHtml(lobby.topic)}</h4>
            <span>by ${escapeHtml(lobby.host)} · ${lobby.questionCount} questions · ${lobby.timeLimit}s</span>
          </div>
          <div class="lobby-item-meta">
            <span class="lobby-item-players">${lobby.playerCount}/${lobby.maxPlayers}</span>
            <button class="btn btn-primary btn-sm lobby-join-btn">Join</button>
          </div>
        `;
                item.querySelector('.lobby-join-btn').addEventListener('click', () => {
                    socket.emit('join-lobby', { lobbyId: lobby.id });
                });
                list.appendChild(item);
            });
        } catch (err) {
            console.error('Load lobbies error:', err);
        }
    }

    socket.on('lobby-updated', (lobby) => {
        if (!state.currentLobbyId && lobby.players.find(p => p.userId === state.user.id)) {
            state.currentLobbyId = lobby.id;
            showLobbyView(lobby);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // LEADERBOARD
    // ═══════════════════════════════════════════════════════════════
    async function loadLeaderboard() {
        try {
            const data = await api('/leaderboard');
            const table = $('leaderboard-table');

            if (data.leaderboard.length === 0) {
                table.innerHTML = `<div class="empty-state"><p>No players ranked yet. Be the first!</p></div>`;
                return;
            }

            table.innerHTML = `
        <div class="lb-row lb-header">
          <span>#</span>
          <span>Player</span>
          <span>Elo</span>
          <span>Rank</span>
        </div>
      `;

            data.leaderboard.forEach((user, idx) => {
                const rankClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : '';
                const row = document.createElement('div');
                row.className = 'lb-row';
                row.style.cursor = 'pointer';
                row.innerHTML = `
          <span class="lb-rank ${rankClass}">${idx + 1}</span>
          <div class="lb-user">
            <div class="lb-avatar" style="background: ${getRankColor(user.elo)}">${user.username[0].toUpperCase()}</div>
            <span class="lb-username">${escapeHtml(user.username)}</span>
          </div>
          <span class="lb-elo">${user.elo}</span>
          <span class="lb-badge" style="background: ${user.rank.color}20; color: ${user.rank.color}">${user.rank.name}</span>
        `;
                row.addEventListener('click', () => openUserProfile(user.id));
                table.appendChild(row);
            });
        } catch (err) {
            console.error('Leaderboard error:', err);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PROFILE
    // ═══════════════════════════════════════════════════════════════
    function updateProfile() {
        if (!state.user) return;
        const u = state.user;

        $('profile-avatar-letter').textContent = u.username[0].toUpperCase();
        $('profile-username').textContent = u.username;
        $('profile-rank-icon').style.background = u.rank.color;
        $('profile-rank-name').textContent = u.rank.name;
        $('profile-elo-value').textContent = u.elo;
        $('profile-bio-text').textContent = u.bio || 'No bio yet.';

        $('stat-wins').textContent = u.stats.totalWins || 0;
        $('stat-losses').textContent = u.stats.totalLosses || 0;
        $('stat-games').textContent = u.stats.gamesPlayed || 0;
        const acc = u.stats.totalAnswers > 0
            ? Math.round((u.stats.correctAnswers / u.stats.totalAnswers) * 100)
            : 0;
        $('stat-accuracy').textContent = acc + '%';
    }

    $('btn-regen-bio').addEventListener('click', async () => {
        $('btn-regen-bio').disabled = true;
        toast('Generating new bio...', 'info');
        try {
            const data = await api('/profile/regenerate-bio', { method: 'POST' });
            state.user.bio = data.bio;
            $('profile-bio-text').textContent = data.bio;
            toast('Bio updated!', 'success');
        } catch (err) {
            toast(err.message, 'error');
        }
        $('btn-regen-bio').disabled = false;
    });

    // ═══════════════════════════════════════════════════════════════
    // FRIENDS
    // ═══════════════════════════════════════════════════════════════
    $('btn-add-friend').addEventListener('click', async () => {
        const username = $('friend-username-input').value.trim();
        if (!username) return;
        try {
            await api('/friends/request', { method: 'POST', body: { username } });
            toast(`Friend request sent to ${username}!`, 'success');
            $('friend-username-input').value = '';
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    async function loadFriends() {
        try {
            const data = await api('/friends');

            // Requests
            const reqSection = $('friend-requests-section');
            const reqList = $('friend-requests-list');
            if (data.requests.length > 0) {
                reqSection.classList.remove('hidden');
                reqList.innerHTML = '';
                data.requests.forEach(req => {
                    const item = document.createElement('div');
                    item.className = 'friend-item';
                    item.innerHTML = `
            <div class="friend-item-info">
              <div class="friend-avatar">${req.username[0].toUpperCase()}</div>
              <div>
                <div class="friend-name">${escapeHtml(req.username)}</div>
                <div class="friend-status text-muted">Wants to be friends</div>
              </div>
            </div>
            <div class="friend-item-actions">
              <button class="btn btn-primary btn-sm accept-btn">Accept</button>
              <button class="btn btn-ghost btn-sm decline-btn">Decline</button>
            </div>
          `;
                    item.querySelector('.accept-btn').addEventListener('click', async () => {
                        await api('/friends/accept', { method: 'POST', body: { userId: req.id } });
                        toast(`${req.username} is now your friend!`, 'success');
                        loadFriends();
                    });
                    item.querySelector('.decline-btn').addEventListener('click', async () => {
                        await api('/friends/decline', { method: 'POST', body: { userId: req.id } });
                        loadFriends();
                    });
                    reqList.appendChild(item);
                });

                // Update badge
                $('friends-badge').textContent = data.requests.length;
                $('friends-badge').classList.remove('hidden');
            } else {
                reqSection.classList.add('hidden');
                $('friends-badge').classList.add('hidden');
            }

            // Friends list
            const list = $('friends-list');
            if (data.friends.length === 0) {
                list.innerHTML = '<div class="empty-state"><p>No friends yet. Add someone!</p></div>';
                return;
            }

            list.innerHTML = '';
            data.friends.forEach(friend => {
                const item = document.createElement('div');
                item.className = 'friend-item';
                item.innerHTML = `
          <div class="friend-item-info" style="cursor:pointer;">
            <div class="friend-avatar">${friend.username[0].toUpperCase()}</div>
            <div>
              <div class="friend-name">${escapeHtml(friend.username)}</div>
              <div class="friend-status">
                <span class="status-dot ${friend.online ? 'online' : 'offline'}"></span>
                ${friend.online ? 'Online' : 'Offline'}
              </div>
            </div>
          </div>
          <div class="friend-item-actions">
            <button class="btn btn-danger btn-sm challenge-btn" ${!friend.online ? 'disabled title="Friend is offline"' : ''}>⚔️ Challenge</button>
            <button class="btn btn-ghost btn-sm msg-btn">Message</button>
          </div>
        `;
                item.querySelector('.friend-item-info').addEventListener('click', () => openUserProfile(friend.id));
                item.querySelector('.msg-btn').addEventListener('click', () => openDM(friend));
                item.querySelector('.challenge-btn').addEventListener('click', () => {
                    if (!friend.online) return toast('Friend is offline', 'error');
                    const topic = prompt('Enter a topic for the challenge:', 'General Knowledge');
                    if (topic === null) return;
                    socket.emit('challenge-friend', { friendId: friend.id, topic: topic || 'General Knowledge' });
                });
                list.appendChild(item);
            });
        } catch (err) {
            console.error('Load friends error:', err);
        }
    }

    // ── DM ─────────────────────────────────────────────────────
    async function openDM(friend) {
        state.dmFriendId = friend.id;
        $('dm-panel').classList.remove('hidden');
        $('dm-username').textContent = friend.username;

        try {
            const data = await api(`/messages/${friend.id}`);
            const msgsEl = $('dm-messages');
            msgsEl.innerHTML = '';
            data.messages.forEach(msg => appendDMMessage(msg));
        } catch (err) {
            console.error('Load DMs error:', err);
        }
    }

    $('btn-close-dm').addEventListener('click', () => {
        $('dm-panel').classList.add('hidden');
        state.dmFriendId = null;
    });

    $('btn-send-dm').addEventListener('click', sendDM);
    $('dm-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendDM(); });

    async function sendDM() {
        const input = $('dm-input');
        const text = input.value.trim();
        if (!text || !state.dmFriendId) return;
        try {
            const data = await api(`/messages/${state.dmFriendId}`, { method: 'POST', body: { text } });
            appendDMMessage(data.message);
            input.value = '';
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    socket.on('dm', (msg) => {
        if (state.dmFriendId === msg.from) {
            appendDMMessage(msg);
        } else {
            toast(`New message from ${msg.fromUsername}`, 'info');
        }
    });

    function appendDMMessage(msg) {
        const el = document.createElement('div');
        const isSent = msg.from === state.user.id;
        el.className = `dm-msg ${isSent ? 'sent' : 'received'}`;
        el.innerHTML = `
      <div class="dm-msg-author">${isSent ? 'You' : escapeHtml(msg.fromUsername)}</div>
      <div>${escapeHtml(msg.text)}</div>
    `;
        $('dm-messages').appendChild(el);
        $('dm-messages').scrollTop = $('dm-messages').scrollHeight;
    }

    // Friend notifications
    socket.on('friend-request', ({ from }) => {
        toast(`${from.username} sent you a friend request!`, 'info');
        loadFriends();
    });

    socket.on('friend-accepted', ({ user }) => {
        toast(`${user.username} accepted your friend request!`, 'success');
        loadFriends();
    });

    socket.on('friend-online', ({ username }) => {
        // Could show toast, but might be noisy
        loadFriends();
    });

    socket.on('friend-offline', () => {
        loadFriends();
    });

    // ── Online Count ───────────────────────────────────────────
    socket.on('online-count', (count) => {
        const el = document.getElementById('online-count');
        if (el) el.textContent = count;
        const mobileEl = document.getElementById('mobile-online-count');
        if (mobileEl) mobileEl.textContent = count;
    });

    // ═══════════════════════════════════════════════════════════════
    // WRONG ANSWERS PANEL
    // ═══════════════════════════════════════════════════════════════
    $('btn-wrong-answers').addEventListener('click', () => {
        showPanel('wronglog');
        loadWrongQuestions();
    });

    async function loadWrongQuestions() {
        const list = $('wrong-questions-list');
        list.innerHTML = '<p class="text-muted" style="text-align:center; padding: 2rem;">Loading wrong answers...</p>';

        try {
            const data = await api('/question-log');
            const questions = data.wrongQuestions || [];

            $('wrong-count-badge').textContent = questions.length;

            if (questions.length === 0) {
                list.innerHTML = `
                    <div class="empty-state">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity: 0.3; margin-bottom: 1rem;">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                            <line x1="9" y1="9" x2="9.01" y2="9" />
                            <line x1="15" y1="9" x2="15.01" y2="9" />
                        </svg>
                        <p>No wrong answers yet — you're perfect! 🎯</p>
                        <p class="text-muted">Play some games and any mistakes will show up here for review.</p>
                    </div>
                `;
                return;
            }

            list.innerHTML = '';
            questions.forEach((q, idx) => {
                const card = document.createElement('div');
                card.className = 'wrong-q-card';
                card.id = `wrong-q-${idx}`;

                const dateStr = new Date(q.playedAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });

                card.innerHTML = `
                    <div class="wrong-q-header">
                        <span class="wrong-q-topic">${escapeHtml(q.topic)}</span>
                        <span class="wrong-q-date">${dateStr}</span>
                    </div>
                    <div class="wrong-q-text">${escapeHtml(q.question)}</div>
                    <div class="wrong-q-answers">
                        <div class="wrong-q-answer your-wrong">
                            <span class="wrong-q-answer-icon">✗</span>
                            <span>${escapeHtml(q.yourAnswer)}</span>
                            <span class="wrong-q-answer-label">${q.timedOut ? 'Timed out' : 'Your answer'}</span>
                        </div>
                        <div class="wrong-q-answer correct-ans">
                            <span class="wrong-q-answer-icon">✓</span>
                            <span>${escapeHtml(q.correctAnswer)}</span>
                            <span class="wrong-q-answer-label">Correct</span>
                        </div>
                    </div>
                    <div class="wrong-q-footer">
                        <span class="wrong-q-diff ${q.difficulty}">${q.difficulty}</span>
                        <button class="btn-explain" data-idx="${idx}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            AI Explain
                        </button>
                    </div>
                    <div class="wrong-q-explanation-area" id="explain-area-${idx}"></div>
                `;

                // AI Explain button handler
                const explainBtn = card.querySelector('.btn-explain');
                explainBtn.addEventListener('click', async () => {
                    const area = $(`explain-area-${idx}`);

                    // If already showing explanation, toggle it off
                    if (area.innerHTML.trim()) {
                        area.innerHTML = '';
                        explainBtn.innerHTML = `
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            AI Explain
                        `;
                        return;
                    }

                    // Loading state
                    explainBtn.disabled = true;
                    explainBtn.innerHTML = '<div class="spinner"></div> Thinking...';

                    try {
                        const result = await api('/explain-question', {
                            method: 'POST',
                            body: {
                                question: q.question,
                                options: q.options,
                                correctIndex: q.correctIndex,
                                yourAnswerIndex: q.yourAnswerIndex,
                            }
                        });

                        area.innerHTML = `
                            <div class="wrong-q-explanation">
                                <span class="explain-icon">💡</span> ${escapeHtml(result.explanation)}
                            </div>
                        `;
                        explainBtn.innerHTML = `
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                            Hide
                        `;
                    } catch (err) {
                        area.innerHTML = `<div class="wrong-q-explanation"><span class="explain-icon">⚠️</span> Failed to generate explanation. Try again!</div>`;
                    }

                    explainBtn.disabled = false;
                });

                list.appendChild(card);
            });
        } catch (err) {
            console.error('Wrong questions load error:', err);
            list.innerHTML = '<p class="text-muted" style="text-align:center; padding: 2rem;">Failed to load wrong answers. Try again later.</p>';
        }
    }

    // Auto-load when navigating to wronglog panel via sidebar
    const wronglogNavBtn = document.getElementById('nav-wronglog');
    if (wronglogNavBtn) {
        wronglogNavBtn.addEventListener('click', () => {
            loadWrongQuestions();
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // TOURNAMENTS
    // ═══════════════════════════════════════════════════════════════
    $('btn-tournament-mode').addEventListener('click', () => {
        showPanel('tournament');
    });

    $('btn-create-tournament').addEventListener('click', () => {
        const topic = $('tournament-topic').value.trim() || 'General Knowledge';
        const maxPlayers = parseInt($('tournament-size').value) || 8;
        socket.emit('create-tournament', { topic, maxPlayers });
    });

    socket.on('tournament-created', (t) => {
        toast(`Tournament created! Waiting for players (${t.players.length}/${t.maxPlayers})`, 'success');
        loadTournaments();
    });

    socket.on('tournament-updated', () => loadTournaments());
    socket.on('tournaments-updated', loadTournaments);
    socket.on('tournament-error', (msg) => toast(msg, 'error'));

    socket.on('tournament-round', ({ tournamentId, round, brackets }) => {
        toast(`Tournament Round ${round} starting!`, 'info');
    });

    async function loadTournaments() {
        try {
            const data = await api('/tournaments');
            const list = $('tournament-list');

            if (data.tournaments.length === 0) {
                list.innerHTML = '<div class="empty-state"><p>No active tournaments. Create one!</p></div>';
                return;
            }

            list.innerHTML = '';
            data.tournaments.forEach(t => {
                const item = document.createElement('div');
                item.className = 'tourney-item';
                item.innerHTML = `
          <div class="tourney-item-info">
            <h4>${escapeHtml(t.topic)}</h4>
            <span>${t.status === 'waiting' ? 'Waiting for players' : `Round ${t.round}`}</span>
          </div>
          <div class="tourney-item-meta">
            <span class="tourney-players">${t.playerCount}/${t.maxPlayers}</span>
            ${t.status === 'waiting' ? '<button class="btn btn-danger btn-sm tourney-join-btn">Join</button>' : '<span class="text-muted">In Progress</span>'}
          </div>
        `;
                const joinBtn = item.querySelector('.tourney-join-btn');
                if (joinBtn) {
                    joinBtn.addEventListener('click', () => {
                        socket.emit('join-tournament', { tournamentId: t.id });
                    });
                }
                list.appendChild(item);
            });
        } catch (err) {
            console.error('Load tournaments error:', err);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // MODAL CLOSE HANDLERS
    // ═══════════════════════════════════════════════════════════════
    document.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', () => {
            hideModal(el.dataset.closeModal);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // SOCKET AUTH
    // ═══════════════════════════════════════════════════════════════
    socket.on('auth-success', (user) => {
        state.user = user;
        updateNavUser();
    });

    socket.on('auth-error', () => {
        localStorage.removeItem('qvizio_token');
        state.token = null;
        showView('view-auth');
    });

    // ═══════════════════════════════════════════════════════════════
    // CHALLENGE SYSTEM
    // ═══════════════════════════════════════════════════════════════
    let pendingChallengeId = null;

    socket.on('challenge-sent', ({ to }) => {
        toast(`Challenge sent to ${to}! Waiting for response...`, 'info');
    });

    socket.on('challenge-received', ({ challengeId, from, topic }) => {
        pendingChallengeId = challengeId;
        $('challenge-text').textContent = `${from.username} (${from.elo} Elo) challenged you!`;
        $('challenge-topic-text').textContent = `Topic: ${topic}`;
        showModal('modal-challenge');

        // Also play a notification sound effect via toast
        toast(`⚔️ ${from.username} wants to duel you!`, 'info');
    });

    $('btn-accept-challenge').addEventListener('click', () => {
        if (!pendingChallengeId) return;
        socket.emit('challenge-accept', { challengeId: pendingChallengeId });
        hideModal('modal-challenge');
        toast('Challenge accepted! Game starting...', 'success');
        pendingChallengeId = null;
    });

    $('btn-decline-challenge').addEventListener('click', () => {
        if (!pendingChallengeId) return;
        socket.emit('challenge-decline', { challengeId: pendingChallengeId });
        hideModal('modal-challenge');
        toast('Challenge declined.', 'info');
        pendingChallengeId = null;
    });

    socket.on('challenge-accepted', ({ gameId, opponent, topic }) => {
        state.currentGameId = gameId;
        toast(`Game starting with ${opponent.username}! Topic: ${topic}`, 'success');
    });

    socket.on('challenge-declined', ({ by }) => {
        toast(`${by} declined your challenge.`, 'info');
    });

    socket.on('challenge-expired', () => {
        toast('Your challenge expired.', 'info');
    });

    socket.on('challenge-error', (msg) => toast(msg, 'error'));

    // ═══════════════════════════════════════════════════════════════
    // PUBLIC PROFILE VIEWER
    // ═══════════════════════════════════════════════════════════════
    async function openUserProfile(userId) {
        try {
            const data = await api(`/profile/${userId}`);
            const u = data.user;

            $('modal-profile-avatar-letter').textContent = u.username[0].toUpperCase();
            $('modal-profile-username').textContent = u.username;
            $('modal-profile-rank-icon').style.background = u.rank.color;
            $('modal-profile-rank-name').textContent = u.rank.name;
            $('modal-profile-elo').textContent = u.elo;
            $('modal-profile-bio').textContent = u.bio || 'No bio yet.';

            $('modal-stat-wins').textContent = u.stats.totalWins || 0;
            $('modal-stat-losses').textContent = u.stats.totalLosses || 0;
            $('modal-stat-games').textContent = u.stats.gamesPlayed || 0;
            const acc = u.stats.totalAnswers > 0
                ? Math.round((u.stats.correctAnswers / u.stats.totalAnswers) * 100)
                : 0;
            $('modal-stat-accuracy').textContent = acc + '%';

            showModal('modal-user-profile');
        } catch (err) {
            toast('Could not load profile: ' + err.message, 'error');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // UTILITY
    // ═══════════════════════════════════════════════════════════════
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ═══════════════════════════════════════════════════════════════
    // MOBILE NAVIGATION
    // ═══════════════════════════════════════════════════════════════
    // Mobile bottom nav buttons (Home, Browse, Ranks, Profile)
    $$('.mobile-nav-btn[data-panel]').forEach(btn => {
        btn.addEventListener('click', () => {
            showPanel(btn.dataset.panel);
            if (btn.dataset.panel === 'leaderboard') loadLeaderboard();
            if (btn.dataset.panel === 'browser') loadLobbies();
            if (btn.dataset.panel === 'profile') updateProfile();
        });
    });

    // More button
    const moreBtn = $('mnav-more');
    if (moreBtn) {
        moreBtn.addEventListener('click', () => {
            $('mobile-more-menu').classList.toggle('hidden');
        });
    }

    // Close more menu on backdrop tap
    const moreBackdrop = $('mobile-more-backdrop');
    if (moreBackdrop) {
        moreBackdrop.addEventListener('click', () => {
            $('mobile-more-menu').classList.add('hidden');
        });
    }

    // More menu items (Friends, Tournament, Mistakes)
    $$('.mobile-more-item[data-panel]').forEach(btn => {
        btn.addEventListener('click', () => {
            $('mobile-more-menu').classList.add('hidden');
            showPanel(btn.dataset.panel);
            if (btn.dataset.panel === 'friends') loadFriends();
            if (btn.dataset.panel === 'tournament') loadTournaments();
            if (btn.dataset.panel === 'wronglog') loadWrongQuestions();
        });
    });

    // Mobile Chat
    const mobileChatBtn = $('mobile-chat-btn');
    if (mobileChatBtn) {
        mobileChatBtn.addEventListener('click', () => {
            $('mobile-more-menu').classList.add('hidden');
            $('mobile-chat-overlay').classList.remove('hidden');
            // Sync chat messages from desktop to mobile
            const desktopMsgs = $('global-chat-messages');
            const mobileMsgs = $('mobile-chat-messages');
            if (desktopMsgs && mobileMsgs) {
                mobileMsgs.innerHTML = desktopMsgs.innerHTML;
                mobileMsgs.scrollTop = mobileMsgs.scrollHeight;
            }
        });
    }

    const mobileChatClose = $('mobile-chat-close');
    if (mobileChatClose) {
        mobileChatClose.addEventListener('click', () => {
            $('mobile-chat-overlay').classList.add('hidden');
        });
    }

    // Mobile chat send
    const btnMobileChatSend = $('btn-mobile-chat-send');
    if (btnMobileChatSend) {
        btnMobileChatSend.addEventListener('click', sendMobileChat);
    }
    const mobileChatInput = $('mobile-chat-input');
    if (mobileChatInput) {
        mobileChatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMobileChat();
        });
    }

    function sendMobileChat() {
        const input = $('mobile-chat-input');
        const text = input.value.trim();
        if (!text) return;
        socket.emit('global-chat', { text });
        input.value = '';
    }

    // Sync global chat messages to mobile overlay
    const origAppendGlobalChat = appendGlobalChatMsg;
    // Patch the appendGlobalChatMsg to also write to mobile
    // We'll use a MutationObserver on the desktop chat
    const desktopChatContainer = $('global-chat-messages');
    if (desktopChatContainer) {
        const chatObserver = new MutationObserver(() => {
            const mobileMsgs = $('mobile-chat-messages');
            if (mobileMsgs && !$('mobile-chat-overlay').classList.contains('hidden')) {
                mobileMsgs.innerHTML = desktopChatContainer.innerHTML;
                mobileMsgs.scrollTop = mobileMsgs.scrollHeight;
            }
        });
        chatObserver.observe(desktopChatContainer, { childList: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════════════
    tryAutoLogin();
})();
