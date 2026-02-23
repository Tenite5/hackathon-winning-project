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
        gameTimeLeft: 0,
        gameTimeLimit: 10,
        dmFriendId: null,
        lastGameData: null,
        isStartingGame: false,
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

    QV.updateNavUser = function () {
        QV.$('nav-username').textContent = QV.state.user.username;
        QV.$('nav-elo').textContent = `⭐ ${QV.state.user.elo} Elo`;
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
})();
