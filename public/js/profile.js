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

        // Profile frame from shop
        const avatarZone = $('profile-avatar-img') && $('profile-avatar-img').closest('.profile-avatar');
        if (avatarZone) {
            // Remove old frame classes
            avatarZone.className = avatarZone.className.replace(/avatar-frame-\S+/g, '').trim();
            if (u.activeFrame) avatarZone.classList.add('avatar-frame-' + u.activeFrame);
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

    // Profile bio character dropdown — sync with user state and lock diamond options
    const profileCharSelect = document.getElementById('profile-bio-character-select');
    function syncProfileCharSelect() {
        if (!profileCharSelect) return;
        const isDiamond = state.user && state.user.isDiamondPro;
        Array.from(profileCharSelect.options).forEach(opt => {
            if (opt.dataset.diamond === 'true' && !isDiamond) {
                opt.disabled = true;
                opt.textContent = opt.textContent.replace(/ 🔒$/, '') + ' 🔒';
            } else {
                opt.disabled = false;
                opt.textContent = opt.textContent.replace(/ 🔒$/, '');
            }
        });
        profileCharSelect.value = (state.user && state.user.bioCharacter) || 'default';
    }
    const origUpdateProfile = QV.updateProfile;
    QV.updateProfile = function () {
        origUpdateProfile();
        syncProfileCharSelect();
    };

    if (profileCharSelect) {
        profileCharSelect.addEventListener('change', async () => {
            const val = profileCharSelect.value;
            if (!state.user.isDiamondPro && val !== 'default') {
                profileCharSelect.value = state.user.bioCharacter || 'default';
                QV.showPanel('diamond');
                return;
            }
            try {
                await api('/profile/update-settings', { method: 'POST', body: { bioCharacter: val } });
                state.user.bioCharacter = val;
                // Sync settings page hidden input
                const settingsInput = document.getElementById('settings-bio-character');
                if (settingsInput) settingsInput.value = val;
                document.querySelectorAll('.bio-narrator-card').forEach(c => {
                    c.classList.toggle('active', c.dataset.value === val);
                });
                toast('Narrator updated!', 'success');
            } catch (err) {
                toast(err.message, 'error');
            }
        });
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
    // MATCH HISTORY (paginated)
    // ═══════════════════════════════════════════════════════════════
    let _mhPage = 1;
    const MH_LIMIT = 10;
    let _mhTotal = 0;

    QV.loadMatchHistory = async function loadMatchHistory() {
        _mhPage = 1;
        try {
            const data = await api(`/profile/match-history?page=1&limit=${MH_LIMIT}`);
            _mhTotal = data.total || 0;
            renderMatchHistory(data.matches || [], true);
        } catch (err) {
            console.error('Match history error:', err);
        }
    };

    async function loadMoreMatches() {
        _mhPage++;
        try {
            const data = await api(`/profile/match-history?page=${_mhPage}&limit=${MH_LIMIT}`);
            _mhTotal = data.total || 0;
            renderMatchHistory(data.matches || [], false);
        } catch (err) {
            console.error('Match history load more error:', err);
        }
    }

    function buildMatchDetail(m) {
        const qd = m.questionsDetail;
        const totalCorrect = qd.filter(q => q.wasCorrect).length;
        const accuracy = qd.length > 0 ? Math.round((totalCorrect / qd.length) * 100) : 0;
        const avgTime = qd.length > 0 ? (qd.reduce((s, q) => s + q.timeTaken, 0) / qd.length).toFixed(1) : '0';

        let html = `<div class="mh-detail-summary">
            <div class="mh-detail-stat"><div class="label">Correct</div><div class="value">${totalCorrect}/${qd.length}</div></div>
            <div class="mh-detail-stat"><div class="label">Accuracy</div><div class="value">${accuracy}%</div></div>
            <div class="mh-detail-stat"><div class="label">Avg Time</div><div class="value">${avgTime}s</div></div>
        </div>`;

        qd.forEach((q, idx) => {
            const optionsHtml = q.options.map((opt, oi) => {
                let cls = '';
                if (oi === q.correctIndex) cls = 'correct';
                else if (oi === q.playerAnswer && !q.wasCorrect) cls = 'wrong';
                const marker = oi === q.playerAnswer ? (q.wasCorrect && oi === q.correctIndex ? ' ✓' : oi !== q.correctIndex ? ' ✗' : '') : '';
                return `<div class="mh-q-option ${cls}">${escapeHtml(opt)}${marker}</div>`;
            }).join('');

            let oppHtml = '';
            if (q.opponentAnswers && q.opponentAnswers.length > 0) {
                oppHtml = q.opponentAnswers.map(oa => {
                    const icon = oa.wasCorrect ? '✓' : '✗';
                    const color = oa.wasCorrect ? '#22c55e' : '#ef4444';
                    return `<span style="color:${color}">${escapeHtml(oa.username)}: ${icon} (${oa.timeTaken.toFixed(1)}s)</span>`;
                }).join(' &nbsp; ');
                oppHtml = `<div class="mh-q-opp">${oppHtml}</div>`;
            }

            html += `<div class="mh-question-item">
                <div class="mh-q-header">
                    <span class="mh-q-num">Q${idx + 1}</span>
                    <span class="mh-q-text">${escapeHtml(q.questionText)}</span>
                </div>
                <div class="mh-q-answers">${optionsHtml}</div>
                <div class="mh-q-meta">
                    <span>${q.wasCorrect ? '✓ Correct' : '✗ Wrong'}</span>
                    <span>${q.timeTaken.toFixed(1)}s</span>
                    <span>+${q.points} pts</span>
                </div>
                ${oppHtml}
            </div>`;
        });

        return html;
    }

    function renderMatchHistory(matches, reset) {
        const list = $('match-history-list');

        if (reset && !matches.length) {
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

        if (reset) list.innerHTML = '';

        // Remove existing pagination controls before appending new rows
        const oldPag = list.querySelector('.mh-pagination');
        if (oldPag) oldPag.remove();

        matches.forEach(m => {
            const hasDetail = m.questionsDetail && m.questionsDetail.length > 0;
            const row = document.createElement('div');
            row.className = `mh-row mh-${m.result}${hasDetail ? ' mh-clickable' : ''}`;

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
                    <div class="mh-result-label ${m.result}">${resultLabel}${hasDetail ? ' <span class="mh-expand-icon">▼</span>' : ''}</div>
                    ${eloStr}
                    <div class="mh-date">${dateStr} ${timeStr}</div>
                </div>
            `;
            list.appendChild(row);

            if (hasDetail) {
                const detail = document.createElement('div');
                detail.className = 'mh-detail';
                detail.innerHTML = buildMatchDetail(m);
                list.appendChild(detail);

                row.addEventListener('click', () => {
                    const isOpen = detail.classList.toggle('open');
                    row.classList.toggle('mh-expanded', isOpen);
                });
            }
        });

        // Add pagination controls
        const shown = list.querySelectorAll('.mh-row').length;
        if (shown < _mhTotal) {
            const pag = document.createElement('div');
            pag.className = 'mh-pagination';
            pag.innerHTML = `
                <button class="btn btn-ghost btn-sm mh-load-more">Load More</button>
                <span class="mh-page-info">${shown} of ${_mhTotal}</span>
            `;
            pag.querySelector('.mh-load-more').addEventListener('click', loadMoreMatches);
            list.appendChild(pag);
        } else if (_mhTotal > MH_LIMIT) {
            const pag = document.createElement('div');
            pag.className = 'mh-pagination';
            pag.innerHTML = `<span class="mh-page-info">All ${_mhTotal} matches shown</span>`;
            list.appendChild(pag);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ELO HISTORY CHART (Canvas) — with time filters + tooltip
    // ═══════════════════════════════════════════════════════════════
    let _eloFullHistory = [];
    let _eloFilter = 'all';

    QV.loadEloHistory = async function loadEloHistory() {
        try {
            const data = await api('/profile/elo-history');
            _eloFullHistory = data.history || [];
            renderEloFilterBar();
            renderEloChart(filterEloHistory(_eloFullHistory, _eloFilter));
        } catch (err) {
            console.error('ELO history error:', err);
        }
    };

    function filterEloHistory(history, filter) {
        if (filter === 'all' || !history.length) return history;
        const now = Date.now();
        const cutoffs = { '1w': 7 * 86400000, '1m': 30 * 86400000, '3m': 90 * 86400000 };
        const cutoff = now - (cutoffs[filter] || 0);
        return history.filter(h => h.timestamp >= cutoff);
    }

    function renderEloFilterBar() {
        const section = $('elo-history-section');
        if (section.querySelector('.elo-filter-bar')) return; // already rendered

        const bar = document.createElement('div');
        bar.className = 'elo-filter-bar';
        const filters = [
            { key: '1w', label: '1 Week' },
            { key: '1m', label: '1 Month' },
            { key: '3m', label: '3 Months' },
            { key: 'all', label: 'All Time' },
        ];
        filters.forEach(f => {
            const btn = document.createElement('button');
            btn.className = 'elo-filter-btn' + (f.key === _eloFilter ? ' active' : '');
            btn.textContent = f.label;
            btn.dataset.filter = f.key;
            btn.addEventListener('click', () => {
                _eloFilter = f.key;
                bar.querySelectorAll('.elo-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === f.key));
                renderEloChart(filterEloHistory(_eloFullHistory, _eloFilter));
            });
            bar.appendChild(btn);
        });
        const header = section.querySelector('.section-header');
        header.after(bar);
    }

    // Tooltip element (shared)
    let _eloTooltip = null;
    function getEloTooltip() {
        if (!_eloTooltip) {
            _eloTooltip = document.createElement('div');
            _eloTooltip.className = 'elo-tooltip';
            document.body.appendChild(_eloTooltip);
        }
        return _eloTooltip;
    }

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

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const accentColor = isDark ? '#818cf8' : '#4F46E5';
        const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
        const labelColor = isDark ? '#888' : '#999';
        const dotStroke = isDark ? '#1e1e2e' : '#fff';

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = 220 * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = '220px';
        ctx.scale(dpr, dpr);

        const W = rect.width;
        const H = 220;
        const PAD = { top: 24, right: 24, bottom: 32, left: 50 };
        const cW = W - PAD.left - PAD.right;
        const cH = H - PAD.top - PAD.bottom;

        const elos = history.map(h => h.elo);
        const minElo = Math.min(...elos) - 25;
        const maxElo = Math.max(...elos) + 25;
        const eloRange = maxElo - minElo || 1;

        ctx.clearRect(0, 0, W, H);

        // Grid lines
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        const gridSteps = 4;
        for (let i = 0; i <= gridSteps; i++) {
            const y = PAD.top + (cH / gridSteps) * i;
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.moveTo(PAD.left, y);
            ctx.lineTo(W - PAD.right, y);
            ctx.stroke();
            ctx.setLineDash([]);

            const val = Math.round(maxElo - (eloRange / gridSteps) * i);
            ctx.fillStyle = labelColor;
            ctx.font = '11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(val, PAD.left - 8, y + 4);
        }

        // Compute pixel points
        const points = history.map((h, i) => ({
            x: PAD.left + (i / (history.length - 1)) * cW,
            y: PAD.top + cH - ((h.elo - minElo) / eloRange) * cH,
            elo: h.elo,
            ts: h.timestamp,
        }));

        // Smooth Bézier helper
        function drawSmoothLine(pts) {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            if (pts.length === 2) {
                ctx.lineTo(pts[1].x, pts[1].y);
            } else {
                for (let i = 1; i < pts.length; i++) {
                    const prev = pts[i - 1];
                    const cur = pts[i];
                    const cpx = (prev.x + cur.x) / 2;
                    ctx.bezierCurveTo(cpx, prev.y, cpx, cur.y, cur.x, cur.y);
                }
            }
        }

        // Gradient fill under curve
        const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
        grad.addColorStop(0, isDark ? 'rgba(129,140,248,0.22)' : 'rgba(79,70,229,0.18)');
        grad.addColorStop(1, 'rgba(79,70,229,0.01)');

        drawSmoothLine(points);
        ctx.lineTo(points[points.length - 1].x, H - PAD.bottom);
        ctx.lineTo(points[0].x, H - PAD.bottom);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Smooth line stroke
        drawSmoothLine(points);
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        // Dots (smaller for many points, larger for few)
        const dotR = points.length > 30 ? 2 : 3.5;
        points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
            ctx.fillStyle = accentColor;
            ctx.fill();
            ctx.strokeStyle = dotStroke;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        // Current ELO label at last point
        const last = points[points.length - 1];
        ctx.fillStyle = accentColor;
        ctx.font = 'bold 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(elos[elos.length - 1], last.x, last.y - 12);

        // X-axis labels (first and last date)
        ctx.fillStyle = labelColor;
        ctx.font = '10px Inter, system-ui, sans-serif';
        const fmtDate = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        ctx.textAlign = 'left';
        ctx.fillText(fmtDate(history[0].timestamp), PAD.left, H - 6);
        ctx.textAlign = 'right';
        ctx.fillText(fmtDate(history[history.length - 1].timestamp), W - PAD.right, H - 6);

        // ── Interactive tooltip on hover ──────────────────────────
        if (canvas._eloAC) canvas._eloAC.abort();
        const ac = new AbortController();
        canvas._eloAC = ac;

        canvas.addEventListener('mousemove', (e) => {
            const cRect = canvas.getBoundingClientRect();
            const mx = e.clientX - cRect.left;
            let closest = null, minDist = Infinity;
            for (const p of points) {
                const d = Math.abs(p.x - mx);
                if (d < minDist) { minDist = d; closest = p; }
            }
            if (closest && minDist < 30) {
                const tip = getEloTooltip();
                const dateStr = new Date(closest.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const timeStr = new Date(closest.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                tip.innerHTML = `<strong>${closest.elo}</strong><br>${dateStr} ${timeStr}`;
                tip.style.display = 'block';
                // Position tooltip above the point
                const tipX = e.pageX;
                const tipY = cRect.top + window.scrollY + closest.y / dpr - 50;
                tip.style.left = tipX + 'px';
                tip.style.top = tipY + 'px';
                canvas.style.cursor = 'crosshair';
            } else {
                getEloTooltip().style.display = 'none';
                canvas.style.cursor = 'default';
            }
        }, { signal: ac.signal });

        canvas.addEventListener('mouseleave', () => {
            getEloTooltip().style.display = 'none';
        }, { signal: ac.signal });
    }

    // ═══════════════════════════════════════════════════════════════
    // MINI PROFILE POPUP — quick peek, no match history
    // Clicking the header (or "View Full Profile") opens the full page.
    // ═══════════════════════════════════════════════════════════════
    let _miniCurrentUserId = null;
    let _miniCurrentUser = null;

    QV.openMiniProfile = async function openMiniProfile(userId) {
        if (!userId) return;
        _miniCurrentUserId = userId;
        _miniCurrentUser = null;

        // If we're clicking our own profile, go straight to the profile panel
        if (state.user && userId === state.user.id) {
            QV.showPanel('profile');
            return;
        }

        // Show modal immediately with a loading state so it feels snappy
        $('mini-profile-username-text').textContent = 'Loading...';
        $('mini-profile-rank-name').textContent = '—';
        $('mini-profile-elo').textContent = '—';
        $('mini-profile-bio').textContent = '';
        $('mini-stat-wins').textContent = '—';
        $('mini-stat-losses').textContent = '—';
        $('mini-stat-games').textContent = '—';
        $('mini-stat-accuracy').textContent = '—';
        $('btn-mini-add-friend').classList.add('hidden');
        $('btn-mini-challenge').classList.add('hidden');
        $('mini-profile-diamond-badge').innerHTML = '';
        showModal('modal-mini-profile');

        try {
            const data = await api(`/profile/${userId}`);
            const u = data.user;
            _miniCurrentUser = u;

            // Avatar
            const img = $('mini-profile-avatar-img');
            const letter = $('mini-profile-avatar-letter');
            if (u.photoURL) {
                img.src = u.photoURL;
                img.classList.remove('hidden');
                letter.style.display = 'none';
            } else {
                img.classList.add('hidden');
                letter.style.display = '';
                letter.textContent = (u.username || '?')[0].toUpperCase();
            }

            // Avatar frame
            const avatarZone = $('mini-profile-avatar');
            avatarZone.className = avatarZone.className.replace(/avatar-frame-\S+/g, '').trim();
            if (u.activeFrame) avatarZone.classList.add('avatar-frame-' + u.activeFrame);
            avatarZone.classList.toggle('diamond-pro-avatar', !!u.isDiamondPro);

            // Username + diamond badge
            $('mini-profile-username-text').textContent = u.username;
            $('mini-profile-diamond-badge').innerHTML = u.isDiamondPro ? QV.getDiamondProBadge(16) : '';

            // Rank + ELO
            const rankIcon = $('mini-profile-rank-icon');
            rankIcon.innerHTML = QV.getRankIcon(u.rank.name, 16);
            rankIcon.style.background = 'none';
            $('mini-profile-rank-name').textContent = u.rank.name;
            $('mini-profile-elo').textContent = u.elo;

            // Bio
            $('mini-profile-bio').textContent = u.bio || 'No bio yet.';

            // Stats
            $('mini-stat-wins').textContent = u.stats.totalWins || 0;
            $('mini-stat-losses').textContent = u.stats.totalLosses || 0;
            $('mini-stat-games').textContent = u.stats.gamesPlayed || 0;
            const acc = u.stats.totalAnswers > 0
                ? Math.round((u.stats.correctAnswers / u.stats.totalAnswers) * 100)
                : 0;
            $('mini-stat-accuracy').textContent = acc + '%';

            // Action buttons — hide on own profile or if already friends
            const addBtn = $('btn-mini-add-friend');
            const chalBtn = $('btn-mini-challenge');
            if (state.user && userId !== state.user.id) {
                const alreadyFriend = state.user.friends && state.user.friends.includes(userId);
                addBtn.classList.remove('hidden');
                addBtn.disabled = alreadyFriend;
                addBtn.textContent = alreadyFriend ? 'Friends ✓' : '+ Add Friend';
                // Challenge button only shown if we're friends (backend allows)
                if (alreadyFriend) {
                    chalBtn.classList.remove('hidden');
                } else {
                    chalBtn.classList.add('hidden');
                }
            } else {
                addBtn.classList.add('hidden');
                chalBtn.classList.add('hidden');
            }
        } catch (err) {
            toast('Could not load profile: ' + err.message, 'error');
            QV.hideModal('modal-mini-profile');
        }
    };

    // Make openUserProfile — the app-wide entry point — open the mini popup first.
    // A second click on the header (or the "View Full Profile" button) opens the
    // old full-page profile modal below.
    QV.openUserProfile = function openUserProfile(userId) {
        return QV.openMiniProfile(userId);
    };

    // Header / "View Full Profile" button → open the full profile
    function promoteMiniToFull() {
        if (!_miniCurrentUserId) return;
        const uid = _miniCurrentUserId;
        QV.hideModal('modal-mini-profile');
        QV.openFullUserProfile(uid);
    }

    const miniHeader = document.getElementById('mini-profile-header-link');
    if (miniHeader) miniHeader.addEventListener('click', promoteMiniToFull);
    const miniFullBtn = document.getElementById('btn-mini-view-full');
    if (miniFullBtn) miniFullBtn.addEventListener('click', promoteMiniToFull);

    // Add Friend from mini popup
    const miniAddFriend = document.getElementById('btn-mini-add-friend');
    if (miniAddFriend) miniAddFriend.addEventListener('click', async () => {
        if (!_miniCurrentUser) return;
        try {
            await api('/friends/request', { method: 'POST', body: { username: _miniCurrentUser.username } });
            toast('Friend request sent!', 'success');
            miniAddFriend.textContent = 'Sent ✓';
            miniAddFriend.disabled = true;
        } catch (err) {
            toast(err.message || 'Could not send request.', 'error');
        }
    });

    // Challenge from mini popup (delegates to existing send-challenge flow)
    const miniChallengeBtn = document.getElementById('btn-mini-challenge');
    if (miniChallengeBtn) miniChallengeBtn.addEventListener('click', () => {
        if (!_miniCurrentUserId || !_miniCurrentUser) return;
        const friendNameEl = document.getElementById('challenge-send-friend-name');
        if (friendNameEl) friendNameEl.textContent = _miniCurrentUser.username || '';
        const confirmBtn = document.getElementById('btn-send-challenge-confirm');
        if (confirmBtn) confirmBtn.dataset.friendId = _miniCurrentUserId;
        QV.hideModal('modal-mini-profile');
        QV.showModal('modal-send-challenge');
    });

    // ═══════════════════════════════════════════════════════════════
    // FULL PUBLIC PROFILE VIEWER (match history, ELO chart, etc.)
    // ═══════════════════════════════════════════════════════════════
    QV.openFullUserProfile = async function openFullUserProfile(userId) {
        QV._viewingProfileUserId = userId;
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

            // Show add-friend button (hide if own profile or already friends)
            const addFriendBtn = $('btn-modal-add-friend');
            if (addFriendBtn && state.user && userId !== state.user.id) {
                const alreadyFriend = state.user.friends && state.user.friends.includes(userId);
                addFriendBtn.classList.remove('hidden');
                addFriendBtn.disabled = alreadyFriend;
                addFriendBtn.textContent = alreadyFriend ? 'Friends ✓' : 'Add Friend';
            } else if (addFriendBtn) {
                addFriendBtn.classList.add('hidden');
            }

            showModal('modal-user-profile');

            // Load match history and ELO chart for this user
            loadModalMatchHistory(userId);
            loadModalEloChart(userId);
        } catch (err) {
            toast('Could not load profile: ' + err.message, 'error');
        }
    };

    // Clicking the profile header in the full profile modal scrolls to match history
    $('modal-profile-header-link').addEventListener('click', () => {
        const section = $('modal-match-history-section');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ── Public profile match history ──────────────────────────
    async function loadModalMatchHistory(userId) {
        const list = $('modal-match-history-list');
        list.innerHTML = '<p class="text-muted" style="text-align:center;padding:1rem;">Loading...</p>';
        try {
            const data = await api(`/profile/${userId}/match-history?page=1&limit=10`);
            const matches = data.matches || [];
            if (!matches.length) {
                list.innerHTML = '<p class="text-muted" style="text-align:center;padding:1rem;">No matches yet.</p>';
                return;
            }
            list.innerHTML = '';
            matches.forEach(m => {
                const hasDetail = m.questionsDetail && m.questionsDetail.length > 0;
                const row = document.createElement('div');
                row.className = `mh-row mh-${m.result}${hasDetail ? ' mh-clickable' : ''}`;
                const resultEmoji = m.result === 'win' ? '🏆' : m.result === 'loss' ? '💀' : '🤝';
                const resultLabel = m.result === 'win' ? 'Victory' : m.result === 'loss' ? 'Defeat' : 'Draw';
                const opponentName = m.opponents && m.opponents.length > 0 ? m.opponents.map(o => escapeHtml(o.username)).join(', ') : 'Unknown';
                const opponentScore = m.opponents && m.opponents.length === 1 ? m.opponents[0].score : '';
                const eloStr = m.eloChange
                    ? `<span class="mh-elo ${m.eloChange > 0 ? 'positive' : 'negative'}">${m.eloChange > 0 ? '+' : ''}${m.eloChange}</span>`
                    : '';
                const dateStr = new Date(m.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                row.innerHTML = `
                    <div class="mh-result-badge">${resultEmoji}</div>
                    <div class="mh-details">
                        <div class="mh-opponent">vs ${opponentName}</div>
                        <div class="mh-meta"><span class="mh-topic">${escapeHtml(m.topic || 'General')}</span><span class="mh-type">${m.type || 'quick'}</span></div>
                    </div>
                    <div class="mh-scores"><span class="mh-my-score">${m.myScore}</span>${opponentScore !== '' ? `<span class="mh-separator">-</span><span class="mh-opp-score">${opponentScore}</span>` : ''}</div>
                    <div class="mh-right">
                        <div class="mh-result-label ${m.result}">${resultLabel}${hasDetail ? ' <span class="mh-expand-icon">▼</span>' : ''}</div>
                        ${eloStr}
                        <div class="mh-date">${dateStr}</div>
                    </div>
                `;
                list.appendChild(row);

                if (hasDetail) {
                    const detail = document.createElement('div');
                    detail.className = 'mh-detail';
                    detail.innerHTML = buildMatchDetail(m);
                    list.appendChild(detail);
                    row.addEventListener('click', () => {
                        const isOpen = detail.classList.toggle('open');
                        row.classList.toggle('mh-expanded', isOpen);
                    });
                }
            });
        } catch (err) {
            list.innerHTML = '<p class="text-muted" style="text-align:center;padding:1rem;">Could not load match history.</p>';
        }
    }

    // ── Public profile ELO chart ──────────────────────────────
    async function loadModalEloChart(userId) {
        const canvas = $('modal-elo-chart');
        const emptyMsg = $('modal-elo-chart-empty');
        try {
            const data = await api(`/profile/${userId}/elo-history`);
            const history = data.history || [];
            if (!history.length || history.length < 2) {
                canvas.style.display = 'none';
                emptyMsg.classList.remove('hidden');
                return;
            }
            canvas.style.display = 'block';
            emptyMsg.classList.add('hidden');
            drawMiniEloChart(canvas, history);
        } catch (err) {
            canvas.style.display = 'none';
            emptyMsg.classList.remove('hidden');
        }
    }

    function drawMiniEloChart(canvas, history) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const accentColor = isDark ? '#818cf8' : '#4F46E5';
        const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
        const labelColor = isDark ? '#888' : '#999';
        const dotStroke = isDark ? '#1e1e2e' : '#fff';

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = 180 * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = '180px';
        ctx.scale(dpr, dpr);

        const W = rect.width, H = 180;
        const PAD = { top: 20, right: 20, bottom: 28, left: 45 };
        const cW = W - PAD.left - PAD.right;
        const cH = H - PAD.top - PAD.bottom;

        const elos = history.map(h => h.elo);
        const minElo = Math.min(...elos) - 20;
        const maxElo = Math.max(...elos) + 20;
        const eloRange = maxElo - minElo || 1;

        ctx.clearRect(0, 0, W, H);

        // Grid
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        for (let i = 0; i <= 3; i++) {
            const y = PAD.top + (cH / 3) * i;
            ctx.beginPath(); ctx.setLineDash([4, 4]);
            ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y);
            ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = labelColor;
            ctx.font = '10px Inter, system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxElo - (eloRange / 3) * i), PAD.left - 6, y + 4);
        }

        // Points
        const points = history.map((h, i) => ({
            x: PAD.left + (i / (history.length - 1)) * cW,
            y: PAD.top + cH - ((h.elo - minElo) / eloRange) * cH,
        }));

        // Fill
        const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
        grad.addColorStop(0, isDark ? 'rgba(129,140,248,0.2)' : 'rgba(79,70,229,0.15)');
        grad.addColorStop(1, 'rgba(79,70,229,0.01)');
        ctx.beginPath(); ctx.moveTo(points[0].x, H - PAD.bottom);
        points.forEach((p, i) => {
            if (i === 0) { ctx.lineTo(p.x, p.y); return; }
            const cpx = (points[i - 1].x + p.x) / 2;
            ctx.bezierCurveTo(cpx, points[i - 1].y, cpx, p.y, p.x, p.y);
        });
        ctx.lineTo(points[points.length - 1].x, H - PAD.bottom);
        ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

        // Line
        ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            const cpx = (points[i - 1].x + points[i].x) / 2;
            ctx.bezierCurveTo(cpx, points[i - 1].y, cpx, points[i].y, points[i].x, points[i].y);
        }
        ctx.strokeStyle = accentColor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();

        // Dots
        const dotR = points.length > 25 ? 1.5 : 3;
        points.forEach(p => {
            ctx.beginPath(); ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
            ctx.fillStyle = accentColor; ctx.fill();
            ctx.strokeStyle = dotStroke; ctx.lineWidth = 1; ctx.stroke();
        });

        // Last ELO label
        const last = points[points.length - 1];
        ctx.fillStyle = accentColor; ctx.font = 'bold 11px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(elos[elos.length - 1], last.x, last.y - 8);

        // X-axis dates
        ctx.fillStyle = labelColor; ctx.font = '9px Inter, system-ui, sans-serif';
        const fmtD = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        ctx.textAlign = 'left'; ctx.fillText(fmtD(history[0].timestamp), PAD.left, H - 4);
        ctx.textAlign = 'right'; ctx.fillText(fmtD(history[history.length - 1].timestamp), W - PAD.right, H - 4);
    }

    // ═══════════════════════════════════════════════════════════════
    // LEADERBOARD
    // ═══════════════════════════════════════════════════════════════
    let _lbMode = 'global';

    QV.loadLeaderboard = async function loadLeaderboard(mode) {
        if (mode) _lbMode = mode;
        // Sync toggle buttons
        document.querySelectorAll('.lb-toggle-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === _lbMode);
        });
        try {
            const url = _lbMode === 'friends' ? '/leaderboard?friends=true' : '/leaderboard';
            const data = await api(url);
            const table = $('leaderboard-table');

            if (data.leaderboard.length === 0) {
                table.innerHTML = _lbMode === 'friends'
                    ? `<div class="empty-state"><p>No friends ranked yet. Add some friends first!</p></div>`
                    : `<div class="empty-state"><p>No players ranked yet. Be the first!</p></div>`;
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

    // Leaderboard toggle click handler
    document.querySelectorAll('.lb-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            QV.loadLeaderboard(btn.dataset.mode);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // SETTINGS
    // ═══════════════════════════════════════════════════════════════
    let settingsAvatarData = null; // null = unchanged, '' = removed, string = new photo

    QV.loadSettings = function loadSettings() {
        if (!state.user) return;
        $('settings-username').value = state.user.username;
        settingsAvatarData = null;


        // Sync theme selector cards with current theme
        const currentTheme = localStorage.getItem('quizio_theme') || 'default';
        document.querySelectorAll('#theme-selector-grid .theme-card').forEach(card => {
            card.classList.toggle('active', card.dataset.theme === currentTheme);
        });


        // Bio narrator card grid — visible to all, locked for non-Diamond
        const charInput = document.getElementById('settings-bio-character');
        const charLock = document.getElementById('bio-char-lock');
        const charHint = document.getElementById('bio-char-hint');
        const bioGrid = document.getElementById('bio-char-grid');
        if (bioGrid && charInput) {
            const currentChar = state.user.bioCharacter || 'default';
            charInput.value = currentChar;
            // Sync active state on all cards
            bioGrid.querySelectorAll('.bio-narrator-card').forEach(card => {
                card.classList.toggle('active', card.dataset.value === currentChar);
            });
            if (state.user.isDiamondPro) {
                if (charLock) charLock.style.display = 'none';
                if (charHint) charHint.style.display = 'none';
                bioGrid.querySelectorAll('.bnc-lock-badge').forEach(b => b.style.display = 'none');
                bioGrid.querySelectorAll('.bio-narrator-card[data-diamond]').forEach(c => c.classList.remove('bio-narrator-locked'));
            } else {
                if (charLock) charLock.style.display = 'none'; // badge shown per-card instead
                if (charHint) charHint.style.display = '';
                bioGrid.querySelectorAll('.bio-narrator-card[data-diamond]').forEach(c => c.classList.add('bio-narrator-locked'));
            }
        }

        // Update Diamond panel CTA state
        const ctaArea = document.getElementById('diamond-cta-area');
        const activeBadge = document.getElementById('diamond-active-badge');
        const manageArea = document.getElementById('diamond-manage-area');
        if (state.user.isDiamondPro) {
            if (ctaArea) ctaArea.style.display = 'none';
            if (activeBadge) activeBadge.classList.remove('hidden');
            if (manageArea) manageArea.classList.remove('hidden');
            // Fetch and show subscription details
            QV.refreshDiamondStatus();
        } else {
            if (ctaArea) ctaArea.style.display = '';
            if (activeBadge) activeBadge.classList.add('hidden');
            if (manageArea) manageArea.classList.add('hidden');
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


    // Bio narrator card clicks
    document.getElementById('bio-char-grid').addEventListener('click', (e) => {
        const card = e.target.closest('.bio-narrator-card');
        if (!card) return;
        const isDiamond = card.dataset.diamond === 'true';
        if (isDiamond && !state.user.isDiamondPro) {
            QV.showPanel('diamond');
            return;
        }
        document.getElementById('settings-bio-character').value = card.dataset.value;
        document.querySelectorAll('.bio-narrator-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
    });

    // Theme selector card clicks
    document.getElementById('theme-selector-grid').addEventListener('click', (e) => {
        const card = e.target.closest('.theme-card');
        if (!card) return;
        const theme = card.dataset.theme;
        // Apply theme to DOM
        if (theme === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
        // Save to localStorage
        localStorage.setItem('quizio_theme', theme);
        // Sync active states
        document.querySelectorAll('#theme-selector-grid .theme-card').forEach(c => {
            c.classList.toggle('active', c.dataset.theme === theme);
        });
        toast('Theme updated!', 'success');
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
        const charInput = document.getElementById('settings-bio-character');
        if (charInput && state.user.isDiamondPro) {
            body.bioCharacter = charInput.value;
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
                    state.user.diamondExpiresAt = data.diamondExpiresAt;
                    QV.updateNavUser();
                    QV.updateProfile();
                    QV.loadSettings();
                    QV.showPanel('diamond');
                    toast('🎉 Welcome to Diamond Pro! Your monthly subscription is active.', 'success');
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
