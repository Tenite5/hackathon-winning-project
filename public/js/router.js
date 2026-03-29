/**
 * @file public/js/router.js
 * @description Client-side URL routing via the History API.
 *
 * Patches QV.showPanel and QV.showView so the browser URL always reflects the
 * current view/panel.  User-initiated navigation (sidebar clicks) uses pushState
 * so the back/forward buttons work.  Programmatic transitions (game exit, errors)
 * use replaceState (via the patched helpers) to keep the URL accurate without
 * polluting the history stack.
 *
 * Load order: AFTER api.js, BEFORE all other modules.
 */

(function () {
    'use strict';

    // Capture the URL the user actually navigated to, before any script modifies it.
    var _initialPath   = window.location.pathname;
    var _initialSearch = window.location.search;

    // ── Panel ↔ path mapping ──────────────────────────────────
    var PANEL_PATHS = {
        home:        '/home',
        browser:     '/play',
        leaderboard: '/leaderboard',
        profile:     '/profile',
        friends:     '/friends',
        tournament:  '/tournaments',
        wronglog:    '/mistakes',
        shop:        '/shop',
        pdfmode:     '/pdf',
        settings:    '/settings',
        diamond:     '/diamond',
    };

    var PATH_TO_PANEL = {};
    for (var panel in PANEL_PATHS) {
        PATH_TO_PANEL[PANEL_PATHS[panel]] = panel;
    }

    // Suppresses URL updates inside _resolve to prevent feedback loops.
    var _suppressUrlUpdate = false;

    // ── Patch QV.showPanel — replaceState to keep URL in sync ─
    var _origShowPanel = QV.showPanel;
    QV.showPanel = function (panelId) {
        _origShowPanel(panelId);
        if (_suppressUrlUpdate) return;
        var path = PANEL_PATHS[panelId];
        if (path && window.location.pathname !== path) {
            history.replaceState({ panel: panelId }, '', path);
        }
    };

    // ── Patch QV.showView — replaceState for non-dashboard views
    var _origShowView = QV.showView;
    QV.showView = function (viewId) {
        _origShowView(viewId);
        if (_suppressUrlUpdate) return;

        switch (viewId) {
            case 'view-dashboard': {
                // Sync URL to whatever panel is currently active
                var p = QV.state.currentPanel || 'home';
                var pp = PANEL_PATHS[p] || '/home';
                if (window.location.pathname !== pp) {
                    history.replaceState({ panel: p }, '', pp);
                }
                break;
            }
            case 'view-lobby': {
                var lid = QV.state.currentLobbyId;
                var lp = lid ? '/lobby/' + lid : '/lobby';
                if (window.location.pathname !== lp) {
                    history.replaceState({ view: viewId }, '', lp);
                }
                break;
            }
            case 'view-game': {
                var gid = QV.state.currentGameId;
                var gp = gid ? '/game/' + gid : '/game';
                if (window.location.pathname !== gp) {
                    history.replaceState({ view: viewId }, '', gp);
                }
                break;
            }
            case 'view-game-over':
                if (window.location.pathname !== '/results') {
                    history.replaceState({ view: viewId }, '', '/results');
                }
                break;
            case 'view-auth':
                // Reset URL on logout (but don't clobber diamond checkout params)
                if (window.location.pathname !== '/' && !window.location.search.includes('diamond=')) {
                    history.replaceState({}, '', '/');
                }
                break;
            // view-profile-setup: leave URL as-is
        }
    };

    // ── Load panel-specific data (mirrors sidebar handler logic)
    function _loadPanelData(panel) {
        switch (panel) {
            case 'leaderboard': if (QV.loadLeaderboard) QV.loadLeaderboard(); break;
            case 'friends':     if (QV.loadFriends) QV.loadFriends(); break;
            case 'browser':     if (QV.loadLobbies) QV.loadLobbies(); break;
            case 'tournament':  if (QV.loadTournaments) QV.loadTournaments(); break;
            case 'profile':
                if (QV.updateProfile) QV.updateProfile();
                if (QV.loadMatchHistory) QV.loadMatchHistory();
                if (QV.loadEloHistory) QV.loadEloHistory();
                break;
            case 'wronglog': if (QV.loadWrongQuestions) QV.loadWrongQuestions(); break;
            case 'shop':     if (QV.loadShop) QV.loadShop(); break;
            case 'settings': if (QV.loadSettings) QV.loadSettings(); break;
            case 'diamond':  if (QV.refreshDiamondStatus) QV.refreshDiamondStatus(); break;
        }
    }

    // ── Route resolver ────────────────────────────────────────
    function _resolve(path) {
        _suppressUrlUpdate = true;
        var targetPath = path;
        try {
            // Normalise trailing slash
            if (path.length > 1 && path.endsWith('/')) {
                path = path.slice(0, -1);
                targetPath = path;
            }

            // 1. Exact panel match  (e.g. /leaderboard → panel-leaderboard)
            var panel = PATH_TO_PANEL[path];
            if (panel) {
                if (QV.state.currentView !== 'view-dashboard') QV.showView('view-dashboard');
                QV.showPanel(panel);
                _loadPanelData(panel);
                return;
            }

            // 2. /profile/:username  → open user profile modal
            var profileMatch = path.match(/^\/profile\/([^/]+)$/);
            if (profileMatch) {
                var username = decodeURIComponent(profileMatch[1]);
                if (QV.state.currentView !== 'view-dashboard') QV.showView('view-dashboard');
                if (QV.state.currentPanel !== 'home') QV.showPanel('home');
                _openProfileByUsername(username);
                return;
            }

            // 3. /lobby/:id  → attempt to join/show lobby
            var lobbyMatch = path.match(/^\/lobby\/([^/]+)$/);
            if (lobbyMatch) {
                var lobbyId = lobbyMatch[1];
                // Already viewing this lobby — nothing to do
                if (QV.state.currentLobbyId === lobbyId && QV.state.currentView === 'view-lobby') return;
                if (QV.state.currentView !== 'view-dashboard') QV.showView('view-dashboard');
                QV.showPanel('home');
                // Small delay so socket auth (emitted just before) is processed first
                setTimeout(function () { QV.socket.emit('join-lobby', { lobbyId: lobbyId }); }, 300);
                return;
            }

            // 4. /game/:id  or /results  — can't restore a game from URL alone
            // 5. / or unrecognised path → fall through to home
            targetPath = '/home';
            if (QV.state.currentView !== 'view-dashboard') QV.showView('view-dashboard');
            QV.showPanel('home');
        } finally {
            _suppressUrlUpdate = false;
            // Ensure the URL matches what we just resolved to.
            // showPanel/showView were suppressed, so we set it here.
            if (window.location.pathname !== targetPath) {
                history.replaceState({}, '', targetPath);
            }
        }
    }

    // ── Open a profile by username (for /profile/:username) ───
    function _openProfileByUsername(username) {
        if (!QV.openUserProfile) return;
        QV.api('/profile-by-name/' + encodeURIComponent(username))
            .then(function (data) {
                if (data && data.user && data.user.id) {
                    QV.openUserProfile(data.user.id);
                } else {
                    QV.toast('User not found.', 'error');
                    history.replaceState({ panel: 'home' }, '', '/home');
                }
            })
            .catch(function () {
                QV.toast('User not found.', 'error');
                history.replaceState({ panel: 'home' }, '', '/home');
            });
    }

    // ── Public: navigate (pushState) — for user-initiated nav ─
    QV.navigateTo = function (path) {
        if (window.location.pathname !== path) {
            history.pushState({}, '', path);
        }
        _resolve(path);
    };

    // ── Public: panel → path lookup ───────────────────────────
    QV.panelToPath = function (panelId) {
        return PANEL_PATHS[panelId] || null;
    };

    // ── Back / Forward buttons ────────────────────────────────
    window.addEventListener('popstate', function () {
        _resolve(window.location.pathname);
    });

    // ── Router object (called after auth completes) ───────────
    QV.router = {
        /** Read the original URL and show the matching panel/view. */
        handleInitialRoute: function () {
            // Use the path captured at page load, before any script modified it.
            var path = _initialPath;
            _initialPath = null; // consumed

            // If the page was loaded via a diamond checkout redirect (/?diamond=...)
            // profile.js already handled navigation — don't override it.
            if (_initialSearch && _initialSearch.includes('diamond=')) return;

            // Root → home (already the default panel)
            if (!path || path === '/') {
                history.replaceState({ panel: 'home' }, '', '/home');
                return;
            }

            // Already on /home → nothing to do
            if (path === '/home') return;

            // Resolve to the correct panel / special view
            _resolve(path);
        },
    };
})();
