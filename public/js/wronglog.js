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

            // Add "Explain All" batch button at the top if there are questions
            if (questions.length > 1) {
                const batchBar = document.createElement('div');
                batchBar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:0.75rem;';
                batchBar.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-explain-all">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;">
                        <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    Explain All (AI)
                </button>`;
                list.appendChild(batchBar);

                batchBar.querySelector('#btn-explain-all').addEventListener('click', async function () {
                    this.disabled = true;
                    this.innerHTML = '<div class="spinner"></div> Explaining all...';

                    // Take up to 10 most recent
                    const batch = questions.slice(0, 10).map(q => ({
                        question: q.question,
                        options: q.options,
                        correctIndex: q.correctIndex,
                        yourAnswerIndex: q.yourAnswerIndex,
                    }));

                    try {
                        const result = await api('/explain-questions-batch', {
                            method: 'POST',
                            body: { questions: batch },
                        });

                        const explanations = result.explanations || [];
                        explanations.forEach((explanation, i) => {
                            const area = $(`explain-area-${i}`);
                            if (area) {
                                area.innerHTML = `<div class="wrong-q-explanation"><span class="explain-icon">💡</span> ${escapeHtml(explanation)}</div>`;
                            }
                            const btn = list.querySelector(`[data-idx="${i}"]`);
                            if (btn) {
                                btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Hide`;
                            }
                        });
                        toast('All explanations loaded!', 'success');
                    } catch (err) {
                        toast('Batch explain failed. Try individual explains.', 'error');
                    }

                    this.disabled = false;
                    this.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Explain All (AI)`;
                });
            }

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

                    // Toggle off if already showing
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
    };
})();
