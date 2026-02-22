/**
 * @file services/notifications.js
 * @description Notification utility — push notifications to users via socket and persist them.
 */

'use strict';

const db = require('../db/store');

const NOTIFICATION_TYPES = {
    FRIEND_REQUEST: 'friend_request',
    FRIEND_ACCEPTED: 'friend_accepted',
    CHALLENGE: 'challenge',
    TOURNAMENT_START: 'tournament_start',
    GAME_INVITE: 'game_invite',
    MATCH_RESULT: 'match_result',
    SYSTEM: 'system',
};

/**
 * Push a notification to a user.
 * @param {Object} io - Socket.io server instance
 * @param {string} userId - Target user ID
 * @param {Object} notification - { type, title, message, data? }
 */
function pushNotification(io, userId, notification) {
    const user = db.users.get(userId);
    if (!user) return;

    const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type: notification.type || NOTIFICATION_TYPES.SYSTEM,
        title: notification.title || '',
        message: notification.message || '',
        data: notification.data || {},
        read: false,
        timestamp: Date.now(),
    };

    if (!user.notifications) user.notifications = [];
    user.notifications.unshift(entry);
    // Cap at 50 notifications
    if (user.notifications.length > 50) user.notifications = user.notifications.slice(0, 50);

    db.saveUser(userId);

    // Push via socket if user is online
    if (user.socketId) {
        io.to(user.socketId).emit('notification', entry);
    }
}

module.exports = { pushNotification, NOTIFICATION_TYPES };
