/**
 * @file services/elo.js
 * @description Elo calculation and rank lookup utilities.
 */

'use strict';

const { RANKS } = require('../config');

function getRank(elo) {
    return RANKS.find(r => elo >= r.min && elo <= r.max) || RANKS[0];
}

function calculateElo(winnerElo, loserElo) {
    const K = 200;
    const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    const winnerGain = Math.max(100, Math.round(K * (1 - expected)));
    const loserLoss = Math.round(K * (0 - (1 - expected)));
    return {
        winnerNew: Math.round(winnerElo + winnerGain),
        loserNew: Math.round(loserElo + loserLoss),
    };
}

/**
 * Sanitize a user object for public consumption.
 * Strips internal fields like passwordHash, socketId, category stats, etc.
 */
function sanitizeUser(user) {
    if (!user) return null;
    const publicStats = {
        totalWins: user.stats.totalWins,
        totalLosses: user.stats.totalLosses,
        gamesPlayed: user.stats.gamesPlayed,
        totalAnswers: user.stats.totalAnswers,
        correctAnswers: user.stats.correctAnswers,
    };
    return {
        id: user.id,
        username: user.username,
        elo: user.elo,
        rank: getRank(user.elo),
        stats: publicStats,
        bio: user.bio,
        online: user.online,
        friends: user.friends,
        photoURL: user.photoURL || '',
        isDiamondPro: user.isDiamondPro || false,
        bioCharacter: user.bioCharacter || 'default',
    };
}

module.exports = { getRank, calculateElo, sanitizeUser };
