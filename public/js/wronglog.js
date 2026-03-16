/**
 * @file public/js/wronglog.js
 * @description Wrong answers panel with AI explain feature.
 */

(function () {
    'use strict';
    const { $, state, socket, showPanel, toast, escapeHtml, api } = QV;

    // ── Wrong Answers button ───────────────────────────────────
    $('btn-wrong-answers').addEventListener('click', () => {
        showPanel('wronglog');
        QV.loadWrongQuestions();
    });

    // Auto-load when navigating to wronglog panel via sidebar
    const wronglogNavBtn = document.getElementById('nav-wronglog');
    if (wronglogNavBtn) {
        wronglogNavBtn.addEventListener('click', () => {
            QV.loadWrongQuestions();
        });
    }

    // ── Load Wrong Questions ───────────────────────────────────
    QV.loadWrongQuestions = async function loadWrongQuestions() {
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
                        <button class="btn-explain btn-simple-explain" data-idx="${idx}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            Simple Explain 💡
                        </button>
                        <button class="btn-explain btn-super-explain${QV.isDiamondPro() ? '' : ' explain-locked'}" data-idx="${idx}" title="${QV.isDiamondPro() ? 'Deep AI explanation powered by Gemini' : 'Diamond Pro feature — click to upgrade'}">
                            ${QV.isDiamondPro() ? '' : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> '}⚡ Super Explain
                        </button>
                    </div>
                    <div class="wrong-q-explanation-area" id="explain-area-${idx}"></div>
                `;

                // Simple Explain button handler
                const explainBtn = card.querySelector('.btn-simple-explain');
                explainBtn.addEventListener('click', async () => {
                    const area = $(`explain-area-${idx}`);
                    if (area.dataset.mode === 'simple' && area.innerHTML.trim()) {
                        area.innerHTML = '';
                        area.dataset.mode = '';
                        explainBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Simple Explain 💡`;
                        return;
                    }
                    explainBtn.disabled = true;
                    explainBtn.innerHTML = '<div class="spinner"></div> Thinking...';
                    try {
                        const result = await api('/explain-question', { method: 'POST', body: { question: q.question, options: q.options, correctIndex: q.correctIndex, yourAnswerIndex: q.yourAnswerIndex } });
                        area.innerHTML = `<div class="wrong-q-explanation"><span class="explain-icon">💡</span> ${escapeHtml(result.explanation)}</div>`;
                        area.dataset.mode = 'simple';
                        explainBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Hide`;
                    } catch (err) {
                        const msg = err.message || '';
                        area.innerHTML = `<div class="wrong-q-explanation"><span class="explain-icon">⚠️</span> ${msg.includes('daily_limit') ? 'Daily explain limit reached. Upgrade to Diamond Pro for 200/day.' : 'Failed to generate explanation. Try again!'}</div>`;
                        explainBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Simple Explain 💡`;
                    }
                    explainBtn.disabled = false;
                });

                // Super Explain button handler
                const superBtn = card.querySelector('.btn-super-explain');
                superBtn.addEventListener('click', async () => {
                    if (!QV.isDiamondPro()) {
                        QV.showPanel('diamond');
                        return;
                    }
                    const area = $(`explain-area-${idx}`);
                    if (area.dataset.mode === 'super' && area.innerHTML.trim()) {
                        area.innerHTML = '';
                        area.dataset.mode = '';
                        superBtn.innerHTML = '⚡ Super Explain';
                        return;
                    }
                    superBtn.disabled = true;
                    superBtn.innerHTML = '<div class="spinner"></div> Analyzing...';
                    try {
                        const result = await api('/super-explain-question', { method: 'POST', body: { question: q.question, options: q.options, correctIndex: q.correctIndex, yourAnswerIndex: q.yourAnswerIndex } });
                        area.innerHTML = `<div class="wrong-q-explanation super-explanation"><span class="explain-icon">⚡</span> ${escapeHtml(result.explanation)}</div>`;
                        area.dataset.mode = 'super';
                        superBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Hide`;
                    } catch (err) {
                        area.innerHTML = `<div class="wrong-q-explanation"><span class="explain-icon">⚠️</span> Super Explain failed or daily limit reached. Try again!</div>`;
                        superBtn.innerHTML = '⚡ Super Explain';
                    }
                    superBtn.disabled = false;
                });

                list.appendChild(card);
            });
        } catch (err) {
            console.error('Wrong questions load error:', err);
            list.innerHTML = '<p class="text-muted" style="text-align:center; padding: 2rem;">Failed to load wrong answers. Try again later.</p>';
        }
    };
})();
