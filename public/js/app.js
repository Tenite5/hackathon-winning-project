/**
 * @file public/js/app.js
 * @description Main entry point — sidebar nav, auto-login, onAuthenticated, modal handlers, init.
 */

(function () {
    'use strict';
    const { $, $$, state, socket, showView, showPanel, hideModal } = QV;

    // ═══════════════════════════════════════════════════════════════
    // SIDEBAR NAVIGATION
    // ═══════════════════════════════════════════════════════════════
    $$('.sidebar-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showPanel(btn.dataset.panel);
            if (btn.dataset.panel === 'leaderboard') QV.loadLeaderboard();
            if (btn.dataset.panel === 'friends') QV.loadFriends();
            if (btn.dataset.panel === 'browser') QV.loadLobbies();
            if (btn.dataset.panel === 'tournament') QV.loadTournaments();
            if (btn.dataset.panel === 'profile') {
                QV.updateProfile();
                QV.loadMatchHistory();
                QV.loadEloHistory();
            }
            if (btn.dataset.panel === 'wronglog') QV.loadWrongQuestions();
            if (btn.dataset.panel === 'settings') QV.loadSettings();
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // AUTO-LOGIN
    // ═══════════════════════════════════════════════════════════════
    async function tryAutoLogin() {
        if (!state.token) return;
        try {
            const data = await QV.api('/me');
            state.user = data.user;
            if (data.needsSetup) {
                showView('view-profile-setup');
            } else {
                onAuthenticated();
            }
        } catch {
            localStorage.removeItem('qvizio_token');
            state.token = null;
            showView('view-auth');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ON AUTHENTICATED
    // ═══════════════════════════════════════════════════════════════
    function onAuthenticated() {
        showView('view-dashboard');
        QV.updateNavUser();
        socket.emit('auth', state.token);
        socket.emit('global-chat-history');
        QV.loadLeaderboard();
        QV.loadFriends();
        QV.loadLobbies();
        QV.loadTournaments();
        QV.updateProfile();
        if (QV.loadNotifications) QV.loadNotifications();
    }

    // Expose onAuthenticated so auth.js can call it
    QV.onAuthenticated = onAuthenticated;

    // ═══════════════════════════════════════════════════════════════
    // MODAL CLOSE HANDLERS
    // ═══════════════════════════════════════════════════════════════
    document.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', () => {
            hideModal(el.dataset.closeModal);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // SOCKET AUTH EVENTS
    // ═══════════════════════════════════════════════════════════════
    socket.on('auth-success', (user) => {
        state.user = user;
        QV.updateNavUser();
    });

    socket.on('auth-error', () => {
        localStorage.removeItem('qvizio_token');
        state.token = null;
        showView('view-auth');
    });

    // ═══════════════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════════════
    // If no token, show auth view immediately (no flash).
    // If token exists, tryAutoLogin will resolve to dashboard or auth.
    if (!QV.state.token) {
        QV.showView('view-auth');
    }
    tryAutoLogin();
})();
