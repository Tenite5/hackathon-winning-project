/**
 * @file routes/questions.js
 * @description Wrong-answer log and AI explanation routes.
 */

'use strict';

const { Router } = require('express');
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');
const { explainQuestion, superExplainQuestion } = require('../services/ai');
const { validateInt } = require('../middleware/validate');
const { checkDailyLimit, incrementDailyLimit } = require('../middleware/dailyLimits');

const router = Router();

router.get('/question-log', requireAuth, (req, res) => {
    const wrongQuestions = db.wrongAnswers.get(req.user.id) || [];
    wrongQuestions.sort((a, b) => b.playedAt - a.playedAt);
    res.json({ wrongQuestions });
});

// Simple Explain (all users, Groq, 43 words max)
router.post('/explain-question', requireAuth, async (req, res) => {
    const { question, options, correctIndex, yourAnswerIndex } = req.body;
    if (!question || typeof question !== 'string') return res.status(400).json({ error: 'Invalid question' });
    if (!Array.isArray(options) || options.length < 2 || options.length > 6) return res.status(400).json({ error: 'Invalid options' });

    const user = db.users.get(req.user.id);
    const rl = checkDailyLimit(req.user.id, user?.isDiamondPro, 'explain');
    if (rl.limited) {
        return res.status(429).json({
            error: 'daily_limit',
            message: user?.isDiamondPro
                ? `You've used all 200 daily explanations. Resets tomorrow.`
                : `Free accounts get 10 explanations per day. Upgrade to Diamond Pro for 200. (${rl.remaining} remaining)`,
        });
    }

    const validCorrectIndex = validateInt(correctIndex, 0, options.length - 1, -1);
    const validYourAnswerIndex = validateInt(yourAnswerIndex, -1, options.length - 1, -1);
    if (validCorrectIndex < 0) return res.status(400).json({ error: 'Invalid correctIndex' });

    const cleanOptions = options.map(o => typeof o === 'string' ? o.slice(0, 500) : String(o).slice(0, 500));
    const cleanQuestion = question.slice(0, 1000);

    const explanation = await explainQuestion(cleanQuestion, cleanOptions, validCorrectIndex, validYourAnswerIndex);
    incrementDailyLimit(req.user.id, 'explain');
    res.json({ explanation });
});

// Super Explain (Diamond Pro only, Gemini, ~60 words)
router.post('/super-explain-question', requireAuth, async (req, res) => {
    const user = db.users.get(req.user.id);
    if (!user?.isDiamondPro) {
        return res.status(403).json({ error: 'diamond_required', message: 'Super Explain is a Diamond Pro feature. Upgrade to unlock!' });
    }

    const { question, options, correctIndex, yourAnswerIndex } = req.body;
    if (!question || typeof question !== 'string') return res.status(400).json({ error: 'Invalid question' });
    if (!Array.isArray(options) || options.length < 2 || options.length > 6) return res.status(400).json({ error: 'Invalid options' });

    const rl = checkDailyLimit(req.user.id, true, 'explain');
    if (rl.limited) {
        return res.status(429).json({
            error: 'daily_limit',
            message: `You've used all 200 daily explanations. Resets tomorrow.`,
        });
    }

    const validCorrectIndex = validateInt(correctIndex, 0, options.length - 1, -1);
    const validYourAnswerIndex = validateInt(yourAnswerIndex, -1, options.length - 1, -1);
    if (validCorrectIndex < 0) return res.status(400).json({ error: 'Invalid correctIndex' });

    const cleanOptions = options.map(o => typeof o === 'string' ? o.slice(0, 500) : String(o).slice(0, 500));
    const cleanQuestion = question.slice(0, 1000);

    const explanation = await superExplainQuestion(cleanQuestion, cleanOptions, validCorrectIndex, validYourAnswerIndex);
    incrementDailyLimit(req.user.id, 'explain');
    res.json({ explanation });
});

module.exports = router;
