/**
 * @file routes/lobbies.js
 * @description Public lobby listing route.
 */

'use strict';

const { Router } = require('express');
const db = require('../db/store');

const router = Router();

router.get('/lobbies', (req, res) => {
    const publicLobbies = [];
    for (const [, lobby] of db.lobbies) {
        if (lobby.isPublic && lobby.status === 'waiting') {
            publicLobbies.push({
                id: lobby.id,
                topic: lobby.topic,
                host: lobby.hostUsername,
                playerCount: lobby.players.length,
                maxPlayers: lobby.maxPlayers,
                questionCount: lobby.questionCount,
                timeLimit: lobby.timeLimit,
                createdAt: lobby.createdAt,
            });
        }
    }
    res.json({ lobbies: publicLobbies });
});

module.exports = router;
