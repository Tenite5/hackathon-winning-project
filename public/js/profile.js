/**
 * @file public/js/profile.js
 * @description Profile panel, public profile modal, leaderboard.
 */

(function () {
    'use strict';
    const { $, state, socket, showModal, toast, escapeHtml, getRankColor, api } = QV;

    // ═══════════════════════════════════════════════════════════════
    // OWN PROFILE
    // ═══════════════════════════════════════════════════════════════
    QV.updateProfile = function updateProfile() {
        if (!state.user) return;
        const u = state.user;

        // Show PFP or letter fallback
        const img = $('profile-avatar-img');
        const letter = $('profile-avatar-letter');
        if (u.photoURL) {
            img.src = u.photoURL;
            img.classList.remove('hidden');
            letter.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            letter.classList.remove('hidden');
            letter.textContent = u.username[0].toUpperCase();
        }

        $('profile-username').textContent = u.username;
        $('profile-rank-icon').innerHTML = QV.getRankIcon(u.rank.name, 18);
        $('profile-rank-icon').style.background = 'none';
        $('profile-rank-name').textContent = u.rank.name;
        $('profile-elo-value').textContent = u.elo;
        $('profile-bio-text').textContent = u.bio || 'No bio yet.';

        // Diamond Pro badge & animated border
        const avatarZone = $('profile-avatar-img') && $('profile-avatar-img').closest('.profile-avatar-wrap');
        if (avatarZone) {
            avatarZone.classList.toggle('diamond-pro-avatar', !!u.isDiamondPro);
        }
        const diamondBadgeEl = document.getElementById('profile-diamond-badge');
        if (diamondBadgeEl) {
            diamondBadgeEl.innerHTML = u.isDiamondPro ? QV.getDiamondProBadge(18) : '';
            diamondBadgeEl.style.display = u.isDiamondPro ? 'inline-flex' : 'none';
        }

        $('stat-wins').textContent = u.stats.totalWins || 0;
        $('stat-losses').textContent = u.stats.totalLosses || 0;
        $('stat-games').textContent = u.stats.gamesPlayed || 0;
        const acc = u.stats.totalAnswers > 0
            ? Math.round((u.stats.correctAnswers / u.stats.totalAnswers) * 100)
            : 0;
        $('stat-accuracy').textContent = acc + '%';

        // Load history datasets
        QV.loadMatchHistory();
        QV.loadEloHistory();
    };

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
    // MATCH HISTORY
    // ═══════════════════════════════════════════════════════════════
    QV.loadMatchHistory = async function loadMatchHistory() {
        try {
            const data = await api('/profile/match-history');
            renderMatchHistory(data.matches || []);
        } catch (err) {
            console.error('Match history error:', err);
        }
    };

    function renderMatchHistory(matches) {
        const list = $('match-history-list');
        if (!matches.length) {
            list.innerHTML = `
                <div class="match-history-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <line x1="3" y1="9" x2="21" y2="9"/>
                        <line x1="9" y1="21" x2="9" y2="9"/>
                    </svg>
                    <p>No matches played yet. Start your first game!</p>
                </div>
            `;
            return;
        }

        list.innerHTML = '';
        matches.forEach(m => {
            const row = document.createElement('div');
            row.className = `mh-row mh-${m.result}`;

            const resultEmoji = m.result === 'win' ? '🏆' : m.result === 'loss' ? '💀' : '🤝';
            const resultLabel = m.result === 'win' ? 'Victory' : m.result === 'loss' ? 'Defeat' : 'Draw';
            const opponentName = m.opponents.length > 0 ? m.opponents.map(o => escapeHtml(o.username)).join(', ') : 'Unknown';
            const opponentScore = m.opponents.length === 1 ? m.opponents[0].score : '';

            const eloStr = m.eloChange
                ? `<span class="mh-elo ${m.eloChange > 0 ? 'positive' : 'negative'}">${m.eloChange > 0 ? '+' : ''}${m.eloChange}</span>`
                : '';

            const dateStr = new Date(m.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeStr = new Date(m.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            row.innerHTML = `
                <div class="mh-result-badge">${resultEmoji}</div>
                <div class="mh-details">
                    <div class="mh-opponent">vs ${opponentName}</div>
                    <div class="mh-meta">
                        <span class="mh-topic">${escapeHtml(m.topic || 'General')}</span>
                        <span class="mh-type">${m.type || 'quick'}</span>
                    </div>
                </div>
                <div class="mh-scores">
                    <span class="mh-my-score">${m.myScore}</span>
                    ${opponentScore !== '' ? `<span class="mh-separator">-</span><span class="mh-opp-score">${opponentScore}</span>` : ''}
                </div>
                <div class="mh-right">
                    <div class="mh-result-label ${m.result}">${resultLabel}</div>
                    ${eloStr}
                    <div class="mh-date">${dateStr} ${timeStr}</div>
                </div>
            `;
            list.appendChild(row);
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // ELO HISTORY CHART (Canvas)
    // ═══════════════════════════════════════════════════════════════
    QV.loadEloHistory = async function loadEloHistory() {
        try {
            const data = await api('/profile/elo-history');
            renderEloChart(data.history || []);
        } catch (err) {
            console.error('ELO history error:', err);
        }
    };

    function renderEloChart(history) {
        const canvas = $('elo-chart');
        const emptyMsg = $('elo-chart-empty');

        if (!history.length || history.length < 2) {
            canvas.style.display = 'none';
            emptyMsg.classList.remove('hidden');
            return;
        }

        canvas.style.display = 'block';
        emptyMsg.classList.add('hidden');

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        // Make canvas sharp on high-DPI
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = 200 * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = '200px';
        ctx.scale(dpr, dpr);

        const W = rect.width;
        const H = 200;
        const PAD = { top: 20, right: 20, bottom: 30, left: 50 };
        const cW = W - PAD.left - PAD.right;
        const cH = H - PAD.top - PAD.bottom;

        const elos = history.map(h => h.elo);
        const minElo = Math.min(...elos) - 20;
        const maxElo = Math.max(...elos) + 20;
        const eloRange = maxElo - minElo || 1;

        ctx.clearRect(0, 0, W, H);

        // Background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.fillRect(0, 0, W, H);

        // Grid lines
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.lineWidth = 1;
        const gridSteps = 4;
        for (let i = 0; i <= gridSteps; i++) {
            const y = PAD.top + (cH / gridSteps) * i;
            ctx.beginPath();
            ctx.moveTo(PAD.left, y);
            ctx.lineTo(W - PAD.right, y);
            ctx.stroke();

            // Y-axis labels
            const val = Math.round(maxElo - (eloRange / gridSteps) * i);
            ctx.fillStyle = '#999';
            ctx.font = '11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(val, PAD.left - 8, y + 4);
        }

        // Plot line
        const points = history.map((h, i) => ({
            x: PAD.left + (i / (history.length - 1)) * cW,
            y: PAD.top + cH - ((h.elo - minElo) / eloRange) * cH,
        }));

        // Gradient fill under line
        const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
        grad.addColorStop(0, 'rgba(79, 70, 229, 0.25)');
        grad.addColorStop(1, 'rgba(79, 70, 229, 0.02)');

        ctx.beginPath();
        ctx.moveTo(points[0].x, H - PAD.bottom);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, H - PAD.bottom);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = '#4F46E5';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        // Dots
        points.forEach((p, i) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#4F46E5';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        // Current ELO label at last point
        const last = points[points.length - 1];
        ctx.fillStyle = '#4F46E5';
        ctx.font = 'bold 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(elos[elos.length - 1], last.x, last.y - 10);

        // X-axis labels (first and last date)
        ctx.fillStyle = '#999';
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(
            new Date(history[0].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            PAD.left, H - 6
        );
        ctx.textAlign = 'right';
        ctx.fillText(
            new Date(history[history.length - 1].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            W - PAD.right, H - 6
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // PUBLIC PROFILE VIEWER
    // ═══════════════════════════════════════════════════════════════
    QV.openUserProfile = async function openUserProfile(userId) {
        try {
            const data = await api(`/profile/${userId}`);
            const u = data.user;

            // Show PFP or letter fallback in modal
            const img = $('modal-profile-avatar-img');
            const letter = $('modal-profile-avatar-letter');
            if (u.photoURL) {
                img.src = u.photoURL;
                img.classList.remove('hidden');
                letter.classList.add('hidden');
            } else {
                img.classList.add('hidden');
                letter.classList.remove('hidden');
                letter.textContent = u.username[0].toUpperCase();
            }

            $('modal-profile-username').textContent = u.username;
            $('modal-profile-rank-icon').innerHTML = QV.getRankIcon(u.rank.name, 18);
            $('modal-profile-rank-icon').style.background = 'none';
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
    };

    // ═══════════════════════════════════════════════════════════════
    // LEADERBOARD
    // ═══════════════════════════════════════════════════════════════
    QV.loadLeaderboard = async function loadLeaderboard() {
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
                const avatarContent = user.photoURL
                    ? `<img src="${escapeHtml(user.photoURL)}" class="lb-avatar-img" alt="" />`
                    : `${user.username[0].toUpperCase()}`;
                row.innerHTML = `
                    <span class="lb-rank ${rankClass}">${idx + 1}</span>
                    <div class="lb-user">
                        <div class="lb-avatar" style="background: ${getRankColor(user.elo)}">${avatarContent}</div>
                        <span class="lb-username">${escapeHtml(user.username)}${user.isDiamondPro ? ' ' + QV.getDiamondProBadge(13) : ''}</span>
                    </div>
                    <span class="lb-elo">${user.elo}</span>
                    <span class="lb-badge" style="background: ${user.rank.color}20; color: ${user.rank.color}">${QV.getRankIcon(user.rank.name, 14)} ${user.rank.name}</span>
                `;
                row.addEventListener('click', () => QV.openUserProfile(user.id));
                table.appendChild(row);
            });
        } catch (err) {
            console.error('Leaderboard error:', err);
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // SETTINGS
    // ═══════════════════════════════════════════════════════════════
    let settingsAvatarData = null; // null = unchanged, '' = removed, string = new photo

    QV.loadSettings = function loadSettings() {
        if (!state.user) return;
        $('settings-username').value = state.user.username;
        settingsAvatarData = null;

        // Bio character selector — enable only for Diamond Pro
        const charSelect = document.getElementById('settings-bio-character');
        const charLock = document.getElementById('bio-char-lock');
        const charHint = document.getElementById('bio-char-hint');
        if (charSelect) {
            charSelect.disabled = !state.user.isDiamondPro;
            if (state.user.isDiamondPro) {
                charSelect.value = state.user.bioCharacter || 'default';
                if (charLock) charLock.style.display = 'none';
                if (charHint) charHint.style.display = 'none';
            } else {
                if (charLock) charLock.style.display = 'inline-flex';
                if (charHint) charHint.style.display = '';
            }
        }

        // Update Diamond panel CTA state
        const ctaArea = document.getElementById('diamond-cta-area');
        const activeBadge = document.getElementById('diamond-active-badge');
        if (state.user.isDiamondPro) {
            if (ctaArea) ctaArea.style.display = 'none';
            if (activeBadge) activeBadge.classList.remove('hidden');
        } else {
            if (ctaArea) ctaArea.style.display = '';
            if (activeBadge) activeBadge.classList.add('hidden');
        }
        const img = $('settings-avatar-img');
        const zone = $('settings-avatar-zone');
        if (state.user.photoURL) {
            img.src = state.user.photoURL;
            img.style.display = 'block';
            zone.classList.add('has-avatar');
        } else {
            img.src = '';
            img.style.display = 'none';
            zone.classList.remove('has-avatar');
        }
        $('settings-error').classList.add('hidden');
        $('settings-status').classList.add('hidden');
    };

    // Process avatar file for settings (reuse resize logic)
    function processSettingsAvatar(file) {
        if (!file || !file.type.startsWith('image/')) {
            showSettingsError('Please select an image file.');
            return;
        }
        if (file.size > 4 * 1024 * 1024) {
            showSettingsError('Image too large. Max 4 MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const size = 200;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                const min = Math.min(img.width, img.height);
                const sx = (img.width - min) / 2;
                const sy = (img.height - min) / 2;
                ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
                settingsAvatarData = canvas.toDataURL('image/jpeg', 0.85);
                const preview = $('settings-avatar-img');
                preview.src = settingsAvatarData;
                preview.style.display = 'block';
                $('settings-avatar-zone').classList.add('has-avatar');
                $('settings-error').classList.add('hidden');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function showSettingsError(msg) {
        const el = $('settings-error');
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    // Click to select file
    $('settings-avatar-zone').addEventListener('click', () => {
        $('settings-avatar-file').click();
    });
    $('settings-avatar-file').addEventListener('change', (e) => {
        if (e.target.files[0]) processSettingsAvatar(e.target.files[0]);
    });

    // Drag & drop
    const settingsDropZone = $('settings-avatar-zone');
    settingsDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        settingsDropZone.classList.add('drag-over');
    });
    settingsDropZone.addEventListener('dragleave', () => {
        settingsDropZone.classList.remove('drag-over');
    });
    settingsDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        settingsDropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) processSettingsAvatar(file);
    });

    // Paste image in settings
    document.addEventListener('paste', (e) => {
        if (state.currentPanel !== 'settings') return;
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                processSettingsAvatar(item.getAsFile());
                return;
            }
        }
    });

    // Remove avatar
    $('btn-remove-avatar').addEventListener('click', () => {
        settingsAvatarData = '';
        const img = $('settings-avatar-img');
        img.src = '';
        img.style.display = 'none';
        $('settings-avatar-zone').classList.remove('has-avatar');
    });

    // Save settings
    $('btn-save-settings').addEventListener('click', async () => {
        $('settings-error').classList.add('hidden');
        $('settings-status').classList.add('hidden');

        const username = $('settings-username').value.trim();
        if (!username || username.length < 2) {
            showSettingsError('Name must be at least 2 characters.');
            return;
        }

        const body = { username };
        if (settingsAvatarData !== null) {
            body.photoURL = settingsAvatarData;
        }
        const charSelect = document.getElementById('settings-bio-character');
        if (charSelect && state.user.isDiamondPro) {
            body.bioCharacter = charSelect.value;
        }

        try {
            $('btn-save-settings').disabled = true;
            const data = await api('/profile/update-settings', {
                method: 'POST',
                body,
            });
            state.user = data.user;
            QV.updateNavUser();
            QV.updateProfile();
            settingsAvatarData = null;

            const status = $('settings-status');
            status.textContent = '✓ Saved!';
            status.classList.remove('hidden');
            setTimeout(() => status.classList.add('hidden'), 3000);

            toast('Settings saved!', 'success');
        } catch (err) {
            showSettingsError(err.message);
        }
        $('btn-save-settings').disabled = false;
    });

    // Check if returning from Diamond checkout with an error
    if (window.location.search.includes('diamond=error')) {
        history.replaceState({}, '', window.location.pathname);
        QV.showPanel('diamond');
        toast('Payment was not completed. Please try again.', 'error');
    }

    // Check if returning from Diamond checkout
    if (window.location.search.includes('diamond=activated')) {
        // Remove query param from URL without reload
        history.replaceState({}, '', window.location.pathname);
        // Re-fetch subscription status after a short delay (webhook may still be processing)
        setTimeout(async () => {
            try {
                const data = await fetch('/api/subscription/status', {
                    headers: { 'Authorization': `Bearer ${state.token}` }
                }).then(r => r.json());
                if (data.isDiamondPro && state.user) {
                    state.user.isDiamondPro = true;
                    state.user.diamondSince = data.diamondSince;
                    QV.updateNavUser();
                    QV.updateProfile();
                    QV.loadSettings();
                    QV.showPanel('diamond');
                    toast('🎉 Welcome to Diamond Pro! Your subscription is active.', 'success');
                } else {
                    QV.showPanel('diamond');
                    toast('Payment received! Your Diamond Pro status will activate shortly.', 'info');
                }
            } catch (e) {
                QV.showPanel('diamond');
            }
        }, 1500);
    }
})();
