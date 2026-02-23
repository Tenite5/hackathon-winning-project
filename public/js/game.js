/**
 * @file public/js/game.js
 * @description Game UI — question rendering, timer, answer result, game-over, play-again.
 */

(function () {
    'use strict';
    const { $, state, socket, showView, showPanel, toast, escapeHtml } = QV;

    // ── Clear stale game UI ───────────────────────────────────
    function clearGameState() {
        $('game-question-text').textContent = 'Loading questions...';
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
        // Clear game chat
        const chatMsgs = $('game-chat-messages');
        if (chatMsgs) chatMsgs.innerHTML = '';
        const chatPanel = $('game-chat-panel');
        if (chatPanel) chatPanel.classList.add('hidden');
        clearInterval(state.gameTimerInterval);
    }
    QV.clearGameState = clearGameState;

    // ── Quick Game ─────────────────────────────────────────────
    $('btn-quick-game').addEventListener('click', () => {
        if (state.isStartingGame) return;
        state.isStartingGame = true;
        $('btn-quick-game').disabled = true;
        socket.emit('queue-join');
        $('overlay-queue').classList.remove('hidden');
        setTimeout(() => { state.isStartingGame = false; $('btn-quick-game').disabled = false; }, 3000);
    });

    $('btn-cancel-queue').addEventListener('click', () => {
        socket.emit('queue-leave');
        $('overlay-queue').classList.add('hidden');
    });

    socket.on('queue-matched', ({ opponent, topic }) => {
        $('overlay-queue').classList.add('hidden');
        clearGameState();
        toast(`Matched with ${opponent.username}! Topic: ${topic}`, 'success');
    });

    socket.on('queue-error', ({ message }) => {
        $('overlay-queue').classList.add('hidden');
        toast(message || 'Matchmaking failed. Please try again.', 'error');
    });

    // ── Solo Mode ──────────────────────────────────────────────
    $('btn-solo-mode').addEventListener('click', () => QV.showModal('modal-solo'));

    // Preset/topic interaction for solo modal
    $('solo-preset-select').addEventListener('change', function () {
        if (this.value) $('solo-topic').value = '';
    });
    $('solo-topic').addEventListener('input', function () {
        if (this.value.trim()) $('solo-preset-select').value = '';
    });

    $('btn-start-solo').addEventListener('click', () => {
        if (state.isStartingGame) return;
        state.isStartingGame = true;
        $('btn-start-solo').disabled = true;

        const presetId = $('solo-preset-select').value;
        if (presetId) {
            // Use preset questions via solo
            socket.emit('preset-start', { presetId });
            QV.hideModal('modal-solo');
            toast('Creating preset game...', 'info');
        } else {
            const topic = $('solo-topic').value.trim() || 'General Knowledge';
            const questionCount = parseInt($('solo-questions').value) || 5;
            const timeLimit = parseInt($('solo-time').value) || 10;
            socket.emit('solo-start', { topic, questionCount, timeLimit });
            QV.hideModal('modal-solo');
            toast('Generating questions...', 'info');
        }

        setTimeout(() => { state.isStartingGame = false; $('btn-start-solo').disabled = false; }, 5000);
    });

    socket.on('solo-generating', () => {
        clearGameState();
        showView('view-game');
        $('game-question-text').textContent = 'AI is generating questions...';
    });

    // ── Game Question ──────────────────────────────────────────
    socket.on('game-question', (data) => {
        if (data.questionId) {
            if (state.currentQuestionId && state.currentQuestionId === data.questionId) return;
            state.currentQuestionId = data.questionId;
        }

        state.isStartingGame = false;
        state.currentGameId = data.gameId;
        state.gameTimeLimit = data.timeLimit;
        state.gameTimeLeft = data.timeLimit;

        showView('view-game');

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

        $('game-q-counter').textContent = `Q${data.questionIndex + 1}/${data.totalQuestions}`;
        $('game-question-text').textContent = data.question;
        $('game-feedback').classList.add('hidden');

        const optionsEl = $('game-options');
        optionsEl.innerHTML = '';
        const letters = ['A', 'B', 'C', 'D'];
        data.options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = 'game-option';
            btn.innerHTML = `<span class="option-letter">${letters[idx]}</span><span>${opt}</span>`;
            btn.addEventListener('click', () => {
                if (btn.classList.contains('disabled')) return;
                optionsEl.querySelectorAll('.game-option').forEach(b => b.classList.add('disabled'));
                btn.style.borderColor = 'var(--accent-primary)';
                socket.emit('game-answer', { gameId: state.currentGameId, answerIndex: idx });
            });
            optionsEl.appendChild(btn);
        });

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

        const options = $('game-options').querySelectorAll('.game-option');
        options.forEach((opt, idx) => {
            opt.classList.add('disabled');
            if (idx === correctAnswer) opt.classList.add('correct');
        });

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
            options.forEach(opt => {
                if (opt.style.borderColor && !opt.classList.contains('correct')) {
                    opt.classList.add('wrong');
                }
            });
        }
    });

    socket.on('opponent-answered', () => { });

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

        const eloSection = $('game-over-elo');
        if (data.eloDelta !== undefined) {
            eloSection.classList.remove('hidden');
            const me = data.players.find(p => p.userId === state.user.id);
            if (me) {
                const display = $('elo-change-display');
                display.className = `elo-change ${me.eloChange > 0 ? 'positive' : 'negative'}`;
                display.textContent = `Elo: ${me.elo} (${me.eloChange > 0 ? '+' : ''}${me.eloChange})`;
            }
            if (me) {
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
    });

    $('btn-play-again').addEventListener('click', () => {
        if (!state.lastGameData) {
            showView('view-dashboard');
            showPanel('home');
            return;
        }
        const lastGame = state.lastGameData;
        if (lastGame.topic) {
            socket.emit('queue-join');
            $('overlay-queue').classList.remove('hidden');
            showView('view-dashboard');
            showPanel('home');
        } else {
            showView('view-dashboard');
            showPanel('home');
        }
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
