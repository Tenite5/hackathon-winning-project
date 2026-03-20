/**
 * @file db/models/QuestionPool.js
 * @description Persistent store for pre-generated quick-game question sets.
 * Key: `${topic}_${level}` (e.g. "Science_3")
 * Each doc holds up to 2 question sets. When one is consumed it's replaced in the background.
 */

'use strict';

const mongoose = require('mongoose');

const questionSetSchema = new mongoose.Schema({
    questions: [{
        question: String,
        options: [String],
        correct: Number,
        difficulty: String,
    }],
    createdAt: { type: Number, default: Date.now },
}, { _id: false });

const questionPoolSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // `${topic}_${level}`
    topic: { type: String, required: true },
    level: { type: Number, required: true },
    sets: { type: [questionSetSchema], default: [] },
    updatedAt: { type: Date, default: Date.now },
}, { _id: false, versionKey: false });

module.exports = mongoose.model('QuestionPool', questionPoolSchema);
