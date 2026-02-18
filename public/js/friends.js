/**
 * @file public/js/friends.js
 * @description Friends list, add friend, challenge system.
 */

(function () {
    'use strict';
    const { $, state, socket, showModal, hideModal, toast, escapeHtml, api } = QV;

    // ── Add Friend ─────────────────────────────────────────────
    $('btn-add-friend').addEventListener('click', async () => {
        const username = $('friend-username-input').value.trim();
        if (!username) return;
        try {
            await api('/friends/request', { method: 'POST', body: { username } });
            toast(`Friend request sent to ${username}!`, 'success');
            $('friend-username-input').value = '';
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    // ── Load Friends List ──────────────────────────────────────
    QV.loadFriends = async function loadFriends() {
        try {
            const data = await api('/friends');

            // Requests
            const reqSection = $('friend-requests-section');
            const reqList = $('friend-requests-list');
            if (data.requests.length > 0) {
                reqSection.classList.remove('hidden');
                reqList.innerHTML = '';
                data.requests.forEach(req => {
                    const item = document.createElement('div');
                    item.className = 'friend-item';
                    item.innerHTML = `
                        <div class="friend-item-info">
                            <div class="friend-avatar">${req.username[0].toUpperCase()}</div>
                            <div>
                                <div class="friend-name">${escapeHtml(req.username)}</div>
                                <div class="friend-status text-muted">Wants to be friends</div>
                            </div>
                        </div>
                        <div class="friend-item-actions">
                            <button class="btn btn-primary btn-sm accept-btn">Accept</button>
                            <button class="btn btn-ghost btn-sm decline-btn">Decline</button>
                        </div>
                    `;
                    item.querySelector('.accept-btn').addEventListener('click', async () => {
                        await api('/friends/accept', { method: 'POST', body: { userId: req.id } });
                        toast(`${req.username} is now your friend!`, 'success');
                        QV.loadFriends();
                    });
                    item.querySelector('.decline-btn').addEventListener('click', async () => {
                        await api('/friends/decline', { method: 'POST', body: { userId: req.id } });
                        QV.loadFriends();
                    });
                    reqList.appendChild(item);
                });

                $('friends-badge').textContent = data.requests.length;
                $('friends-badge').classList.remove('hidden');
            } else {
                reqSection.classList.add('hidden');
                $('friends-badge').classList.add('hidden');
            }

            // Friends list
            const list = $('friends-list');
            if (data.friends.length === 0) {
                list.innerHTML = '<div class="empty-state"><p>No friends yet. Add someone!</p></div>';
                return;
            }

            list.innerHTML = '';
            data.friends.forEach(friend => {
                const item = document.createElement('div');
                item.className = 'friend-item';
                item.innerHTML = `
                    <div class="friend-item-info" style="cursor:pointer;">
                        <div class="friend-avatar">${friend.username[0].toUpperCase()}</div>
                        <div>
                            <div class="friend-name">${escapeHtml(friend.username)}</div>
                            <div class="friend-status">
                                <span class="status-dot ${friend.online ? 'online' : 'offline'}"></span>
                                ${friend.online ? 'Online' : 'Offline'}
                            </div>
                        </div>
                    </div>
                    <div class="friend-item-actions">
                        <button class="btn btn-danger btn-sm challenge-btn" ${!friend.online ? 'disabled title="Friend is offline"' : ''}>⚔️ Challenge</button>
                        <button class="btn btn-ghost btn-sm msg-btn">Message</button>
                    </div>
                `;
                item.querySelector('.friend-item-info').addEventListener('click', () => QV.openUserProfile(friend.id));
                item.querySelector('.msg-btn').addEventListener('click', () => QV.openDM(friend));
                item.querySelector('.challenge-btn').addEventListener('click', () => {
                    if (!friend.online) return toast('Friend is offline', 'error');
                    const topic = prompt('Enter a topic for the challenge:', 'General Knowledge');
                    if (topic === null) return;
                    socket.emit('challenge-friend', { friendId: friend.id, topic: topic || 'General Knowledge' });
                });
                list.appendChild(item);
            });
        } catch (err) {
            console.error('Load friends error:', err);
        }
    };

    // ── Friend Notifications ───────────────────────────────────
    socket.on('friend-request', ({ from }) => {
        toast(`${from.username} sent you a friend request!`, 'info');
        QV.loadFriends();
    });

    socket.on('friend-accepted', ({ user }) => {
        toast(`${user.username} accepted your friend request!`, 'success');
        QV.loadFriends();
    });

    socket.on('friend-online', ({ username }) => {
        QV.loadFriends();
    });

    socket.on('friend-offline', () => {
        QV.loadFriends();
    });

    // ═══════════════════════════════════════════════════════════════
    // CHALLENGE SYSTEM
    // ═══════════════════════════════════════════════════════════════
    let pendingChallengeId = null;

    socket.on('challenge-sent', ({ to }) => {
        toast(`Challenge sent to ${to}! Waiting for response...`, 'info');
    });

    socket.on('challenge-received', ({ challengeId, from, topic }) => {
        pendingChallengeId = challengeId;
        $('challenge-text').textContent = `${from.username} (${from.elo} Elo) challenged you!`;
        $('challenge-topic-text').textContent = `Topic: ${topic}`;
        showModal('modal-challenge');
        toast(`⚔️ ${from.username} wants to duel you!`, 'info');
    });

    $('btn-accept-challenge').addEventListener('click', () => {
        if (!pendingChallengeId) return;
        socket.emit('challenge-accept', { challengeId: pendingChallengeId });
        hideModal('modal-challenge');
        toast('Challenge accepted! Game starting...', 'success');
        pendingChallengeId = null;
    });

    $('btn-decline-challenge').addEventListener('click', () => {
        if (!pendingChallengeId) return;
        socket.emit('challenge-decline', { challengeId: pendingChallengeId });
        hideModal('modal-challenge');
        toast('Challenge declined.', 'info');
        pendingChallengeId = null;
    });

    socket.on('challenge-accepted', ({ gameId, opponent, topic }) => {
        state.currentGameId = gameId;
        toast(`Game starting with ${opponent.username}! Topic: ${topic}`, 'success');
    });

    socket.on('challenge-declined', ({ by }) => {
        toast(`${by} declined your challenge.`, 'info');
    });

    socket.on('challenge-expired', () => {
        toast('Your challenge expired.', 'info');
    });

    socket.on('challenge-error', (msg) => toast(msg, 'error'));
})();
