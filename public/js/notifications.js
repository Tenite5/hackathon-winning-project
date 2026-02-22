/**
 * @file public/js/notifications.js
 * @description Notification panel UI — bell toggle, real-time updates, mark-as-read.
 */

(function () {
    'use strict';
    const { $, state, socket, api, toast, escapeHtml } = QV;

    let panelOpen = false;

    // ═══════════════════════════════════════════════════════════════
    // TOGGLE PANEL
    // ═══════════════════════════════════════════════════════════════
    $('btn-notifications').addEventListener('click', (e) => {
        e.stopPropagation();
        panelOpen = !panelOpen;
        $('notif-panel').classList.toggle('hidden', !panelOpen);
        if (panelOpen) loadNotifications();
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (panelOpen && !$('notif-wrapper').contains(e.target)) {
            panelOpen = false;
            $('notif-panel').classList.add('hidden');
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // LOAD & RENDER NOTIFICATIONS
    // ═══════════════════════════════════════════════════════════════
    async function loadNotifications() {
        try {
            const data = await api('/profile/notifications');
            renderNotifications(data.notifications || []);
        } catch (err) {
            console.error('Failed to load notifications:', err);
        }
    }

    function renderNotifications(notifications) {
        const list = $('notif-list');
        if (!notifications.length) {
            list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
            updateBadge(0);
            return;
        }

        const unreadCount = notifications.filter(n => !n.read).length;
        updateBadge(unreadCount);

        list.innerHTML = '';
        notifications.forEach((n, idx) => {
            const item = document.createElement('div');
            item.className = `notif-item ${n.read ? '' : 'unread'}`;
            item.innerHTML = `
                <div class="notif-icon">${getNotifIcon(n.type)}</div>
                <div class="notif-content">
                    <div class="notif-title">${escapeHtml(n.title)}</div>
                    <div class="notif-message">${escapeHtml(n.message)}</div>
                    <div class="notif-time">${timeAgo(n.timestamp)}</div>
                </div>
                <button class="notif-dismiss" data-idx="${idx}" title="Dismiss">&times;</button>
            `;
            // Dismiss button
            item.querySelector('.notif-dismiss').addEventListener('click', (e) => {
                e.stopPropagation();
                dismissNotification(idx);
            });
            list.appendChild(item);
        });
    }

    function getNotifIcon(type) {
        switch (type) {
            case 'friend_request': return '👋';
            case 'friend_accepted': return '🤝';
            case 'challenge': return '⚔️';
            case 'tournament_start': return '🏆';
            case 'game_invite': return '🎮';
            case 'match_result': return '🏅';
            default: return '🔔';
        }
    }

    function timeAgo(timestamp) {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    // ═══════════════════════════════════════════════════════════════
    // BADGE
    // ═══════════════════════════════════════════════════════════════
    function updateBadge(count) {
        const badge = $('notif-badge');
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // MARK ALL READ
    // ═══════════════════════════════════════════════════════════════
    $('btn-mark-all-read').addEventListener('click', async () => {
        try {
            await api('/profile/notifications/read', { method: 'POST' });
            // Update UI
            document.querySelectorAll('.notif-item.unread').forEach(el => {
                el.classList.remove('unread');
            });
            updateBadge(0);
        } catch (err) {
            console.error('Failed to mark notifications read:', err);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // DISMISS
    // ═══════════════════════════════════════════════════════════════
    async function dismissNotification(idx) {
        try {
            await api(`/profile/notifications/${idx}`, { method: 'DELETE' });
            loadNotifications();
        } catch (err) {
            console.error('Failed to dismiss notification:', err);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // REAL-TIME SOCKET EVENT
    // ═══════════════════════════════════════════════════════════════
    socket.on('notification', (notif) => {
        // Show toast for real-time notifications
        toast(notif.message || notif.title, 'info');

        // Increment badge
        const badge = $('notif-badge');
        const current = parseInt(badge.textContent) || 0;
        updateBadge(current + 1);

        // If panel is open, reload
        if (panelOpen) loadNotifications();
    });

    // ═══════════════════════════════════════════════════════════════
    // INITIAL LOAD (called after auth)
    // ═══════════════════════════════════════════════════════════════
    QV.loadNotifications = function () {
        loadNotifications();
    };
})();
