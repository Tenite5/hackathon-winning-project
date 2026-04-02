/**
 * @file config.js
 * @description Application constants — ranks, preset question banks, and environment config.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Load preset questions from JSON files ──────────────────────────────────
const GEORGIAN_LETTER_INDEX = { 'ა': 0, 'ბ': 1, 'გ': 2, 'დ': 3 };

function loadMathPreset() {
    const dir = path.join(__dirname, 'presets', 'math');
    const questions = [];
    for (let i = 1; i <= 40; i++) {
        const file = path.join(dir, `math-questions-${i}.json`);
        if (!fs.existsSync(file)) continue;
        let text = fs.readFileSync(file, 'utf8');
        // Sanitize fancy unicode quotes that break JSON parsing
        text = text.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, "'");
        const raw = JSON.parse(text);
        for (const q of raw) {
            const opts = [q.choices['ა'], q.choices['ბ'], q.choices['გ'], q.choices['დ']];
            const entry = {
                question: q.question,
                options: opts,
                correct: GEORGIAN_LETTER_INDEX[q.correct] ?? 0,
                difficulty: 'hard',
            };
            if (q.diagram_url) entry.imageUrl = q.diagram_url;
            questions.push(entry);
        }
    }
    return questions;
}

function loadSATPreset() {
    const file = path.join(__dirname, 'presets', 'sat', 'ALL SAT.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw
        .filter(q => Array.isArray(q.options) && q.options.length === 4)
        .map(q => {
            const questionText = q.passage
                ? `${q.passage}\n\n${q.question_text}`
                : q.question_text;
            const entry = {
                question: questionText,
                options: q.options,
                correct: q.options.indexOf(q.correct_answer),
                difficulty: q.difficulty || 'medium',
            };
            if (q.image_url) entry.imageUrl = q.image_url;
            return entry;
        });
}

const RANKS = [
    { name: 'Bronze', min: 0, max: 999, color: '#cd7f32' },
    { name: 'Silver', min: 1000, max: 1199, color: '#c0c0c0' },
    { name: 'Gold', min: 1200, max: 1399, color: '#ffd700' },
    { name: 'Platinum', min: 1400, max: 1599, color: '#e5e4e2' },
    { name: 'Diamond', min: 1600, max: 1799, color: '#b9f2ff' },
    { name: 'Master', min: 1800, max: 1999, color: '#9b59b6' },
    { name: 'Grandmaster', min: 2000, max: 8999, color: '#e74c3c' },
    { name: 'Final Boss', min: 9000, max: Infinity, color: '#ff4500' },
];

const PRESET_QUESTIONS = {
    'math': {
        name: 'მათემატიკის ეროვნული გამოცდა',
        questions: loadMathPreset(),
    },
    'sat': {
        name: 'SAT',
        questions: loadSATPreset(),
    },
};

const BIO_CHARACTERS = [
    { id: 'default',     label: 'Standard',         description: 'Funny, warm, hype-focused narrator' },
    { id: 'british',     label: 'Critical Brit',     description: 'Critiques your stats in a very proper British manner' },
    { id: 'vader',       label: 'Darth Vader',       description: 'Your academic career, from the dark side' },
    { id: 'shakespeare', label: 'Shakespeare',       description: 'Thy quiz deeds told with dramatic Elizabethan flair' },
    { id: 'ramsay',      label: 'Gordon Ramsay',     description: 'Raw, brutal, painfully honest kitchen feedback' },
    { id: 'sherlock',    label: 'Sherlock Holmes',   description: 'Cold deductive analysis of your performance patterns' },
];

const QUICK_GAME_TOPICS = [
    'General Knowledge', 'Science', 'History', 'Geography',
    'Pop Culture', 'Technology', 'Sports', 'Movies', 'Music', 'Literature',
];

module.exports = { RANKS, PRESET_QUESTIONS, QUICK_GAME_TOPICS, BIO_CHARACTERS };
