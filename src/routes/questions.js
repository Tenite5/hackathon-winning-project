/**
 * @file routes/questions.js
 * @description Wrong-answer log and AI explanation routes.
 */

'use strict';

const { Router } = require('express');
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');
const { explainQuestion } = require('../services/ai');

const router = Router();

router.get('/question-log', requireAuth, (req, res) => {
    const wrongQuestions = db.wrongAnswers.get(req.user.id) || [];
    wrongQuestions.sort((a, b) => b.playedAt - a.playedAt);
    res.json({ wrongQuestions });
});

router.post('/explain-question', requireAuth, async (req, res) => {
    const { question, options, correctIndex, yourAnswerIndex } = req.body;
    if (!question || !options) return res.status(400).json({ error: 'Missing data' });

    const explanation = await explainQuestion(question, options, correctIndex, yourAnswerIndex);
    res.json({ explanation });
});

module.exports = router;
