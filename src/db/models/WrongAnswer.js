/**
 * @file db/models/WrongAnswer.js
 * @description Mongoose schema for a user's wrong-answer log.
 */

'use strict';

const mongoose = require('mongoose');

const wrongEntrySchema = new mongoose.Schema({
    id:              { type: String },
    topic:           { type: String },
    question:        { type: String },
    options:         [{ type: String }],
    correctIndex:    { type: Number },
    correctAnswer:   { type: String },
    yourAnswerIndex: { type: Number },
    yourAnswer:      { type: String },
    timedOut:        { type: Boolean, default: false },
    difficulty:      { type: String, default: 'medium' },
    explanation:     { type: String, default: null },
    playedAt:        { type: Number },
}, { _id: false, versionKey: false });

const wrongAnswerSchema = new mongoose.Schema({
    _id:     { type: String, required: true },   // userId
    entries: [wrongEntrySchema],
}, { _id: false, versionKey: false });

module.exports = mongoose.model('WrongAnswer', wrongAnswerSchema);
