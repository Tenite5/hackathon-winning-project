/**
 * @file public/js/chat.js
 * @description Global chat, in-game chat, DM system.
 */

(function () {
    'use strict';
    const { $, state, socket, toast, escapeHtml, formatTime, api } = QV;

    // ═══════════════════════════════════════════════════════════════
    // GLOBAL CHAT
    // ═══════════════════════════════════════════════════════════════
    $('btn-global-chat-send').addEventListener('click', sendGlobalChat);
    $('global-chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendGlobalChat();
    });

    function sendGlobalChat() {
        const input = $('global-chat-input');
        const text = input.value.trim();
        if (!text) return;
        socket.emit('global-chat', { text });
        input.value = '';
    }

    socket.on('global-chat-msg', (msg) => {
        appendGlobalChatMsg(msg);
    });

    socket.on('global-chat-history', (msgs) => {
        $('global-chat-messages').innerHTML = '';
        msgs.forEach(msg => appendGlobalChatMsg(msg));
    });

    function appendGlobalChatMsg(msg) {
        const el = document.createElement('div');
        el.className = 'chat-msg';
        el.innerHTML = `
            ${QV.userBadgeHtml(msg.userId, msg.username, msg.photoURL, 22)}
            <span class="chat-msg-text">${escapeHtml(msg.text)}</span>
            <span class="chat-msg-time">${formatTime(msg.ts)}</span>
        `;
        $('global-chat-messages').appendChild(el);
        $('global-chat-messages').scrollTop = $('global-chat-messages').scrollHeight;
    }

    // ═══════════════════════════════════════════════════════════════
    // IN-GAME CHAT
    // ═══════════════════════════════════════════════════════════════
    $('game-chat-toggle').addEventListener('click', () => {
        $('game-chat-panel').classList.toggle('hidden');
    });

    $('btn-game-chat-send').addEventListener('click', sendGameChat);
    $('game-chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendGameChat();
    });

    function sendGameChat() {
        const input = $('game-chat-input');
        const text = input.value.trim();
        if (!text || !state.currentGameId) return;
        socket.emit('game-chat', { gameId: state.currentGameId, text });
        input.value = '';
    }

    socket.on('game-chat-msg', (msg) => {
        const el = document.createElement('div');
        el.className = 'chat-msg';
        el.innerHTML = `${QV.userBadgeHtml(msg.userId, msg.username, msg.photoURL, 20)} <span class="chat-msg-text">${escapeHtml(msg.text)}</span>`;
        $('game-chat-messages').appendChild(el);
        $('game-chat-messages').scrollTop = $('game-chat-messages').scrollHeight;
    });

    // ═══════════════════════════════════════════════════════════════
    // DIRECT MESSAGES (DM)
    // ═══════════════════════════════════════════════════════════════
    QV.openDM = async function openDM(friend, anchorEl) {
        state.dmFriendId = friend.id;
        const dmPanel = $('dm-panel');
        dmPanel.classList.remove('hidden');
        $('dm-username').textContent = friend.username;

        // Move DM panel right after the clicked friend item
        if (anchorEl && anchorEl.parentNode) {
            anchorEl.parentNode.insertBefore(dmPanel, anchorEl.nextSibling);
            // Scroll the DM panel into view
            setTimeout(() => dmPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
        }

        try {
            const data = await api(`/messages/${friend.id}`);
            const msgsEl = $('dm-messages');
            msgsEl.innerHTML = '';
            data.messages.forEach(msg => appendDMMessage(msg));
        } catch (err) {
            console.error('Load DMs error:', err);
        }
    };

    $('btn-close-dm').addEventListener('click', () => {
        $('dm-panel').classList.add('hidden');
        state.dmFriendId = null;
    });

    $('btn-send-dm').addEventListener('click', sendDM);
    $('dm-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendDM(); });

    async function sendDM() {
        const input = $('dm-input');
        const text = input.value.trim();
        if (!text || !state.dmFriendId) return;
        try {
            const data = await api(`/messages/${state.dmFriendId}`, { method: 'POST', body: { text } });
            appendDMMessage(data.message);
            input.value = '';
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    socket.on('dm', (msg) => {
        if (state.dmFriendId === msg.from) {
            appendDMMessage(msg);
        } else {
            toast(`New message from ${msg.fromUsername}`, 'info');
        }
    });

    function appendDMMessage(msg) {
        const el = document.createElement('div');
        const isSent = msg.from === state.user.id;
        el.className = `dm-msg ${isSent ? 'sent' : 'received'}`;
        el.innerHTML = `
            <div class="dm-msg-author">${isSent ? 'You' : escapeHtml(msg.fromUsername)}</div>
            <div>${escapeHtml(msg.text)}</div>
        `;
        $('dm-messages').appendChild(el);
        $('dm-messages').scrollTop = $('dm-messages').scrollHeight;
    }

    // ── Online Count ───────────────────────────────────────────
    socket.on('online-count', (count) => {
        const el = document.getElementById('online-count');
        if (el) el.textContent = count;
        const mobileEl = document.getElementById('mobile-online-count');
        if (mobileEl) mobileEl.textContent = count;
    });
})();
