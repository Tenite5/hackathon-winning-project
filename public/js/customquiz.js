/**
 * @file public/js/customquiz.js
 * @description Custom Quiz Creator — write your own questions, add images, set timers.
 */

(function () {
    'use strict';
    const { $, socket, showModal, hideModal, toast } = QV;

    let questionCount = 0;

    // ── Open modal ────────────────────────────────────────────
    $('btn-custom-quiz').addEventListener('click', () => {
        showModal('modal-custom-quiz');
        if (questionCount === 0) {
            addQuestion();
            addQuestion();
        }
        validateForm();
    });

    // ── Custom quiz always creates a lobby (solo disabled for user-created questions) ──
    const cqLobbyOpts = $('cq-lobby-options');
    if (cqLobbyOpts) cqLobbyOpts.classList.remove('hidden');

    // ── Add question ──────────────────────────────────────────
    $('btn-cq-add-question').addEventListener('click', addQuestion);

    function addQuestion() {
        questionCount++;
        const idx = questionCount;
        const card = document.createElement('div');
        card.className = 'cq-question-card glass-card';
        card.dataset.idx = idx;
        card.innerHTML = `
            <div class="cq-q-header">
                <span class="cq-q-num">Q${idx}</span>
                <button type="button" class="btn btn-ghost btn-xs cq-remove-btn" title="Remove">&times;</button>
            </div>
            <div class="input-group">
                <label>Question</label>
                <input type="text" class="qv-input cq-q-text" placeholder="Enter your question..." maxlength="300" />
            </div>
            <div class="input-group">
                <label>Image (optional)</label>
                <div class="cq-img-upload">
                    <input type="file" class="cq-img-input hidden" accept="image/*" />
                    <button type="button" class="btn btn-ghost btn-xs cq-img-btn">Upload Image</button>
                    <span class="cq-img-name"></span>
                    <img class="cq-img-preview hidden" alt="preview" />
                </div>
            </div>
            <div class="cq-options-grid">
                <div class="input-group cq-opt">
                    <label>A</label>
                    <input type="text" class="qv-input cq-opt-input" data-opt="0" placeholder="Option A" maxlength="150" />
                </div>
                <div class="input-group cq-opt">
                    <label>B</label>
                    <input type="text" class="qv-input cq-opt-input" data-opt="1" placeholder="Option B" maxlength="150" />
                </div>
                <div class="input-group cq-opt">
                    <label>C</label>
                    <input type="text" class="qv-input cq-opt-input" data-opt="2" placeholder="Option C" maxlength="150" />
                </div>
                <div class="input-group cq-opt">
                    <label>D</label>
                    <input type="text" class="qv-input cq-opt-input" data-opt="3" placeholder="Option D" maxlength="150" />
                </div>
            </div>
            <div class="input-group">
                <label>Correct Answer</label>
                <select class="qv-input cq-correct-select">
                    <option value="0">A</option>
                    <option value="1">B</option>
                    <option value="2">C</option>
                    <option value="3">D</option>
                </select>
            </div>
        `;

        // Remove button
        card.querySelector('.cq-remove-btn').addEventListener('click', () => {
            card.remove();
            renumberQuestions();
            validateForm();
        });

        // Image upload
        const imgBtn = card.querySelector('.cq-img-btn');
        const imgInput = card.querySelector('.cq-img-input');
        const imgName = card.querySelector('.cq-img-name');
        const imgPreview = card.querySelector('.cq-img-preview');

        imgBtn.addEventListener('click', () => imgInput.click());
        imgInput.addEventListener('change', () => {
            const file = imgInput.files[0];
            if (file) {
                if (file.size > 2 * 1024 * 1024) {
                    toast('Image must be under 2MB', 'error');
                    imgInput.value = '';
                    return;
                }
                imgName.textContent = file.name;
                const reader = new FileReader();
                reader.onload = (e) => {
                    imgPreview.src = e.target.result;
                    imgPreview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });

        // Validate on input changes
        card.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('input', validateForm);
        });

        $('cq-questions-list').appendChild(card);
        validateForm();
    }

    function renumberQuestions() {
        const cards = $('cq-questions-list').querySelectorAll('.cq-question-card');
        cards.forEach((card, i) => {
            card.querySelector('.cq-q-num').textContent = `Q${i + 1}`;
        });
        questionCount = cards.length;
    }

    function validateForm() {
        const cards = $('cq-questions-list').querySelectorAll('.cq-question-card');
        let valid = cards.length >= 2;

        cards.forEach(card => {
            const qText = card.querySelector('.cq-q-text').value.trim();
            const opts = card.querySelectorAll('.cq-opt-input');
            if (!qText) valid = false;
            opts.forEach(o => {
                if (!o.value.trim()) valid = false;
            });
        });

        $('btn-cq-start').disabled = !valid;
    }

    // ── Start quiz ────────────────────────────────────────────
    $('btn-cq-start').addEventListener('click', () => {
        const cards = $('cq-questions-list').querySelectorAll('.cq-question-card');
        const questions = [];

        cards.forEach(card => {
            const qText = card.querySelector('.cq-q-text').value.trim();
            const opts = Array.from(card.querySelectorAll('.cq-opt-input')).map(o => o.value.trim());
            const correct = parseInt(card.querySelector('.cq-correct-select').value, 10);
            const imgPreview = card.querySelector('.cq-img-preview');
            const imageData = imgPreview.classList.contains('hidden') ? null : imgPreview.src;

            questions.push({
                question: imageData ? `<img src="${imageData}" class="cq-q-image" /> ${qText}` : qText,
                options: opts,
                correct,
                difficulty: 'custom',
            });
        });

        if (questions.length < 2) {
            toast('Add at least 2 questions', 'error');
            return;
        }

        const title = $('cq-title').value.trim() || 'Custom Quiz';
        const rawTime = parseInt($('cq-time-limit').value, 10);
        const timeLimit = isNaN(rawTime) ? 15 : rawTime;
        const gameType = document.querySelector('input[name="cq-game-type"]:checked').value;

        const maxPlayers = parseInt($('cq-max-players').value, 10) || 2;
        const isPublic = $('cq-lobby-public').checked;

        socket.emit('custom-quiz-start', {
            questions,
            timeLimit,
            topic: title,
            mode: gameType,
            maxPlayers,
            isPublic,
        });
        hideModal('modal-custom-quiz');
        toast('Creating custom quiz lobby...', 'success');
    });
})();
