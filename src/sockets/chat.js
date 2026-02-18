/**
 * @file sockets/chat.js
 * @description Socket handlers for global chat — send messages and retrieve history.
 */

'use strict';

const db = require('../db/store');
const { sanitizeText } = require('../middleware/validate');

module.exports = function (io, socket, getCurrentUser) {

    socket.on('global-chat', ({ text }) => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const cleanText = sanitizeText(text, 200);
        if (!cleanText) return;
        const msg = { userId: currentUser.id, username: currentUser.username, text: cleanText, ts: Date.now() };
        db.globalChat.push(msg);
        if (db.globalChat.length > 100) db.globalChat.shift();
        io.emit('global-chat-msg', msg);
    });

    socket.on('global-chat-history', () => {
        socket.emit('global-chat-history', db.globalChat.slice(-50));
    });
};
