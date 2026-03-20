/**
 * @file public/js/pdfmode.js
 * @description PDF / Image mode — upload, analyze, save, reuse, and play.
 */

(function () {
    'use strict';
    const { $, state, socket, api, showView, showPanel, showModal, hideModal, toast, escapeHtml } = QV;

    // ── State ────────────────────────────────────────────────────
    let selectedFile = null;
    let totalPages = 0;
    let reuseId = null;

    // ── Nav buttons ──────────────────────────────────────────────
    $('btn-pdf-mode').addEventListener('click', () => {
        loadSavedPdfs();
        showModal('modal-pdf-upload');
    });

    $('btn-pdf-upload-new').addEventListener('click', () => {
        loadSavedPdfs();
        showModal('modal-pdf-upload');
    });

    // ── Dropzone ─────────────────────────────────────────────────
    const dropZone = $('pdf-drop-zone');
    const fileInput = $('pdf-file-input');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) handleFileSelect(fileInput.files[0]);
    });

    $('btn-pdf-clear-file').addEventListener('click', clearFile);

    function handleFileSelect(file) {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        if (!allowed.includes(file.type)) {
            toast('Only PDF and image files are allowed', 'error');
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            toast('File too large (max 20MB)', 'error');
            return;
        }

        selectedFile = file;
        $('pdf-file-name').textContent = `${file.name} (${formatSize(file.size)})`;
        $('pdf-file-info').classList.remove('hidden');
        dropZone.style.display = 'none';
        $('btn-pdf-generate').disabled = false;

        // Check page count for PDFs — show page range UI immediately, update async
        if (file.type === 'application/pdf') {
            $('pdf-step-pages').classList.remove('hidden');
            $('pdf-page-notice').textContent = 'Checking page count...';
            $('pdf-page-notice').className = 'pdf-page-notice info';
            checkPageCount(file);
        } else {
            totalPages = 1;
            $('pdf-step-pages').classList.add('hidden');
        }
    }

    function clearFile() {
        selectedFile = null;
        totalPages = 0;
        fileInput.value = '';
        $('pdf-file-info').classList.add('hidden');
        dropZone.style.display = '';
        $('pdf-step-pages').classList.add('hidden');
        $('btn-pdf-generate').disabled = true;
    }

    async function checkPageCount(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/pdf/page-count', {
                method: 'POST',
                headers: { Authorization: `Bearer ${state.token}` },
                body: formData,
            });
            const data = await res.json();
            totalPages = data.totalPages || 1;

            if (totalPages > 102) {
                $('pdf-step-pages').classList.remove('hidden');
                $('pdf-page-notice').textContent = `This PDF has ${totalPages} pages. Please select a range (max 102 pages).`;
                $('pdf-page-notice').className = 'pdf-page-notice warning';
                $('pdf-page-from').max = totalPages;
                $('pdf-page-to').max = totalPages;
                $('pdf-page-to').value = Math.min(102, totalPages);
            } else if (totalPages > 1) {
                $('pdf-step-pages').classList.remove('hidden');
                $('pdf-page-notice').textContent = `PDF has ${totalPages} pages. Optionally select a page range.`;
                $('pdf-page-notice').className = 'pdf-page-notice info';
                $('pdf-page-from').max = totalPages;
                $('pdf-page-to').max = totalPages;
                $('pdf-page-to').value = totalPages;
            } else {
                $('pdf-step-pages').classList.add('hidden');
            }
        } catch {
            totalPages = 1;
            $('pdf-step-pages').classList.add('hidden');
        }
    }

    // ── Game type toggle ─────────────────────────────────────────
    document.querySelectorAll('input[name="pdf-game-type"]').forEach(radio => {
        radio.addEventListener('change', function () {
            document.querySelectorAll('.pdf-game-type-btns .pdf-game-radio').forEach(l => l.classList.remove('active'));
            this.closest('.pdf-game-radio').classList.add('active');
            $('pdf-lobby-options').classList.toggle('hidden', this.value !== 'custom');
        });
    });

    document.querySelectorAll('input[name="pdf-reuse-game-type"]').forEach(radio => {
        radio.addEventListener('change', function () {
            const btns = this.closest('.pdf-game-type-btns');
            btns.querySelectorAll('.pdf-game-radio').forEach(l => l.classList.remove('active'));
            this.closest('.pdf-game-radio').classList.add('active');
            $('pdf-reuse-lobby-options').classList.toggle('hidden', this.value !== 'custom');
        });
    });

    // ── Generate Quiz (new upload) ───────────────────────────────
    $('btn-pdf-generate').addEventListener('click', async () => {
        if (!selectedFile) return toast('Please select a file first', 'error');

        const btn = $('btn-pdf-generate');
        const statusEl = $('pdf-status');
        btn.disabled = true;
        statusEl.classList.remove('hidden');
        statusEl.textContent = 'Uploading & analyzing with AI...';

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('questionCount', $('pdf-question-count').value);
            formData.append('userPrompt', $('pdf-user-prompt').value);

            if (totalPages > 1) {
                formData.append('pageFrom', $('pdf-page-from').value);
                formData.append('pageTo', $('pdf-page-to').value);
            }

            // Step 1: Analyze
            const res = await fetch('/api/pdf/analyze', {
                method: 'POST',
                headers: { Authorization: `Bearer ${state.token}` },
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) {
                if (data.error === 'page_range_required') {
                    $('pdf-step-pages').classList.remove('hidden');
                    $('pdf-page-notice').textContent = data.message;
                    $('pdf-page-notice').className = 'pdf-page-notice warning';
                    $('pdf-page-from').max = data.totalPages;
                    $('pdf-page-to').max = data.totalPages;
                    $('pdf-page-to').value = Math.min(102, data.totalPages);
                    totalPages = data.totalPages;
                    throw new Error(data.message);
                }
                throw new Error(data.error || 'Analysis failed');
            }

            // Step 2: Optionally save the file
            if ($('pdf-save-file').checked) {
                statusEl.textContent = 'Saving PDF...';
                const saveForm = new FormData();
                saveForm.append('file', selectedFile);
                if (totalPages > 1) {
                    saveForm.append('pageFrom', $('pdf-page-from').value);
                    saveForm.append('pageTo', $('pdf-page-to').value);
                }
                const saveRes = await fetch('/api/pdf/save', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${state.token}` },
                    body: saveForm,
                });
                const saveData = await saveRes.json();
                if (!saveRes.ok) {
                    toast(saveData.message || saveData.error || 'Could not save PDF', 'error');
                } else {
                    toast('PDF saved!', 'success');
                }
            }

            // Step 3: Start game
            const gameType = document.querySelector('input[name="pdf-game-type"]:checked').value;
            const rawPdfTime = parseInt($('pdf-time-limit').value);
            const timeLimit = isNaN(rawPdfTime) ? 15 : rawPdfTime;
            const topic = data.fileInfo.fileName.replace(/\.[^.]+$/, '');

            if (gameType === 'solo') {
                socket.emit('pdf-solo-start', {
                    questions: data.questions,
                    timeLimit,
                    topic,
                });
                hideModal('modal-pdf-upload');
                QV.clearGameState();
                showView('view-game');
                $('game-question-text').textContent = 'Starting PDF quiz...';

                // Safety: if no game-question arrives within 10s, bail out
                const pdfTimeout = setTimeout(() => {
                    if (!state.currentGameId) {
                        toast('Failed to start PDF quiz. Please try again.', 'error');
                        showView('view-dashboard');
                        showPanel('pdfmode');
                    }
                }, 10000);
                const origGameId = state.currentGameId;
                const clearPdfTimeout = () => { clearTimeout(pdfTimeout); socket.off('game-question', clearPdfTimeout); socket.off('game-error', onPdfError); };
                const onPdfError = (msg) => { clearTimeout(pdfTimeout); toast(typeof msg === 'string' ? msg : 'Failed to start PDF quiz', 'error'); showView('view-dashboard'); showPanel('pdfmode'); socket.off('game-question', clearPdfTimeout); };
                socket.once('game-error', onPdfError);
                socket.on('game-question', clearPdfTimeout);
            } else {
                const maxPlayers = parseInt($('pdf-max-players').value) || 2;
                const isPublic = $('pdf-lobby-public').checked;
                socket.emit('pdf-lobby-create', {
                    questions: data.questions,
                    timeLimit,
                    topic,
                    maxPlayers,
                    isPublic,
                });
                hideModal('modal-pdf-upload');
                toast('Creating lobby with PDF questions...', 'info');
            }

            clearFile();
            statusEl.classList.add('hidden');
        } catch (err) {
            toast(err.message || 'Failed to analyze file', 'error');
            statusEl.classList.add('hidden');
        } finally {
            btn.disabled = false;
        }
    });

    // ── Load saved PDFs ──────────────────────────────────────────
    async function loadSavedPdfs() {
        try {
            const res = await fetch('/api/pdf/list', {
                headers: { Authorization: `Bearer ${state.token}` },
            });
            if (!res.ok) return;
            const pdfs = await res.json();
            renderSavedPdfs(pdfs);
        } catch {
            // silent fail
        }
    }

    function populateHomePdfDropdown(pdfs) {
        const sel = document.getElementById('home-pdf-saved-select');
        const btn = document.getElementById('btn-home-pdf-reuse');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Saved PDFs --</option>';
        pdfs.forEach(pdf => {
            const opt = document.createElement('option');
            opt.value = pdf.id;
            opt.textContent = pdf.fileName;
            sel.appendChild(opt);
        });
        sel.onchange = () => { if (btn) btn.disabled = !sel.value; };
        if (btn) {
            btn.onclick = () => {
                if (!sel.value) return;
                const pdf = pdfs.find(p => p.id === sel.value);
                if (pdf) QV.reusePdf(pdf.id, pdf.fileName);
            };
        }
    }

    function renderModalSavedPdfs(pdfs) {
        const section = document.getElementById('modal-pdf-saved-section');
        const list = document.getElementById('modal-pdf-saved-list');
        if (!section || !list) return;
        if (!pdfs.length) {
            section.classList.add('hidden');
            return;
        }
        section.classList.remove('hidden');
        list.innerHTML = pdfs.map(pdf => `
            <div class="modal-saved-pdf-row">
                <span class="modal-saved-pdf-name">${escapeHtml(pdf.fileName)}</span>
                <button class="btn btn-sm modal-saved-pdf-btn" onclick="QV.reusePdf('${escapeHtml(pdf.id)}', '${escapeHtml(pdf.fileName)}'); QV.hideModal('modal-pdf-upload');">Reuse</button>
            </div>
        `).join('');
    }

    function renderSavedPdfs(pdfs) {
        $('pdf-count-badge').textContent = pdfs.length;
        populateHomePdfDropdown(pdfs);
        renderModalSavedPdfs(pdfs);

        const container = $('saved-pdfs-list');
        if (!pdfs.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.3; margin-bottom:1rem;">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <p>No saved PDFs yet.</p>
                    <p class="text-muted">Upload a file and choose to save it for later reuse.</p>
                </div>`;
            return;
        }

        container.innerHTML = pdfs.map(pdf => `
            <div class="saved-pdf-card glass-card" data-pdf-id="${escapeHtml(pdf.id)}">
                <div class="saved-pdf-icon">
                    ${pdf.mimeType === 'application/pdf'
                        ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
                        : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
                    }
                </div>
                <div class="saved-pdf-info">
                    <div class="saved-pdf-name">${escapeHtml(pdf.fileName)}</div>
                    <div class="saved-pdf-meta text-muted">
                        ${pdf.mimeType === 'application/pdf' ? `Pages ${pdf.pageFrom}-${pdf.pageTo} of ${pdf.totalPages}` : 'Image'}
                        &middot; ${formatSize(pdf.fileSize)}
                        &middot; ${formatDate(pdf.createdAt)}
                    </div>
                </div>
                <div class="saved-pdf-actions">
                    <button class="btn btn-sm" style="background: linear-gradient(135deg, #00b894, #00cec9);" onclick="QV.reusePdf('${escapeHtml(pdf.id)}', '${escapeHtml(pdf.fileName)}')">Reuse</button>
                    <button class="btn btn-ghost btn-sm btn-danger-text" onclick="QV.deletePdf('${escapeHtml(pdf.id)}')">Delete</button>
                </div>
            </div>
        `).join('');
    }

    // Expose for inline onclick
    QV.reusePdf = function (id, fileName) {
        reuseId = id;
        $('pdf-reuse-filename').textContent = fileName;
        showModal('modal-pdf-reuse');
    };

    QV.deletePdf = async function (id) {
        if (!confirm('Delete this saved PDF?')) return;
        try {
            const res = await fetch('/api/pdf/' + id, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${state.token}` },
            });
            if (res.ok) {
                toast('PDF deleted', 'success');
                loadSavedPdfs();
            } else {
                const data = await res.json();
                toast(data.error || 'Failed to delete', 'error');
            }
        } catch {
            toast('Failed to delete PDF', 'error');
        }
    };

    // ── Reuse PDF — Generate ─────────────────────────────────────
    $('btn-pdf-reuse-generate').addEventListener('click', async () => {
        if (!reuseId) return;

        const btn = $('btn-pdf-reuse-generate');
        const statusEl = $('pdf-reuse-status');
        btn.disabled = true;
        statusEl.classList.remove('hidden');
        statusEl.textContent = 'Generating questions from saved PDF...';

        try {
            const res = await fetch('/api/pdf/reuse/' + reuseId, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${state.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    questionCount: parseInt($('pdf-reuse-count').value) || 5,
                    userPrompt: $('pdf-reuse-prompt').value,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');

            const gameType = document.querySelector('input[name="pdf-reuse-game-type"]:checked').value;
            const rawReuseTime = parseInt($('pdf-reuse-time').value);
            const timeLimit = isNaN(rawReuseTime) ? 15 : rawReuseTime;
            const topic = data.fileInfo.fileName.replace(/\.[^.]+$/, '');

            if (gameType === 'solo') {
                socket.emit('pdf-solo-start', {
                    questions: data.questions,
                    timeLimit,
                    topic,
                });
                hideModal('modal-pdf-reuse');
                QV.clearGameState();
                showView('view-game');
                $('game-question-text').textContent = 'Starting PDF quiz...';

                // Safety: if no game-question arrives within 10s, bail out
                const pdfTimeout = setTimeout(() => {
                    if (!state.currentGameId) {
                        toast('Failed to start PDF quiz. Please try again.', 'error');
                        showView('view-dashboard');
                        showPanel('pdfmode');
                    }
                }, 10000);
                const clearPdfTimeout = () => { clearTimeout(pdfTimeout); socket.off('game-question', clearPdfTimeout); socket.off('game-error', onPdfError); };
                const onPdfError = (msg) => { clearTimeout(pdfTimeout); toast(typeof msg === 'string' ? msg : 'Failed to start PDF quiz', 'error'); showView('view-dashboard'); showPanel('pdfmode'); socket.off('game-question', clearPdfTimeout); };
                socket.once('game-error', onPdfError);
                socket.on('game-question', clearPdfTimeout);
            } else {
                const maxPlayers = parseInt($('pdf-reuse-max-players').value) || 2;
                const isPublic = $('pdf-reuse-lobby-public').checked;
                socket.emit('pdf-lobby-create', {
                    questions: data.questions,
                    timeLimit,
                    topic,
                    maxPlayers,
                    isPublic,
                });
                hideModal('modal-pdf-reuse');
                toast('Creating lobby with PDF questions...', 'info');
            }

            statusEl.classList.add('hidden');
        } catch (err) {
            toast(err.message || 'Failed to generate questions', 'error');
            statusEl.classList.add('hidden');
        } finally {
            btn.disabled = false;
        }
    });

    // ── Load PDFs when panel is shown ────────────────────────────
    // Hook into panel navigation
    const origShowPanel = QV.showPanel;
    QV.showPanel = function (panel) {
        origShowPanel(panel);
        if (panel === 'pdfmode') loadSavedPdfs();
    };

    // Initial load for home page dropdown
    if (state.token) loadSavedPdfs();

    // ── Helpers ──────────────────────────────────────────────────
    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatDate(ts) {
        return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
})();
