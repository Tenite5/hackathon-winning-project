/**
 * @file public/js/api.js
 * @description Shared namespace, state, socket, and utility functions for the QVIZIO frontend.
 * Must be loaded FIRST among all JS files.
 */

// Global namespace
window.QV = window.QV || {};

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────────
    QV.state = {
        token: localStorage.getItem('qvizio_token') || null,
        user: null,
        currentGameId: null,
        currentLobbyId: null,
        currentView: 'auth',
        currentPanel: 'home',
        gameTimerInterval: null,
        _timerRafId: null,
        gameTimeLeft: 0,
        gameTimeLimit: 10,
        dmFriendId: null,
        lastGameData: null,
        isStartingGame: false,
        leavingGame: false,
        currentQuestionId: null,
        pendingChallengeToId: null,
    };

    // ── Socket ─────────────────────────────────────────────────
    QV.socket = io();

    // ── DOM helpers ────────────────────────────────────────────
    QV.$ = function (id) { return document.getElementById(id); };
    QV.$$ = function (sel) { return document.querySelectorAll(sel); };

    // ── API helper (with auto-retry on 429) ─────────────────
    QV.api = async function (path, options = {}) {
        const maxRetries = 3;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const headers = { 'Content-Type': 'application/json' };
            if (QV.state.token) headers['Authorization'] = `Bearer ${QV.state.token}`;
            const res = await fetch(`/api${path}`, {
                ...options,
                headers: { ...headers, ...(options.headers || {}) },
                body: options.body ? JSON.stringify(options.body) : undefined,
            });

            if (res.status === 429 && attempt < maxRetries) {
                // Rate limited — wait and retry
                const wait = Math.min((attempt + 1) * 1500, 5000);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Request failed');
            return data;
        }
    };

    // ── Utility functions ──────────────────────────────────────
    QV.escapeHtml = function (str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    QV.formatTime = function (ts) {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    QV.getRankColor = function (elo) {
        if (elo >= 2000) return '#e74c3c';
        if (elo >= 1800) return '#9b59b6';
        if (elo >= 1600) return '#b9f2ff';
        if (elo >= 1400) return '#e5e4e2';
        if (elo >= 1200) return '#ffd700';
        if (elo >= 1000) return '#c0c0c0';
        return '#cd7f32';
    };

    /** Return an inline SVG string for the given rank name */
    QV.getRankIcon = function (rankName, size) {
        size = size || 18;
        const icons = {
            'Bronze': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="#cd7f32" opacity="0.2"/>
                <circle cx="12" cy="12" r="7" fill="#cd7f32" opacity="0.4"/>
                <path d="M12 6l1.5 3.5L17 10l-2.5 2.5.5 3.5L12 14.5 9 16l.5-3.5L7 10l3.5-.5z" fill="#cd7f32"/>
            </svg>`,
            'Silver': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="#c0c0c0" opacity="0.2"/>
                <circle cx="12" cy="12" r="7" fill="#c0c0c0" opacity="0.4"/>
                <path d="M12 6l1.5 3.5L17 10l-2.5 2.5.5 3.5L12 14.5 9 16l.5-3.5L7 10l3.5-.5z" fill="#c0c0c0"/>
            </svg>`,
            'Gold': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="#ffd700" opacity="0.15"/>
                <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4l-6.4 4.8 2.4-7.2-6-4.8h7.6z" fill="#ffd700" stroke="#e6c200" stroke-width="0.5"/>
            </svg>`,
            'Platinum': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs><linearGradient id="plat-g" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stop-color="#e5e4e2"/><stop offset="100%" stop-color="#b8b8b8"/></linearGradient></defs>
                <circle cx="12" cy="12" r="10" fill="url(#plat-g)" opacity="0.2"/>
                <path d="M12 2l3 6.5h7l-5.5 4.5 2 7L12 15.5 5.5 20l2-7L2 8.5h7z" fill="url(#plat-g)" stroke="#b8b8b8" stroke-width="0.5"/>
                <circle cx="12" cy="11" r="2" fill="#e5e4e2" opacity="0.6"/>
            </svg>`,
            'Diamond': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs><linearGradient id="dia-g" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stop-color="#b9f2ff"/><stop offset="50%" stop-color="#00d4ff"/><stop offset="100%" stop-color="#b9f2ff"/></linearGradient></defs>
                <path d="M12 2L4 9l8 13 8-13z" fill="url(#dia-g)" opacity="0.3"/>
                <path d="M12 2L4 9l8 13 8-13z" fill="none" stroke="url(#dia-g)" stroke-width="1.5"/>
                <path d="M4 9h16M12 2l-3 7m3-7l3 7" stroke="#00d4ff" stroke-width="0.7" opacity="0.6"/>
            </svg>`,
            'Master': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs><linearGradient id="mas-g" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stop-color="#9b59b6"/><stop offset="100%" stop-color="#6c3483"/></linearGradient></defs>
                <circle cx="12" cy="12" r="10" fill="url(#mas-g)" opacity="0.15"/>
                <path d="M5 18l3-10 4 6 4-6 3 10" stroke="url(#mas-g)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                <path d="M12 2l1 4-1 1-1-1z" fill="#9b59b6"/>
                <circle cx="12" cy="8" r="1.5" fill="#9b59b6" opacity="0.7"/>
            </svg>`,
            'Grandmaster': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs><linearGradient id="gm-g" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stop-color="#e74c3c"/><stop offset="50%" stop-color="#ff6b6b"/><stop offset="100%" stop-color="#e74c3c"/></linearGradient></defs>
                <circle cx="12" cy="12" r="11" fill="url(#gm-g)" opacity="0.12"/>
                <path d="M12 3l-2 5H4l4.5 3.5L7 18l5-3.5L17 18l-1.5-6.5L20 8h-6z" fill="url(#gm-g)" stroke="#c0392b" stroke-width="0.5"/>
                <circle cx="12" cy="10" r="2" fill="#fff" opacity="0.3"/>
                <path d="M8 2.5l1 2M16 2.5l-1 2M12 1v2" stroke="#e74c3c" stroke-width="1" stroke-linecap="round" opacity="0.7"/>
            </svg>`,
        };
        return icons[rankName] || icons['Bronze'];
    };

    // ── Answer deobfuscation (matches server XOR key) ──────────
    const _OBF_KEY = 'QvZ!0_s3cR3t';
    QV.deobfuscate = function (encoded) {
        try {
            const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
            const key = new TextEncoder().encode(_OBF_KEY);
            const result = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) {
                result[i] = bytes[i] ^ key[i % key.length];
            }
            return new TextDecoder().decode(result);
        } catch { return encoded; }
    };

    // ── View / Panel / Modal / Toast ───────────────────────────
    QV.showView = function (viewId) {
        QV.$$('.view').forEach(v => v.classList.remove('active'));
        QV.$(viewId).classList.add('active');
        QV.state.currentView = viewId;
        const mobileNav = QV.$('mobile-nav');
        if (mobileNav) {
            mobileNav.style.display = (viewId === 'view-dashboard') ? '' : 'none';
        }
    };

    QV.showPanel = function (panelId) {
        QV.$$('.panel').forEach(p => p.classList.remove('active'));
        QV.$(`panel-${panelId}`).classList.add('active');
        QV.$$('.sidebar-btn').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.sidebar-btn[data-panel="${panelId}"]`);
        if (btn) btn.classList.add('active');
        QV.$$('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
        const mobileBtn = document.querySelector(`.mobile-nav-btn[data-panel="${panelId}"]`);
        if (mobileBtn) mobileBtn.classList.add('active');
        QV.state.currentPanel = panelId;
    };

    QV.showModal = function (id) { QV.$(id).classList.remove('hidden'); };
    QV.hideModal = function (id) { QV.$(id).classList.add('hidden'); };

    QV.toast = function (message, type = 'info') {
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = message;
        QV.$('toast-container').appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
    };

    /** Chess.com-style filled diamond badge for Diamond Pro subscribers */
    QV.getDiamondProBadge = function (size) {
        size = size || 16;
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" class="diamond-pro-badge-icon" title="Diamond Pro">
            <polygon points="12 2 22 9 18 21 6 21 2 9" fill="url(#dpbGrad${size})" stroke="none"/>
            <polygon points="12 2 22 9 12 7" fill="rgba(255,255,255,0.28)" stroke="none"/>
            <defs>
              <linearGradient id="dpbGrad${size}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#a855f7"/>
                <stop offset="50%" stop-color="#ec4899"/>
                <stop offset="100%" stop-color="#fbbf24"/>
              </linearGradient>
            </defs>
          </svg>`;
    };

    /** Returns true if the current user is a Diamond Pro subscriber */
    QV.isDiamondPro = function () {
        return !!(QV.state.user && QV.state.user.isDiamondPro);
    };

    /** Navigate to Diamond panel (used by lock icons) */
    QV.showDiamondPanel = function () {
        QV.showPanel('diamond');
    };

    /** Kick off a Diamond Pro checkout via PayPal or BOG */
    QV.startDiamondCheckout = async function (method) {
        method = method || 'paypal';
        const btnId = method === 'bog' ? 'btn-upgrade-bog' : 'btn-upgrade-paypal';
        const btn = document.getElementById(btnId);
        const originalText = btn ? btn.textContent.trim() : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Redirecting...'; }
        try {
            const res = await fetch('/api/subscription/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${QV.state.token}` },
                body: JSON.stringify({ method }),
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                QV.showToast(data.error || 'Could not start checkout. Try again.', 'error');
                if (btn) { btn.disabled = false; btn.textContent = originalText; }
            }
        } catch (e) {
            QV.showToast('Network error. Please try again.', 'error');
            if (btn) { btn.disabled = false; btn.textContent = originalText; }
        }
    };

    // ── Loading Screen — Pro perks + tips ───────────────────────
    const DIAMOND_PERKS = [
        { icon: '🏆', label: 'Host Tournaments',    desc: '4 / 8 / 16-player brackets' },
        { icon: '🧠', label: 'Super Explain',        desc: 'Deep AI breakdown of wrong answers' },
        { icon: '📄', label: '20 PDF Slots',         desc: 'Your whole study library saved' },
        { icon: '⚡', label: 'Instant Questions',    desc: 'AI queues the moment your lobby opens' },
        { icon: '🎭', label: '6 Bio Characters',     desc: 'Vader, Ramsay, Sherlock & more narrate you' },
        { icon: '∞',  label: 'Near-Infinite Plays',  desc: 'Almost no daily generation cap' },
        { icon: '📚', label: 'All Presets Unlocked', desc: 'Full SAT + Math exam question banks' },
        { icon: '💎', label: 'Diamond Badge',        desc: 'Animated avatar border & ♦ icon everywhere' },
        { icon: '🔍', label: 'Wrong Answer Log',     desc: 'Track & review every mistake you make' },
        { icon: '🤖', label: 'Custom Lobby AI',      desc: 'Generate questions on any topic you choose' },
        { icon: '📊', label: 'Full ELO History',     desc: 'Track your rank progression over time' },
        { icon: '🌐', label: 'Public Lobby Browser', desc: 'Join or host open games for anyone' },
    ];

    const LOADING_TIPS = [
        '💎 Diamond Pro unlocks Tournament hosting — create 4, 8, or 16-player single-elimination brackets!',
        '💎 Diamond members get 60 AI game generations per day — 4x more than free accounts.',
        '💎 With Diamond Pro, AI pre-generates questions the moment you open a lobby — zero wait time.',
        '💎 Diamond Pro unlocks 6 unique bio voices — Darth Vader, Gordon Ramsay, Sherlock Holmes & more.',
        '💎 Free users only see 50% of preset questions. Diamond unlocks the full SAT + Math exam banks.',
        '💎 Diamond Pro lets you save up to 20 PDFs for instant reuse — free accounts get only 2 slots.',
        '💎 Diamond members get the exclusive animated avatar border and ♦ badge on their profile.',
        '💎 Super Explain gives Diamond users deep AI breakdowns of every wrong answer — learn faster.',
        '💎 Diamond Pro members get 20 PDF quiz generations per day — 10x more than free users.',
        '💎 With Diamond, your wrong answer log stores every mistake so you can review and improve.',
        '💎 Diamond Pro gives you priority AI access — your questions generate before everyone else\'s.',
        '💎 Upgrade to Diamond and track your full ELO history with detailed rank progression charts.',
        '💎 Diamond members can host public and private custom lobbies on any topic with AI questions.',
        '💎 Diamond Pro includes all future features — new game modes, AI models, and perks added free.',
    ];
    let _tipInterval = null;
    let _perkInterval = null;
    let _tipIndex = 0;
    let _perkGroupIndex = 0;

    function renderPerkChips() {
        const strip = document.getElementById('loading-perks-strip');
        if (!strip) return;
        // Show 3 perks at a time, cycling through groups
        const start = (_perkGroupIndex * 3) % DIAMOND_PERKS.length;
        const group = [
            DIAMOND_PERKS[start % DIAMOND_PERKS.length],
            DIAMOND_PERKS[(start + 1) % DIAMOND_PERKS.length],
            DIAMOND_PERKS[(start + 2) % DIAMOND_PERKS.length],
        ];
        strip.innerHTML = group.map(p => `
            <div class="loading-perk-chip">
                <span class="loading-perk-icon">${p.icon}</span>
                <span class="loading-perk-label">${p.label}</span>
                <span class="loading-perk-desc">${p.desc}</span>
            </div>
        `).join('');
        _perkGroupIndex++;
    }

    QV.startLoadingTips = function () {
        const el = document.getElementById('generating-tip-text');
        if (!el) return;

        // Start perks cycling
        renderPerkChips();
        _perkInterval = setInterval(renderPerkChips, 4000);

        // Start tips cycling
        _tipIndex = Math.floor(Math.random() * LOADING_TIPS.length);
        el.textContent = LOADING_TIPS[_tipIndex];
        el.classList.add('tip-visible');
        _tipInterval = setInterval(() => {
            el.classList.remove('tip-visible');
            setTimeout(() => {
                _tipIndex = (_tipIndex + 1) % LOADING_TIPS.length;
                el.textContent = LOADING_TIPS[_tipIndex];
                el.classList.add('tip-visible');
            }, 400);
        }, 4500);
    };

    QV.stopLoadingTips = function () {
        if (_tipInterval)  { clearInterval(_tipInterval);  _tipInterval = null; }
        if (_perkInterval) { clearInterval(_perkInterval); _perkInterval = null; }
        const el = document.getElementById('generating-tip-text');
        if (el) el.classList.remove('tip-visible');
        const strip = document.getElementById('loading-perks-strip');
        if (strip) strip.innerHTML = '';
    };

    QV.updateNavUser = function () {
        QV.$('nav-username').textContent = QV.state.user.username;
        const rank = QV.state.user.rank;
        const diamondBadge = QV.isDiamondPro() ? QV.getDiamondProBadge(14) : '';
        QV.$('nav-elo').innerHTML = `${rank ? QV.getRankIcon(rank.name, 14) : '⭐'} ${QV.state.user.elo} Elo${diamondBadge ? ' ' + diamondBadge : ''}`;
        // Show PFP or letter fallback
        const img = QV.$('nav-avatar-img');
        const letter = QV.$('nav-avatar-letter');
        if (QV.state.user.photoURL) {
            img.src = QV.state.user.photoURL;
            img.classList.remove('hidden');
            letter.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            letter.classList.remove('hidden');
            letter.textContent = QV.state.user.username[0].toUpperCase();
        }
    };

    // Click profile avatar → go to profile tab
    const navAvatar = QV.$('nav-avatar');
    if (navAvatar) {
        navAvatar.style.cursor = 'pointer';
        navAvatar.addEventListener('click', () => QV.showPanel('profile'));
    }
})();
