/**
 * @file routes/questions.js
 * @description Wrong-answer log and AI explanation routes.
 */

'use strict';

const { Router } = require('express');
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');
const { explainQuestion, superExplainQuestion, generateRedemptionQuestions } = require('../services/ai');
const { validateInt } = require('../middleware/validate');
const { checkDailyLimit, incrementDailyLimit } = require('../middleware/dailyLimits');
const { checkAIRateLimit } = require('../middleware/rateLimit');

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

// Redemption Quiz — generate new questions based on past wrong answers
router.post('/redemption-quiz', requireAuth, async (req, res) => {
    const { count, questionCount, timeLimit } = req.body;

    const wrongQuestions = db.wrongAnswers.get(req.user.id) || [];
    if (wrongQuestions.length === 0) {
        return res.status(400).json({ error: 'No wrong answers to redeem. Play some games first!' });
    }

    // Determine which wrong answers to use
    let source;
    if (count === 'all' || !count) {
        source = wrongQuestions;
    } else {
        const n = validateInt(count, 1, 100, 10);
        // Sort by most recent first, take N
        const sorted = [...wrongQuestions].sort((a, b) => b.playedAt - a.playedAt);
        source = sorted.slice(0, n);
    }

    const qCount = validateInt(questionCount, 5, 20, 10);
    const tLimit = validateInt(timeLimit, 5, 30, 15);

    // Check daily AI gen limit
    const user = db.users.get(req.user.id);
    const dailyRl = checkDailyLimit(req.user.id, user?.isDiamondPro, 'aiGen');
    if (dailyRl.limited) {
        const msg = user?.isDiamondPro
            ? 'You\'ve reached your 60 daily AI game generations. Resets tomorrow.'
            : `Free accounts get 15 AI game generations per day (${dailyRl.remaining} remaining). Upgrade to Diamond Pro for 60.`;
        return res.status(429).json({ error: 'daily_limit', message: msg });
    }

    // Check AI rate limit
    const rl = checkAIRateLimit(req.user.id);
    if (rl.limited) {
        const msg = rl.reason === 'global'
            ? 'Server is busy — too many games being generated right now. Try again in a few minutes.'
            : 'You\'ve generated too many games recently. Please wait a couple of minutes.';
        return res.status(429).json({ error: 'rate_limit', message: msg });
    }

    try {
        const questions = await generateRedemptionQuestions(source, qCount);
        incrementDailyLimit(req.user.id, 'aiGen');
        res.json({ questions, timeLimit: tLimit, topic: 'Redemption Quiz' });
    } catch (err) {
        console.error('Redemption quiz generation failed:', err.message);
        res.status(500).json({ error: 'Failed to generate redemption questions. Please try again.' });
    }
});

module.exports = router;
