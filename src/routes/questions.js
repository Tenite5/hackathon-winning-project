/**
 * @file routes/questions.js
 * @description Wrong-answer log and AI explanation routes.
 */

'use strict';

const { Router } = require('express');
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');
const { explainQuestion } = require('../services/ai');
const { validateInt } = require('../middleware/validate');

const router = Router();

router.get('/question-log', requireAuth, (req, res) => {
    const wrongQuestions = db.wrongAnswers.get(req.user.id) || [];
    wrongQuestions.sort((a, b) => b.playedAt - a.playedAt);
    res.json({ wrongQuestions });
});

router.post('/explain-question', requireAuth, async (req, res) => {
    const { question, options, correctIndex, yourAnswerIndex } = req.body;
    if (!question || typeof question !== 'string') return res.status(400).json({ error: 'Invalid question' });
    if (!Array.isArray(options) || options.length < 2 || options.length > 6) return res.status(400).json({ error: 'Invalid options' });

    // Validate indices
    const validCorrectIndex = validateInt(correctIndex, 0, options.length - 1, -1);
    const validYourAnswerIndex = validateInt(yourAnswerIndex, -1, options.length - 1, -1);
    if (validCorrectIndex < 0) return res.status(400).json({ error: 'Invalid correctIndex' });

    // Sanitize option strings
    const cleanOptions = options.map(o => typeof o === 'string' ? o.slice(0, 500) : String(o).slice(0, 500));
    const cleanQuestion = question.slice(0, 1000);

    const explanation = await explainQuestion(cleanQuestion, cleanOptions, validCorrectIndex, validYourAnswerIndex);
    res.json({ explanation });
});

module.exports = router;
