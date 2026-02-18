/**
 * @file db/models/Message.js
 * @description Mongoose schema for direct-message threads between two users.
 */

'use strict';

const mongoose = require('mongoose');

const dmSchema = new mongoose.Schema({
    from:         { type: String, required: true },
    fromUsername:  { type: String },
    to:           { type: String, required: true },
    text:         { type: String, required: true },
    ts:           { type: Number, default: Date.now },
}, { _id: false, versionKey: false });

const messageThreadSchema = new mongoose.Schema({
    _id:      { type: String, required: true },   // "userId1_userId2" key
    messages: [dmSchema],
}, { _id: false, versionKey: false });

module.exports = mongoose.model('MessageThread', messageThreadSchema);
