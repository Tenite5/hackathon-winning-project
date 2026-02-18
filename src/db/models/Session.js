/**
 * @file db/models/Session.js
 * @description Mongoose schema for auth sessions (token → userId).
 */

'use strict';

const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    _id:    { type: String, required: true },   // session token (UUID)
    userId: { type: String, required: true },
}, { _id: false, versionKey: false });

module.exports = mongoose.model('Session', sessionSchema);
