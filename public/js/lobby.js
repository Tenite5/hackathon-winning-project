/**
 * @file public/js/lobby.js
 * @description Custom lobby creation, join-by-code, lobby view, lobby browser.
 */

(function () {
    'use strict';
    const { $, $$, state, socket, showView, showPanel, showModal, hideModal, toast, escapeHtml, api } = QV;

    // ── Create Lobby ───────────────────────────────────────────
    $('btn-custom-game').addEventListener('click', () => showModal('modal-create-lobby'));

    $('btn-create-lobby').addEventListener('click', () => {
        const topic = $('lobby-topic').value.trim() || 'General Knowledge';
        const timeLimit = parseInt($('lobby-time').value) || 10;
        const questionCount = parseInt($('lobby-questions').value) || 5;
        const maxPlayers = parseInt($('lobby-players').value) || 2;
        const isPublic = $('lobby-public').checked;
        const ranked = $('lobby-ranked').checked;

        socket.emit('create-lobby', { topic, isPublic, timeLimit, questionCount, maxPlayers, ranked });
        hideModal('modal-create-lobby');
    });

    socket.on('lobby-created', ({ lobbyId, inviteCode, lobby }) => {
        state.currentLobbyId = lobbyId;
        showLobbyView(lobby, inviteCode);
        toast(`Lobby created! Code: ${inviteCode}`, 'success');
    });

    socket.on('lobby-updated', (lobby) => {
        if (state.currentLobbyId === lobby.id) {
            showLobbyView(lobby);
        }
        // Auto-enter lobby view when joining from browser
        if (!state.currentLobbyId && lobby.players.find(p => p.userId === state.user.id)) {
            state.currentLobbyId = lobby.id;
            showLobbyView(lobby);
        }
    });

    socket.on('lobby-error', (msg) => {
        toast(msg, 'error');
        if (state.currentView === 'view-lobby') {
            state.currentLobbyId = null;
            showView('view-dashboard');
        }
    });

    socket.on('lobby-game-start', ({ gameId }) => {
        state.currentGameId = gameId;
        state.currentLobbyId = null;
        showView('view-game');
        $('game-question-text').textContent = 'Loading questions...';
        $('game-options').innerHTML = '';
        $('game-feedback').classList.add('hidden');
        $('game-q-counter').textContent = '';
        toast('Game starting!', 'info');
    });

    function showLobbyView(lobby, code) {
        showView('view-lobby');
        $('lobby-view-topic').textContent = lobby.topic;
        $('lobby-view-code').textContent = code || lobby.inviteCode || '';
        $('lobby-view-settings').textContent = `${lobby.questionCount} questions · ${lobby.timeLimit}s per question`;

        const list = $('lobby-players-list');
        list.innerHTML = '';
        lobby.players.forEach(p => {
            const card = document.createElement('div');
            card.className = `lobby-player-card ${p.ready ? 'ready' : ''}`;
            card.innerHTML = `
                <div class="lobby-player-avatar">${p.username[0].toUpperCase()}</div>
                <div class="lobby-player-name">${p.username}</div>
                <div class="lobby-player-status ${p.ready ? 'ready-yes' : 'ready-no'}">${p.ready ? '✓ Ready' : 'Waiting...'}</div>
            `;
            list.appendChild(card);
        });

        const startBtn = $('btn-lobby-start');
        if (lobby.hostId === state.user.id && lobby.players.length >= 2) {
            startBtn.style.display = 'inline-flex';
        } else {
            startBtn.style.display = 'none';
        }
    }

    $('btn-lobby-start').addEventListener('click', () => {
        if (state.isStartingGame) return;
        state.isStartingGame = true;
        $('btn-lobby-start').disabled = true;
        socket.emit('lobby-start', { lobbyId: state.currentLobbyId });
        setTimeout(() => { state.isStartingGame = false; $('btn-lobby-start').disabled = false; }, 5000);
    });

    $('btn-lobby-leave').addEventListener('click', () => {
        if (state.currentLobbyId) {
            socket.emit('leave-lobby', { lobbyId: state.currentLobbyId });
        }
        state.currentLobbyId = null;
        showView('view-dashboard');
    });

    // ── Join by code ───────────────────────────────────────────
    $('btn-join-code').addEventListener('click', () => showModal('modal-join-code'));

    $('btn-join-with-code').addEventListener('click', () => {
        const code = $('join-code-input').value.trim().toUpperCase();
        if (!code) return;
        socket.emit('join-lobby', { inviteCode: code });
        hideModal('modal-join-code');
    });

    // ── Lobby Browser ──────────────────────────────────────────
    QV.loadLobbies = async function loadLobbies() {
        try {
            const data = await api('/lobbies');
            const list = $('lobby-list');

            if (data.lobbies.length === 0) {
                list.innerHTML = `<div class="empty-state"><p>No public lobbies available. Create one!</p></div>`;
                return;
            }

            list.innerHTML = '';
            data.lobbies.forEach(lobby => {
                const item = document.createElement('div');
                item.className = 'lobby-item';
                item.innerHTML = `
                    <div class="lobby-item-info">
                        <h4>${escapeHtml(lobby.topic)}</h4>
                        <span>by ${escapeHtml(lobby.host)} · ${lobby.questionCount} questions · ${lobby.timeLimit}s</span>
                    </div>
                    <div class="lobby-item-meta">
                        <span class="lobby-item-players">${lobby.playerCount}/${lobby.maxPlayers}</span>
                        <button class="btn btn-primary btn-sm lobby-join-btn">Join</button>
                    </div>
                `;
                item.querySelector('.lobby-join-btn').addEventListener('click', () => {
                    socket.emit('join-lobby', { lobbyId: lobby.id });
                });
                list.appendChild(item);
            });
        } catch (err) {
            console.error('Load lobbies error:', err);
        }
    };

    $('btn-refresh-lobbies').addEventListener('click', () => QV.loadLobbies());
    socket.on('lobbies-updated', () => QV.loadLobbies());
})();
