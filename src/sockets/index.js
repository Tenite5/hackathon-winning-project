/**
 * @file sockets/index.js
 * @description Socket.io connection handler — auth, online tracking, per-socket rate limiting, and handler registration.
 */

'use strict';

const db = require('../db/store');
const { socketAuth } = require('../middleware/auth');
const { sanitizeUser } = require('../services/elo');
const { handleDisconnectFromGames } = require('../services/gameEngine');
const { createSocketRateLimit } = require('../middleware/rateLimit');
const { cancelOutgoingChallenges } = require('./matchmaking');

// Handler modules
const registerGameHandlers = require('./game');
const registerLobbyHandlers = require('./lobby');
const registerMatchmakingHandlers = require('./matchmaking');
const registerChatHandlers = require('./chat');
const registerTournamentHandlers = require('./tournament');

// ── Fake online count inflation ───────────────────────────────────────────────
// Oscillates between +90 and +100 extra "users" to make the platform feel active.
// Uses a slow random walk so the number changes naturally over time.
let _fakeOnlineBonus = 95;
let _fakeOnlineDir = 1;
setInterval(() => {
    _fakeOnlineBonus += _fakeOnlineDir * (Math.random() < 0.5 ? 1 : 0);
    if (_fakeOnlineBonus >= 100) _fakeOnlineDir = -1;
    if (_fakeOnlineBonus <= 90)  _fakeOnlineDir =  1;
}, 12000); // drift every 12 seconds

function broadcastOnlineCount(io) {
    let realCount = 0;
    for (const [, u] of db.users) {
        if (u.online && !u.isBot) realCount++;
    }
    io.emit('online-count', realCount + _fakeOnlineBonus);
}

module.exports = function setupSockets(io) {
    const isRateLimited = createSocketRateLimit({ windowMs: 10000, max: 30 });

    io.on('connection', (socket) => {
        let currentUser = null;

        /** Getter closure shared with handler modules. */
        const getCurrentUser = () => currentUser;

        // Per-socket rate-limit middleware
        socket.use((packet, next) => {
            // Skip rate limit for auth event
            if (packet[0] === 'auth') return next();
            if (isRateLimited(socket.id)) {
                return next(new Error('Rate limited'));
            }
            next();
        });

        // ── Auth ─────────────────────────────────────────────────
        socket.on('auth', (token) => {
            if (typeof token !== 'string') return socket.emit('auth-error', 'Invalid session');
            const user = socketAuth(token);
            if (!user) return socket.emit('auth-error', 'Invalid session');
            currentUser = user;
            currentUser.online = true;
            currentUser.socketId = socket.id;
            socket.emit('auth-success', sanitizeUser(currentUser));

            broadcastOnlineCount(io);

            currentUser.friends.forEach(fId => {
                const f = db.users.get(fId);
                if (f && f.socketId) {
                    io.to(f.socketId).emit('friend-online', { userId: currentUser.id, username: currentUser.username });
                }
            });
        });

        // Register all handler modules
        registerGameHandlers(io, socket, getCurrentUser);
        registerLobbyHandlers(io, socket, getCurrentUser);
        registerMatchmakingHandlers(io, socket, getCurrentUser);
        registerChatHandlers(io, socket, getCurrentUser);
        registerTournamentHandlers(io, socket, getCurrentUser);

        // ── Disconnect ────────────────────────────────────────────
        socket.on('disconnect', () => {
            if (currentUser) {
                currentUser.online = false;
                currentUser.socketId = null;
                db.quickQueue = db.quickQueue.filter(q => q.userId !== currentUser.id);

                // Cancel any outgoing challenges
                cancelOutgoingChallenges(io, currentUser.id);

                broadcastOnlineCount(io);

                // Notify friends
                currentUser.friends.forEach(fId => {
                    const f = db.users.get(fId);
                    if (f && f.socketId) {
                        io.to(f.socketId).emit('friend-offline', { userId: currentUser.id });
                    }
                });

                // Handle lobbies — clean up if player was in a waiting lobby
                for (const [lobbyId, lobby] of db.lobbies) {
                    if (lobby.status !== 'waiting') continue;
                    const inLobby = lobby.players.find(p => p.userId === currentUser.id);
                    if (!inLobby) continue;

                    lobby.players = lobby.players.filter(p => p.userId !== currentUser.id);
                    if (lobby.players.length === 0 || lobby.hostId === currentUser.id) {
                        if (lobby.players.length > 0) {
                            io.to(lobbyId).emit('lobby-error', 'Host disconnected. Lobby has been closed.');
                            lobby.players.forEach(p => {
                                const s = io.sockets.sockets.get(p.socketId);
                                if (s) s.leave(lobbyId);
                            });
                        }
                        db.lobbies.delete(lobbyId);
                    } else {
                        io.to(lobbyId).emit('lobby-updated', lobby);
                    }
                    io.emit('lobbies-updated');
                }

                // Handle in-progress games
                handleDisconnectFromGames(io, currentUser);
            }
        });
    });

    // Cleanup timer — auto-expire stale lobbies, tournaments, and old games
    setInterval(() => {
        const now = Date.now();
        let lobbiesRemoved = 0;
        let tourneysRemoved = 0;

        for (const [id, lobby] of db.lobbies) {
            if (lobby.status === 'waiting' && lobby.expiresAt && now > lobby.expiresAt) {
                io.to(id).emit('lobby-error', 'Lobby expired due to inactivity.');
                db.lobbies.delete(id);
                lobbiesRemoved++;
            }
        }

        for (const [id, t] of db.tournaments) {
            if (t.status === 'waiting' && t.expiresAt && now > t.expiresAt) {
                io.to(`tournament-${id}`).emit('tournament-error', 'Tournament expired due to inactivity.');
                db.tournaments.delete(id);
                tourneysRemoved++;
            }
        }

        for (const [id, game] of db.games) {
            if (game.status === 'finished' && now - game.createdAt > 30 * 60 * 1000) {
                db.games.delete(id);
            }
        }

        if (lobbiesRemoved || tourneysRemoved) {
            io.emit('lobbies-updated');
            io.emit('tournaments-updated');
        }
    }, 30000);
};
