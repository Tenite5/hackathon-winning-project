/**
 * @file db/models/Session.js
 * @description Mongoose schema for auth sessions (token → userId) with 30-day TTL.
 */

'use strict';

const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    _id: { type: String, required: true },   // session token (UUID)
    userId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },  // 30-day TTL index
}, { _id: false, versionKey: false });

module.exports = mongoose.model('Session', sessionSchema);
