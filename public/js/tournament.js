/**
 * @file public/js/tournament.js
 * @description Tournament creation with customization, join, list.
 */

(function () {
    'use strict';
    const { $, state, socket, showPanel, toast, escapeHtml, api } = QV;

    // ── Tournament mode button ─────────────────────────────────
    if ($('btn-tournament-mode')) $('btn-tournament-mode').addEventListener('click', () => {
        showPanel('tournament');
    });

    // ── Create tournament ──────────────────────────────────────
    $('btn-create-tournament').addEventListener('click', () => {
        if (!state.user || !state.user.isDiamondPro) {
            QV.showPanel('diamond');
            toast('Hosting tournaments requires Diamond Pro.', 'info');
            return;
        }
        const topic = $('tournament-topic').value.trim() || 'General Knowledge';
        const maxPlayers = parseInt($('tournament-size').value) || 8;
        const timeLimit = parseInt($('tournament-time').value) || 10;
        const questionCount = parseInt($('tournament-questions').value) || 5;
        socket.emit('create-tournament', { topic, maxPlayers, timeLimit, questionCount });
    });

    socket.on('tournament-error', ({ message, requiresDiamond }) => {
        if (requiresDiamond) {
            QV.showPanel('diamond');
            toast(message, 'info');
        } else {
            toast(message || 'Tournament error', 'error');
        }
    });

    socket.on('tournament-created', (t) => {
        toast(`Tournament created! Waiting for players (${t.players.length}/${t.maxPlayers})`, 'success');
        QV.loadTournaments();
    });

    socket.on('tournament-updated', () => QV.loadTournaments());

    // ── Load tournaments ───────────────────────────────────────
    QV.loadTournaments = async function loadTournaments() {
        try {
            const data = await api('/tournaments');
            const list = $('tournament-list');

            if (data.tournaments.length === 0) {
                list.innerHTML = '<div class="empty-state"><p>No active tournaments. Create one!</p></div>';
                return;
            }

            list.innerHTML = '';
            data.tournaments.forEach(t => {
                const item = document.createElement('div');
                item.className = 'tourney-item';
                item.innerHTML = `
                    <div class="tourney-item-info">
                        <h4>${escapeHtml(t.topic)}</h4>
                        <span>${t.status === 'waiting' ? 'Waiting for players' : `Round ${t.round}`}</span>
                        <span class="tourney-settings text-muted">${t.questionCount || 5}Q · ${t.timeLimit || 10}s</span>
                    </div>
                    <div class="tourney-item-meta">
                        <span class="tourney-players">${t.playerCount}/${t.maxPlayers}</span>
                        ${t.status === 'waiting' ? '<button class="btn btn-danger btn-sm tourney-join-btn">Join</button>' : '<span class="text-muted">In Progress</span>'}
                    </div>
                `;
                const joinBtn = item.querySelector('.tourney-join-btn');
                if (joinBtn) {
                    joinBtn.addEventListener('click', () => {
                        socket.emit('join-tournament', { tournamentId: t.id });
                    });
                }
                list.appendChild(item);
            });
        } catch (err) {
            console.error('Load tournaments error:', err);
        }
    };

    socket.on('tournaments-updated', () => QV.loadTournaments());

    socket.on('tournament-round', ({ tournamentId, round, brackets }) => {
        toast(`Tournament Round ${round} starting!`, 'info');
    });
})();
