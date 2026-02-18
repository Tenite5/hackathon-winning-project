/**
 * @file routes/tournaments.js
 * @description Tournament listing route.
 */

'use strict';

const { Router } = require('express');
const db = require('../db/store');

const router = Router();

router.get('/tournaments', (req, res) => {
    const list = [];
    for (const [, t] of db.tournaments) {
        list.push({
            id: t.id,
            topic: t.topic,
            status: t.status,
            playerCount: t.players.length,
            maxPlayers: t.maxPlayers,
            round: t.currentRound,
            createdAt: t.createdAt,
        });
    }
    res.json({ tournaments: list });
});

module.exports = router;
