/**
 * @file public/js/friends.js
 * @description Friends list, add friend, challenge system with proper UI.
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
                    const reqAvatarHtml = req.photoURL
                        ? `<img class="friend-avatar" src="${escapeHtml(req.photoURL)}" alt="${escapeHtml(req.username)}" style="object-fit:cover;" />`
                        : `<div class="friend-avatar">${req.username[0].toUpperCase()}</div>`;
                    item.innerHTML = `
                        <div class="friend-item-info">
                            ${reqAvatarHtml}
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
                const isPending = state.pendingChallengeToId === friend.id;
                const item = document.createElement('div');
                item.className = 'friend-item';
                const avatarImg = friend.photoURL
                    ? `<img class="friend-avatar" src="${escapeHtml(friend.photoURL)}" alt="${escapeHtml(friend.username)}" style="object-fit:cover;" />`
                    : `<div class="friend-avatar">${friend.username[0].toUpperCase()}</div>`;
                const avatarHtml = isPending
                    ? `<div class="friend-avatar-wrap">${avatarImg}<span class="challenge-dot"></span></div>`
                    : avatarImg;
                item.innerHTML = `
                    <div class="friend-item-info" style="cursor:pointer;">
                        ${avatarHtml}
                        <div>
                            <div class="friend-name">
                                ${escapeHtml(friend.username)}
                                ${friend.isDiamondPro ? QV.getDiamondProBadge(12) : ''}
                                ${isPending ? '<span class="challenge-pending-icon" title="Challenge pending">⚔️</span>' : ''}
                            </div>
                            <div class="friend-status">
                                <span class="status-dot ${friend.online ? 'online' : 'offline'}"></span>
                                ${friend.online ? 'Online' : 'Offline'}
                                ${isPending ? '<span class="challenge-pending-label">Challenge sent...</span>' : ''}
                            </div>
                        </div>
                    </div>
                    <div class="friend-item-actions">
                        <button class="btn ${isPending ? 'btn-ghost' : 'btn-danger'} btn-sm challenge-btn" ${!friend.online ? 'disabled title="Friend is offline"' : ''}>
                            ${isPending ? '✕ Cancel' : '⚔️ Challenge'}
                        </button>
                        <button class="btn btn-ghost btn-sm msg-btn">Message</button>
                    </div>
                `;
                item.querySelector('.friend-item-info').addEventListener('click', () => QV.openUserProfile(friend.id));
                item.querySelector('.msg-btn').addEventListener('click', () => QV.openDM(friend, item));
                item.querySelector('.challenge-btn').addEventListener('click', () => {
                    if (!friend.online) return toast('Friend is offline', 'error');
                    if (isPending) {
                        // Cancel the challenge
                        socket.emit('challenge-cancel');
                        state.pendingChallengeToId = null;
                        toast('Challenge cancelled.', 'info');
                        QV.loadFriends();
                        return;
                    }
                    // Open challenge modal
                    state._challengeFriendId = friend.id;
                    state._challengeFriendName = friend.username;
                    $('challenge-send-friend-name').textContent = friend.username;
                    $('challenge-send-topic').value = 'General Knowledge';
                    showModal('modal-send-challenge');
                });
                list.appendChild(item);
            });
        } catch (err) {
            console.error('Load friends error:', err);
        }
    };

    // ── Send Challenge Modal ──────────────────────────────────
    $('btn-send-challenge-confirm').addEventListener('click', () => {
        const friendId = state._challengeFriendId;
        if (!friendId) return;
        const topic = $('challenge-send-topic').value.trim() || 'General Knowledge';
        socket.emit('challenge-friend', { friendId, topic });
        hideModal('modal-send-challenge');
    });

    $('btn-send-challenge-cancel').addEventListener('click', () => {
        hideModal('modal-send-challenge');
        state._challengeFriendId = null;
    });

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

    socket.on('challenge-sent', ({ challengeId, to }) => {
        state.pendingChallengeToId = state._challengeFriendId || null;
        state._challengeFriendId = null;
        toast(`⚔️ Challenge sent to ${to}! Waiting for response...`, 'info');
        QV.loadFriends();
    });

    socket.on('challenge-received', ({ challengeId, from, topic }) => {
        pendingChallengeId = challengeId;
        $('challenge-text').innerHTML = `
            <div class="challenge-from-info">
                <div class="challenge-from-avatar">${from.username[0].toUpperCase()}</div>
                <div>
                    <strong>${escapeHtml(from.username)}</strong>
                    <span class="challenge-from-elo">${from.elo} Elo</span>
                </div>
            </div>
        `;
        $('challenge-topic-text').textContent = `Topic: ${topic}`;
        showModal('modal-challenge');
        toast(`⚔️ ${from.username} wants to duel you!`, 'info');
    });

    // Challenge was cancelled/withdrawn by the sender
    socket.on('challenge-cancelled', ({ challengeId }) => {
        if (pendingChallengeId === challengeId) {
            pendingChallengeId = null;
            hideModal('modal-challenge');
            toast('Challenge was withdrawn.', 'info');
        }
    });

    $('btn-accept-challenge').addEventListener('click', () => {
        if (!pendingChallengeId) return;
        socket.emit('challenge-accept', { challengeId: pendingChallengeId });
        hideModal('modal-challenge');
        // Show loading overlay while questions generate
        $('generating-title').textContent = 'Generating Questions...';
        $('generating-topic-text').textContent = 'Preparing your challenge match...';
        $('overlay-generating').classList.remove('hidden');
        if (typeof QV !== 'undefined' && QV.startLoadingTips) QV.startLoadingTips();
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
        state.pendingChallengeToId = null;
        // Show loading overlay while questions are being generated
        $('generating-title').textContent = 'Starting Challenge...';
        $('generating-topic-text').textContent = `Topic: ${topic} · Opponent: ${opponent.username}`;
        $('overlay-generating').classList.remove('hidden');
        if (typeof QV !== 'undefined' && QV.startLoadingTips) QV.startLoadingTips();
        toast(`Game starting with ${opponent.username}! Topic: ${topic}`, 'success');
        QV.loadFriends();
    });

    socket.on('challenge-declined', ({ by }) => {
        state.pendingChallengeToId = null;
        toast(`${by} declined your challenge.`, 'info');
        QV.loadFriends();
    });

    socket.on('challenge-expired', () => {
        state.pendingChallengeToId = null;
        toast('Your challenge expired.', 'info');
        QV.loadFriends();
    });

    socket.on('challenge-error', (msg) => toast(msg, 'error'));

    // Cancel outgoing challenge when user navigates away or starts another action
    const origShowPanel = QV.showPanel;
    QV.showPanel = function (panelId) {
        // If leaving friends panel and there's a pending challenge, cancel it
        if (state.pendingChallengeToId && QV.state.currentPanel === 'friends' && panelId !== 'friends') {
            socket.emit('challenge-cancel');
            state.pendingChallengeToId = null;
        }
        origShowPanel(panelId);
    };
})();
