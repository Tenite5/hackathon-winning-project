/**
 * @file db/models/User.js
 * @description Mongoose schema for persistent user data.
 */

'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    _id: { type: String, required: true },               // UUID
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, default: '' },
    googleId: { type: String, default: '' },
    firebaseUid: { type: String, default: '' },
    email: { type: String, default: '' },
    photoURL: { type: String, default: '' },
    needsSetup: { type: Boolean, default: false },
    elo: { type: Number, default: 1000 },
    stats: {
        totalWins:      { type: Number, default: 0 },
        totalLosses:    { type: Number, default: 0 },
        totalAnswers:   { type: Number, default: 0 },
        correctAnswers: { type: Number, default: 0 },
        gamesPlayed:    { type: Number, default: 0 },
        categories:     { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    friends:        [{ type: String }],                   // array of user UUIDs
    friendRequests: [{ type: String }],
    bio:            { type: String, default: '' },
    createdAt:      { type: Number, default: Date.now },
}, { _id: false, versionKey: false });

module.exports = mongoose.model('User', userSchema);
