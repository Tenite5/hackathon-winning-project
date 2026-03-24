/**
 * @file public/js/game.js
 * @description Game UI — question rendering, timer, answer result, game-over, play-again/rematch.
 */

(function () {
    'use strict';
    const { $, state, socket, showView, showPanel, toast, escapeHtml } = QV;

    // ── ELO rank helper ────────────────────────────────────────────
    function getRankLabel(elo) {
        if (elo >= 2000) return { name: 'Grandmaster', color: '#e74c3c' };
        if (elo >= 1800) return { name: 'Master', color: '#9b59b6' };
        if (elo >= 1600) return { name: 'Diamond', color: '#74b9ff' };
        if (elo >= 1400) return { name: 'Platinum', color: '#b2bec3' };
        if (elo >= 1200) return { name: 'Gold', color: '#f1c40f' };
        if (elo >= 1000) return { name: 'Silver', color: '#95a5a6' };
        return { name: 'Bronze', color: '#cd7f32' };
    }

    // ── Clear stale game UI ───────────────────────────────────────
    function clearGameState() {
        state.leavingGame = false;
        $('game-question-text').textContent = 'Loading questions...';
        const imgC = $('game-question-image');
        if (imgC) imgC.classList.add('hidden');
        $('game-options').innerHTML = '';
        $('game-feedback').classList.add('hidden');
        $('game-q-counter').textContent = '';
        $('game-p1-name').textContent = '';
        $('game-p1-score').textContent = '0';
        $('game-p2-name').textContent = '';
        $('game-p2-score').textContent = '0';
        const fill = $('game-timer-fill');
        if (fill) {
            fill.style.width = '100%';
            fill.className = 'game-timer-fill';
        }
        const roundOverlay = document.getElementById('round-results-overlay');
        if (roundOverlay) roundOverlay.classList.add('hidden');
        const chatMsgs = $('game-chat-messages');
        if (chatMsgs) chatMsgs.innerHTML = '';
        const chatPanel = $('game-chat-panel');
        if (chatPanel) chatPanel.classList.add('hidden');
        clearInterval(state.gameTimerInterval);
        // Hide players sidebar
        const sidebar = $('game-players-sidebar');
        if (sidebar) sidebar.classList.add('hidden');
    }
    QV.clearGameState = clearGameState;

    // ── Render players sidebar ────────────────────────────────────
    let _hiddenPlayers = [];

    function renderPlayersSidebar(scores, gameType) {
        const sidebar = $('game-players-sidebar');
        const list = $('game-players-list');
        const moreBtn = $('btn-sidebar-more');
        if (!sidebar || !list) return;

        // Only show for multiplayer games
        if (!scores || scores.length < 2 || gameType === 'solo') {
            sidebar.classList.add('hidden');
            return;
        }

        sidebar.classList.remove('hidden');
        list.innerHTML = '';
        _hiddenPlayers = [];

        const MAX_VISIBLE = 5;
        const visible = scores.slice(0, MAX_VISIBLE);
        const hidden = scores.slice(MAX_VISIBLE);
        _hiddenPlayers = hidden;

        visible.forEach(p => {
            list.appendChild(createPlayerCard(p));
        });

        if (hidden.length > 0) {
            moreBtn.classList.remove('hidden');
            moreBtn.textContent = `+${hidden.length} More`;
        } else {
            moreBtn.classList.add('hidden');
        }
    }

    function createPlayerCard(p) {
        const isMe = state.user && p.userId === state.user.id;
        const rank = getRankLabel(p.elo || 1000);
        const card = document.createElement('div');
        card.className = `sidebar-player-card${isMe ? ' is-me' : ''}`;
        card.dataset.userId = p.userId;

        const avatarBg = rank.color;
        const letter = (p.username || '?')[0].toUpperCase();
        const imgHtml = p.photoURL
            ? `<img src="${escapeHtml(p.photoURL)}" alt="" onerror="this.style.display='none';this.nextSibling.style.display='flex'" /><span style="display:none">${letter}</span>`
            : `<span>${letter}</span>`;

        const diamondBadge = p.isDiamondPro ? (typeof QV !== 'undefined' && QV.getDiamondProBadge ? QV.getDiamondProBadge(11) : '♦') : '';
        card.innerHTML = `
            <div class="sidebar-player-avatar" style="background:${avatarBg}">${imgHtml}</div>
            <div class="sidebar-player-details">
                <div class="sidebar-player-name">${escapeHtml(p.username)}${isMe ? ' ★' : ''}${diamondBadge ? ' ' + diamondBadge : ''}</div>
                <div class="sidebar-player-elo">${p.elo || 1000} • ${rank.name}</div>
            </div>
        `;

        // Clicking a card (not self) opens the in-game profile popup
        if (!isMe) {
            card.addEventListener('click', () => openIngameProfile(p.userId));
        }

        return card;
    }

    // ── More button: show hidden players ─────────────────────────
    $('btn-sidebar-more').addEventListener('click', () => {
        const list = $('game-players-list');
        _hiddenPlayers.forEach(p => list.appendChild(createPlayerCard(p)));
        $('btn-sidebar-more').classList.add('hidden');
        _hiddenPlayers = [];
    });

    // ── In-game profile popup ─────────────────────────────────────
    let _igpUserId = null;

    async function openIngameProfile(userId) {
        _igpUserId = userId;
        try {
            const data = await QV.api(`/profile/${userId}`);
            const u = data.user;
            const rank = getRankLabel(u.elo || 0);

            $('igp-avatar-letter').textContent = u.username[0].toUpperCase();
            const img = $('igp-avatar-img');
            if (u.photoURL) {
                img.src = u.photoURL;
                img.classList.remove('hidden');
                $('igp-avatar-letter').style.display = 'none';
            } else {
                img.classList.add('hidden');
                $('igp-avatar-letter').style.display = '';
            }
            $('igp-avatar').style.background = rank.color;

            $('igp-username').textContent = u.username;
            $('igp-rank').textContent = rank.name;
            $('igp-elo').textContent = `${u.elo} ELO`;

            const acc = u.stats.totalAnswers > 0
                ? Math.round((u.stats.correctAnswers / u.stats.totalAnswers) * 100) : 0;
            $('igp-wins').textContent = u.stats.totalWins || 0;
            $('igp-losses').textContent = u.stats.totalLosses || 0;
            $('igp-accuracy').textContent = acc + '%';

            // Show/hide add friend button
            const addBtn = $('btn-igp-add-friend');
            if (state.user) {
                const alreadyFriend = state.user.friends && state.user.friends.includes(userId);
                if (alreadyFriend) {
                    addBtn.textContent = 'Friends ✓';
                    addBtn.disabled = true;
                } else {
                    addBtn.textContent = 'Add Friend';
                    addBtn.disabled = false;
                }
            }

            QV.showModal('modal-ingame-profile');
        } catch (err) {
            toast('Could not load profile.', 'error');
        }
    }

    $('btn-igp-add-friend').addEventListener('click', async () => {
        if (!_igpUserId) return;
        try {
            await QV.api(`/friends/request/${_igpUserId}`, { method: 'POST' });
            toast('Friend request sent!', 'success');
            $('btn-igp-add-friend').textContent = 'Sent ✓';
            $('btn-igp-add-friend').disabled = true;
        } catch (err) {
            toast(err.message || 'Could not send request.', 'error');
        }
    });

    // ── Quick Game ─────────────────────────────────────────────
    let _queueTimeout = null;

    $('btn-quick-game').addEventListener('click', () => {
        if (state.isStartingGame) return;
        state.isStartingGame = true;
        $('btn-quick-game').disabled = true;
        socket.emit('queue-join');
        showQueueOverlay();
        setTimeout(() => { state.isStartingGame = false; $('btn-quick-game').disabled = false; }, 3000);
    });

    function showQueueOverlay() {
        $('overlay-queue').classList.remove('hidden');
        $('queue-status-text').textContent = 'Sit tight. Matching you with a worthy rival.';
        clearTimeout(_queueTimeout);
        // Auto-cancel after 90 seconds to prevent getting stuck
        _queueTimeout = setTimeout(() => {
            if (!$('overlay-queue').classList.contains('hidden')) {
                socket.emit('queue-leave');
                hideQueueOverlay();
                toast('No opponents found right now. Try again!', 'info');
                state.isStartingGame = false;
                $('btn-quick-game').disabled = false;
            }
        }, 90000);
        // Show "still searching" after 20s
        setTimeout(() => {
            const overlay = $('overlay-queue');
            if (overlay && !overlay.classList.contains('hidden')) {
                $('queue-status-text').textContent = 'Still searching... Hang tight!';
            }
        }, 20000);
    }

    function hideQueueOverlay() {
        $('overlay-queue').classList.add('hidden');
        clearTimeout(_queueTimeout);
        _queueTimeout = null;
    }

    $('btn-cancel-queue').addEventListener('click', () => {
        socket.emit('queue-leave');
        hideQueueOverlay();
    });

    socket.on('queue-matched', ({ opponent, topic }) => {
        hideQueueOverlay();
        clearGameState();
        // Show loading overlay while questions are generated
        $('generating-title').textContent = 'Generating Questions...';
        $('generating-topic-text').textContent = `Topic: ${topic} · Opponent: ${opponent.username}`;
        $('overlay-generating').classList.remove('hidden');
        if (typeof QV !== 'undefined' && QV.startLoadingTips) QV.startLoadingTips();
        toast(`Matched with ${opponent.username}! Topic: ${topic}`, 'success');
    });

    socket.on('queue-error', ({ message }) => {
        hideQueueOverlay();
        $('overlay-generating').classList.add('hidden');
        toast(message || 'Matchmaking failed. Please try again.', 'error');
    });

    socket.on('game-error', (message) => {
        $('overlay-generating').classList.add('hidden');
        state.isStartingGame = false;
        $('btn-start-solo').disabled = false;
        toast(typeof message === 'string' ? message : 'Something went wrong. Please try again.', 'error');
    });

    // ── Solo Mode ──────────────────────────────────────────────
    $('btn-solo-mode').addEventListener('click', () => QV.showModal('modal-solo'));

    $('solo-preset-select').addEventListener('change', function () {
        if (this.value) $('solo-topic').value = '';
    });
    $('solo-topic').addEventListener('input', function () {
        if (this.value.trim()) $('solo-preset-select').value = '';
    });

    let _soloGenTimeout = null;

    $('btn-start-solo').addEventListener('click', () => {
        if (state.isStartingGame) return;
        state.isStartingGame = true;
        $('btn-start-solo').disabled = true;

        const presetId = $('solo-preset-select').value;
        if (presetId) {
            socket.emit('preset-start', { presetId });
            QV.hideModal('modal-solo');
            toast('Creating preset game...', 'info');
        } else {
            const topic = $('solo-topic').value.trim() || 'General Knowledge';
            const questionCount = parseInt($('solo-questions').value) || 5;
            const rawTime = parseInt($('solo-time').value);
            const timeLimit = isNaN(rawTime) ? 10 : rawTime;
            socket.emit('solo-start', { topic, questionCount, timeLimit });
            QV.hideModal('modal-solo');
            toast('Generating questions...', 'info');
        }

        // Safety timeout: if no game starts in 90s, go back to dashboard
        _soloGenTimeout = setTimeout(() => {
            if (state.isStartingGame) {
                state.isStartingGame = false;
                $('btn-start-solo').disabled = false;
                if ($('view-game').classList.contains('active') || document.getElementById('view-game').style.display !== 'none') {
                    showView('view-dashboard');
                    showPanel('home');
                    toast('Game generation timed out. Please try again.', 'error');
                }
            }
        }, 90000);

        setTimeout(() => { state.isStartingGame = false; $('btn-start-solo').disabled = false; }, 5000);
    });

    socket.on('solo-generating', () => {
        clearTimeout(_soloGenTimeout);
        clearGameState();
        showView('view-game');
        $('game-question-text').textContent = 'AI is generating questions...';
    });

    socket.on('solo-game-start', ({ gameId }) => {
        clearTimeout(_soloGenTimeout);
        state.currentGameId = gameId;
        state.isStartingGame = false;
        clearGameState();
        showView('view-game');
        toast('Game starting!', 'info');
    });

    // ── Game Question ──────────────────────────────────────────
    socket.on('game-question', (data) => {
        if (data.questionId) {
            if (state.currentQuestionId && state.currentQuestionId === data.questionId) return;
            state.currentQuestionId = data.questionId;
        }

        // Decode obfuscated question data if encoded
        if (data.encoded) {
            try {
                data.question = QV.deobfuscate(data.question);
                data.options = data.options.map(o => QV.deobfuscate(o));
            } catch (e) {
                console.error('Deobfuscation error:', e);
                toast('Failed to decode question — please refresh.', 'error');
                return;
            }
        }

        // Hide loading overlay when game starts
        $('overlay-generating').classList.add('hidden');
        if (typeof QV !== 'undefined' && QV.stopLoadingTips) QV.stopLoadingTips();

        state.isStartingGame = false;
        state.currentGameId = data.gameId;
        state.gameTimeLimit = data.timeLimit;
        state.gameTimeLeft = data.timeLimit;

        showView('view-game');

        // Set room title at top of game
        if (data.topic) {
            $('game-room-title').textContent = data.topic;
            $('game-room-title').style.display = '';
        }

        // Render players sidebar
        renderPlayersSidebar(data.scores, data.gameType);

        const scoreboard = $('game-scoreboard');
        if (data.playerCount && data.playerCount > 2) {
            scoreboard.style.display = 'none';
        } else {
            scoreboard.style.display = '';
            const me = data.scores.find(s => s.userId === state.user.id);
            const opponent = data.scores.find(s => s.userId !== state.user.id);
            $('game-p1-name').textContent = me ? me.username : 'You';
            $('game-p1-score').textContent = me ? me.score : '0';
            $('game-p2-name').textContent = opponent ? opponent.username : 'AI';
            $('game-p2-score').textContent = opponent ? opponent.score : '-';
        }

        const roundOverlay = document.getElementById('round-results-overlay');
        if (roundOverlay) roundOverlay.classList.add('hidden');

        // Track if multiplayer for "waiting for opponent" logic
        state.isMultiplayer = data.playerCount > 1;

        $('game-q-counter').textContent = `Q${data.questionIndex + 1}/${data.totalQuestions}`;
        $('game-question-text').textContent = data.question;
        $('game-feedback').classList.add('hidden');
        $('game-waiting-opponent').classList.add('hidden');

        // Show question image if present
        const imgContainer = $('game-question-image');
        const imgEl = $('game-question-img');
        if (imgContainer && imgEl) {
            if (data.imageUrl) {
                imgEl.src = data.imageUrl;
                imgContainer.classList.remove('hidden');
            } else {
                imgEl.src = '';
                imgContainer.classList.add('hidden');
            }
        }

        const optionsEl = $('game-options');
        optionsEl.innerHTML = '';
        const letters = ['A', 'B', 'C', 'D'];
        data.options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = 'game-option';
            btn.innerHTML = `<span class="option-letter">${letters[idx]}</span><span>${opt}</span>`;
            btn.addEventListener('click', () => {
                if (btn.classList.contains('disabled')) return;
                // Instant visual feedback BEFORE the server responds
                optionsEl.querySelectorAll('.game-option').forEach(b => {
                    b.classList.add('disabled');
                    b.classList.remove('selected');
                });
                btn.classList.add('selected');
                socket.emit('game-answer', { gameId: state.currentGameId, answerIndex: idx });
            });
            optionsEl.appendChild(btn);
        });

        startGameTimer(data.timeLimit);
    });

    function startGameTimer(limit) {
        // Cancel any running timer
        if (state._timerRafId) { cancelAnimationFrame(state._timerRafId); state._timerRafId = null; }
        if (state.gameTimerInterval) { clearInterval(state.gameTimerInterval); state.gameTimerInterval = null; }

        const fill = $('game-timer-fill');
        const timerBar = fill ? fill.parentElement : null;

        if (limit === 0) {
            if (timerBar) timerBar.style.display = 'none';
            return;
        }

        if (timerBar) timerBar.style.display = '';
        fill.style.width = '100%';
        fill.className = 'game-timer-fill';

        const startTime = performance.now();

        function tick(now) {
            const elapsed = (now - startTime) / 1000;
            const remaining = Math.max(0, limit - elapsed);
            const pct = (remaining / limit) * 100;

            fill.style.width = pct + '%';

            // Class swap only when threshold crossed (avoids repeated className sets)
            const wantClass = pct < 30 ? 'game-timer-fill danger' : pct < 60 ? 'game-timer-fill warning' : 'game-timer-fill';
            if (fill.className !== wantClass) fill.className = wantClass;

            if (remaining > 0) {
                state._timerRafId = requestAnimationFrame(tick);
            } else {
                state._timerRafId = null;
            }
        }

        state._timerRafId = requestAnimationFrame(tick);
    }

    socket.on('answer-result', ({ correct, points, correctAnswer, playerScore, timeout }) => {
        if (state._timerRafId) { cancelAnimationFrame(state._timerRafId); state._timerRafId = null; }
        if (state.gameTimerInterval) { clearInterval(state.gameTimerInterval); state.gameTimerInterval = null; }
        $('game-p1-score').textContent = playerScore;

        const options = $('game-options').querySelectorAll('.game-option');
        options.forEach((opt, idx) => {
            opt.classList.add('disabled');
            opt.classList.remove('selected');
            if (idx === correctAnswer) opt.classList.add('correct');
        });

        const feedback = $('game-feedback');
        feedback.classList.remove('hidden', 'correct', 'wrong', 'timeout');

        if (timeout) {
            feedback.classList.add('timeout');
            feedback.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-3px;margin-right:6px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Time's up!`;
        } else if (correct) {
            feedback.classList.add('correct');
            feedback.textContent = `✅ Correct! +${points} points`;
        } else {
            feedback.classList.add('wrong');
            feedback.textContent = `❌ Wrong answer!`;
            options.forEach(opt => {
                if (opt.style.borderColor && !opt.classList.contains('correct')) {
                    opt.classList.add('wrong');
                }
            });
        }

        // Show waiting indicator in multiplayer while the opponent answers
        if (state.isMultiplayer && !timeout) {
            $('game-waiting-opponent').classList.remove('hidden');
        }
    });

    socket.on('opponent-answered', () => { });

    socket.on('player-left', (data) => {
        toast(`${data.username} left the game (${data.remainingPlayers} players remaining)`, 'info');
    });

    socket.on('round-summary', (data) => {
        if (!data.playerCount || data.playerCount <= 2) {
            const me = data.players.find(p => p.userId === state.user.id);
            if (me) $('game-p1-score').textContent = me.score;
            const opp = data.players.find(p => p.userId !== state.user.id);
            if (opp) $('game-p2-score').textContent = opp.score;
        }

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

    // ── Leave Game ─────────────────────────────────────────────
    $('btn-leave-game').addEventListener('click', () => {
        const gameId = state.currentGameId;
        if (!gameId) {
            showView('view-dashboard');
            showPanel('home');
            return;
        }
        if (!confirm('Leave game? In multiplayer this counts as a forfeit and you will lose ELO.')) return;

        clearInterval(state.gameTimerInterval);
        state.leavingGame = true;
        state.currentGameId = null;
        socket.emit('game-leave', { gameId });
        clearGameState();
        showView('view-dashboard');
        showPanel('home');
        toast('You left the game.', 'info');
    });

    // ── Game Over ──────────────────────────────────────────────
    socket.on('game-over', (data) => {
        // If the player left voluntarily, skip rendering results
        if (state.leavingGame) {
            state.leavingGame = false;
            return;
        }

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

        const scoresEl = $('game-over-scores');
        scoresEl.innerHTML = '';
        (data.players || []).forEach(p => {
            const card = document.createElement('div');
            card.className = `go-score-card ${data.winner && p.userId === data.winner.userId ? 'winner' : ''}`;
            card.innerHTML = `
                <div class="go-score-name">${escapeHtml(p.username)}</div>
                <div class="go-score-value">${p.score}</div>
            `;
            scoresEl.appendChild(card);
        });

        const eloSection = $('game-over-elo');
        if (data.eloDelta !== undefined) {
            eloSection.classList.remove('hidden');
            const me = data.players.find(p => p.userId === state.user.id);
            if (me) {
                const display = $('elo-change-display');
                display.className = `elo-change ${me.eloChange > 0 ? 'positive' : 'negative'}`;
                display.textContent = `Elo: ${me.elo} (${me.eloChange > 0 ? '+' : ''}${me.eloChange})`;
                state.user.elo = me.elo;
                QV.updateNavUser();
            }
        } else {
            eloSection.classList.add('hidden');
        }

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

        // Show correct action buttons based on game type
        const rematchBtn = $('btn-rematch');
        const playAgainBtn = $('btn-play-again');
        const isSolo = !data.players || data.players.length < 2 ||
            (data.players.length === 2 && data.players.every(p => p.userId === state.user.id));

        if (isSolo || (data.players && data.players.length === 1)) {
            rematchBtn.classList.add('hidden');
            playAgainBtn.classList.remove('hidden');
        } else {
            // Multiplayer: show rematch button
            const opponent = (data.players || []).find(p => p.userId !== state.user.id);
            if (opponent) {
                rematchBtn.classList.remove('hidden');
                rematchBtn.dataset.opponentId = opponent.userId;
                rematchBtn.dataset.topic = data.topic || '';
            } else {
                rematchBtn.classList.add('hidden');
            }
            playAgainBtn.classList.add('hidden');
        }
    });

    // ── Rematch ────────────────────────────────────────────────
    $('btn-rematch').addEventListener('click', () => {
        const opponentId = $('btn-rematch').dataset.opponentId;
        const topic = $('btn-rematch').dataset.topic;
        if (!opponentId) {
            showView('view-dashboard');
            showPanel('home');
            return;
        }
        socket.emit('challenge-friend', { friendId: opponentId, topic: topic || 'General Knowledge' });
        showView('view-dashboard');
        showPanel('home');
        toast('Rematch challenge sent!', 'info');
    });

    // ── Play Again (solo) ──────────────────────────────────────
    $('btn-play-again').addEventListener('click', () => {
        showView('view-dashboard');
        showPanel('home');
    });

    $('btn-back-dashboard').addEventListener('click', () => {
        showView('view-dashboard');
        showPanel('home');
    });

    // ── beforeunload warning ───────────────────────────────────
    window.addEventListener('beforeunload', (e) => {
        if (state.currentGameId) {
            e.preventDefault();
            e.returnValue = 'You are in an active game! Leaving will count as a forfeit and you will lose ELO. Are you sure?';
            return e.returnValue;
        }
    });
})();
