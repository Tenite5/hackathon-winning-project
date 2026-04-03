/**
 * @file services/ai.js
 * @description AI clients — Gemini for question generation, Groq for bio + explanation.
 */

'use strict';

const { GoogleGenAI } = require('@google/genai');
const Groq = require('groq-sdk');

// Gemini — used only for question generation
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = 'gemini-2.5-flash';

// Groq — used for bio generation and mistake explanations (fast inference)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = 'llama-3.3-70b-versatile';

/** Race a promise against a timeout — rejects if ms elapses first. */
function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`AI request timed out after ${ms}ms`)), ms)
        ),
    ]);
}

// ── Level-specific question generation prompts ────────────────────────────────
const LEVEL_PROMPTS = {
    1: `You generate Level 1 (Bronze) quiz questions. Rules:
- Questions should test genuine knowledge most educated people might know, but not trivially obvious.
- Ask about real facts, mechanisms, historical events, or scientific concepts — NOT pop trivia like celebrity names.
- Examples of good topics: how vaccines work, why the sky is blue, major historical turning points, basic geography facts people should know.
- Avoid questions like "What color is the sun" or "Who sings [song]". Aim for substance.
- 4 plausible options — one clearly correct, the others believably wrong.`,

    2: `You generate Level 2 (Silver) quiz questions. Rules:
- Questions should require genuine study or curious reading to know.
- Target: things a well-read person knows but a casual person might miss.
- Examples: specific scientific laws, historical causes/effects, geographic facts, how everyday technology works, notable achievements.
- Wrong options must be convincing — not obviously silly.
- Avoid pure trivia. Each answer should teach something real.`,

    3: `You generate Level 3 (Gold) quiz questions. Rules:
- Challenging questions that test solid knowledge. Not obscure, but not easy either.
- Focus on deeper understanding: mechanisms behind events, scientific reasoning, secondary historical facts, nuanced geography.
- A player should feel smart for getting it right.
- All 4 options must be plausible to someone with surface knowledge. Only the genuinely informed gets it right.`,

    4: `You generate Level 4 (Platinum) quiz questions. Rules:
- Hard questions requiring depth of knowledge or analytical thinking.
- Not obscure trivia — but precise knowledge: exact dates/figures only when they matter, mechanisms, cause-and-effect chains, scientific principles.
- Good examples: why a specific war was triggered, how a scientific process differs from a similar one, nuanced geographic/cultural facts.
- The wrong options should be things an educated person would seriously consider.`,

    5: `You generate Level 5 (Diamond/Expert) quiz questions. Rules:
- Expert-level questions. Only people who have deeply studied the topic should know these.
- Target advanced specifics: precise scientific data, obscure but important historical decisions, technical mechanisms, exact terminology.
- Every wrong option should be something a knowledgeable amateur would plausibly choose.
- These questions should make even smart players sweat. But the answer must always be definitively correct — no ambiguity.`,
};

const BASE_FORMAT_INSTRUCTIONS = `
Return ONLY a valid JSON array with no additional text, markdown, or code blocks. Each object must have:
- "question": the question text (clear, unambiguous, ends with "?")
- "options": array of exactly 4 strings — one correct, three plausibly wrong
- "correct": integer index 0-3 of the correct option
- "difficulty": "easy", "medium", or "hard"

Example: [{"question":"What causes the northern lights?","options":["Solar wind hitting atmosphere","Moon reflecting sunlight","Earth's magnetic core glowing","Volcanic gas emissions"],"correct":0,"difficulty":"hard"}]`;

async function _tryGenerateQuestions(topic, count, difficulty, level) {
    const levelPrompt = level && LEVEL_PROMPTS[level] ? LEVEL_PROMPTS[level] : '';
    const difficultyHint = difficulty && !level
        ? ` All questions should be "${difficulty}" difficulty.`
        : '';

    const systemPrompt = levelPrompt
        ? `${levelPrompt}\n\nGenerate exactly ${count} questions about the topic given.${BASE_FORMAT_INSTRUCTIONS}`
        : `You generate engaging quiz questions that test real, valuable knowledge — not useless trivia.${difficultyHint}\nGenerate exactly ${count} questions about the topic given.${BASE_FORMAT_INSTRUCTIONS}`;

    const response = await withTimeout(
        ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: `${systemPrompt}\n\nTopic: ${topic}`,
            config: {
                temperature: 0.65,
                maxOutputTokens: 4096,
            },
        }),
        15000
    );

    const raw = response.text.trim();
    let jsonStr = raw;
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) jsonStr = match[0];
    const questions = JSON.parse(jsonStr);

    // Validate we got real questions, not empty/garbage
    const parsed = questions.slice(0, count).map(q => ({
        question: String(q.question || ''),
        options: Array.isArray(q.options) && q.options.length === 4
            ? q.options.map(String)
            : null,
        correct: (typeof q.correct === 'number' && q.correct >= 0 && q.correct <= 3)
            ? q.correct
            : 0,
        difficulty: q.difficulty || 'medium',
    }));

    // If any question has null options (bad format), reject the whole batch
    if (parsed.some(q => !q.options || !q.question)) {
        throw new Error('AI returned malformed questions');
    }

    return parsed;
}

function isRetryable(err) {
    const msg = (err.message || '').toLowerCase();
    // Never retry on hard errors — model not found, bad request, auth
    if (/404|not found|400|bad request|401|403|invalid api key|api key/.test(msg)) return false;
    return true; // retry on timeouts, network errors, 5xx
}

async function generateQuestions(topic, count = 5, difficulty = null, level = null) {
    // Attempt 1
    try {
        return await _tryGenerateQuestions(topic, count, difficulty, level);
    } catch (err1) {
        console.error('AI generation attempt 1 failed:', err1.message);
        if (!isRetryable(err1)) throw err1; // hard error — don't retry
    }

    // Attempt 2 — only reached for transient errors
    try {
        return await _tryGenerateQuestions(topic, count, difficulty, level);
    } catch (err2) {
        console.error('AI generation attempt 2 failed:', err2.message);
        throw new Error('Failed to generate questions after 2 attempts');
    }
}

const BIO_CHARACTER_PROMPTS = {
    default: `You write creative, funny player bios for a quiz game called QUIZIO. Rules:
- Write 2-3 full sentences that tell a mini story or paint a vivid picture of the player.
- Reference their actual stats and subjects naturally — weave them into the narrative, don't just list them.
- If they're good at something, hype it with flair. If they're bad, roast them with love and humor.
- Use varied vocabulary and vivid descriptions. NEVER use lazy one-word adjectives like "fire", "trash", "mid", "cracked". Instead, describe things creatively.
- If the player has very few or no games played, invent a dramatic mysterious newcomer backstory.
- Output ONLY the bio text. No quotes, no labels, no prefixes.
- Aim for 50-60 words.`,

    british: `You are a distinguished British gentleman of impeccable vocabulary who writes player bios for a quiz game called QUIZIO. Rules:
- Critique or praise the player's stats in a proper, slightly condescending British manner — witty, dry, never rude.
- Use words like "rather", "dreadfully", "one suspects", "frightfully", "I dare say".
- Reference their actual stats and subjects with cutting eloquence.
- Output ONLY the bio text. No quotes, no labels, no prefixes.
- Aim for 50-60 words.`,

    vader: `You are Darth Vader narrating the quiz career of a QUIZIO player. Rules:
- Speak in Vader's voice — imposing, menacing, occasionally grudgingly impressed.
- Reference the Force, the dark side, the Empire, and galactic conquest metaphorically in context of quiz performance.
- Reference their actual stats naturally.
- Output ONLY the bio text. No quotes, no labels, no prefixes.
- Aim for 50-60 words.`,

    shakespeare: `You are William Shakespeare writing a player bio for a quiz game called QUIZIO. Rules:
- Write in a Shakespearean style — dramatic, archaic flair, poetic but readable.
- Use "thee", "thy", "doth", "hath", "forsooth" naturally.
- Reference their actual stats as part of the dramatic narrative.
- Output ONLY the bio text. No quotes, no labels, no prefixes.
- Aim for 50-60 words.`,

    ramsay: `You are Gordon Ramsay rating a QUIZIO player's quiz performance as if it were a dish in your kitchen. Rules:
- Be brutally honest, dramatic, and passionate — the Gordon Ramsay way.
- Use kitchen metaphors ("raw talent", "overcooked", "finally something edible").
- Reference their actual stats in your critique or praise.
- Output ONLY the bio text. No quotes, no labels, no prefixes.
- Aim for 50-60 words.`,

    sherlock: `You are Sherlock Holmes deducing a QUIZIO player's academic and quiz character from their statistics. Rules:
- Write in Sherlock's cold, precise, slightly theatrical deductive style.
- Draw dramatic conclusions from their actual stats as if observing clues.
- Reference subjects, win rates, accuracy as deductions.
- Output ONLY the bio text. No quotes, no labels, no prefixes.
- Aim for 50-60 words.`,
};

async function generateBio(user, character) {
    try {
        if (!user || !user.username) {
            return 'A mysterious competitor with untold powers.';
        }

        const stats = user.stats || {};
        const cats = stats.categories || {};
        const catEntries = Object.entries(cats);

        let subjectBreakdown = '';
        if (catEntries.length > 0) {
            const sorted = [...catEntries].sort((a, b) => {
                const aTotal = (a[1].wins || 0) + (a[1].losses || 0);
                const bTotal = (b[1].wins || 0) + (b[1].losses || 0);
                const aWinRate = aTotal > 0 ? (a[1].wins || 0) / aTotal : 0;
                const bWinRate = bTotal > 0 ? (b[1].wins || 0) / bTotal : 0;
                return bWinRate - aWinRate;
            });
            const strengths = sorted.filter(([, d]) => (d.wins || 0) > (d.losses || 0)).slice(0, 3)
                .map(([cat, d]) => `${cat} (${d.wins || 0}W/${d.losses || 0}L, ${Math.round((d.accuracy || 0) * 100)}% acc)`).join(', ');
            const weaknesses = sorted.filter(([, d]) => (d.losses || 0) >= (d.wins || 0) && ((d.wins || 0) + (d.losses || 0)) > 0).slice(0, 3)
                .map(([cat, d]) => `${cat} (${d.wins || 0}W/${d.losses || 0}L, ${Math.round((d.accuracy || 0) * 100)}% acc)`).join(', ');
            if (strengths || weaknesses) {
                subjectBreakdown = `\nBest subjects: ${strengths || 'None yet'}. Weakest subjects: ${weaknesses || 'None yet'}.`;
            }
        }

        const statsStr = catEntries
            .map(([cat, data]) => `${cat}: ${data.wins || 0}W/${data.losses || 0}L, ${Math.round((data.accuracy || 0) * 100)}% accuracy`)
            .join(', ');

        const totalWins = stats.totalWins || 0;
        const totalLosses = stats.totalLosses || 0;
        const totalGames = totalWins + totalLosses;

        const systemPrompt = BIO_CHARACTER_PROMPTS[character] || BIO_CHARACTER_PROMPTS.default;

        const userPrompt = `Player: "${user.username}"
Elo: ${user.elo || 1000}
Record: ${totalWins}W / ${totalLosses}L (${totalGames} total games)
Correct answers: ${stats.correctAnswers || 0} / ${stats.totalAnswers || 0}${subjectBreakdown}
Category breakdown: ${statsStr || 'No category data yet'}`;

        const response = await groq.chat.completions.create({
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.95,
            max_tokens: 200,
        });

        let bio = (response.choices?.[0]?.message?.content || '').trim();
        // Strip wrapping quotes if the AI added them
        if ((bio.startsWith('"') && bio.endsWith('"')) || (bio.startsWith("'") && bio.endsWith("'"))) {
            bio = bio.slice(1, -1).trim();
        }
        // Strip common prefixes the AI might add
        bio = bio.replace(/^(bio:\s*|here'?s?\s*(the|your)?\s*bio:\s*)/i, '').trim();
        return bio || `${user.username} is a mysterious competitor with untold powers.`;
    } catch (err) {
        console.error('Bio generation error:', err.message);
        return `${user.username} is a mysterious competitor with untold powers.`;
    }
}

async function explainQuestion(question, options, correctIndex, yourAnswerIndex) {
    try {
        const safeCorrectIndex = (typeof correctIndex === 'number' && correctIndex >= 0 && correctIndex < options.length) ? correctIndex : 0;
        const yourAnswer = (yourAnswerIndex >= 0 && yourAnswerIndex < options.length) ? options[yourAnswerIndex] : 'No answer (timed out)';
        const correctAnswer = options[safeCorrectIndex];
        const wasTimeout = yourAnswerIndex < 0;
        correctIndex = safeCorrectIndex;

        const systemPrompt = `You are a sharp, friendly tutor. A player got a quiz question wrong. Your job is to explain the underlying reason WHY the correct answer is right — not just say it is correct. Give the actual fact, mechanism, or logic behind it. If the player chose a wrong answer, briefly say why that option is incorrect.

Rules:
- Keep it under 40 words. Shorter is better.
- Focus on teaching the concept, not just naming the answer.
- Be warm and encouraging.
- Output ONLY the explanation text, no labels or formatting.`;

        const userPrompt = `Question: "${question}"
Choices: ${options.map((o, i) => `[${i}] ${o}`).join(' | ')}
Correct: [${correctIndex}] "${correctAnswer}"
Player: ${wasTimeout ? 'Timed out' : `[${yourAnswerIndex}] "${yourAnswer}"`}`;

        const response = await groq.chat.completions.create({
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.5,
        });

        return (response.choices?.[0]?.message?.content || '').trim();
    } catch (err) {
        console.error('Explain error:', err.message);
        const safeIdx = (typeof correctIndex === 'number' && correctIndex >= 0 && correctIndex < options.length) ? correctIndex : 0;
        return `The correct answer is "${options[safeIdx]}". Unfortunately I couldn't generate a detailed explanation right now. Try again later!`;
    }
}



async function superExplainQuestion(question, options, correctIndex, yourAnswerIndex) {
    try {
        const safeCorrectIndex = (typeof correctIndex === 'number' && correctIndex >= 0 && correctIndex < options.length) ? correctIndex : 0;
        const yourAnswer = (yourAnswerIndex >= 0 && yourAnswerIndex < options.length) ? options[yourAnswerIndex] : 'No answer (timed out)';
        const correctAnswer = options[safeCorrectIndex];
        const wasTimeout = yourAnswerIndex < 0;

        const prompt = `A student got a quiz question wrong. Give a rich, academic explanation of about 80-120 words. Include:
1. WHY the correct answer is right (the underlying concept or mechanism)
2. A memory hook to help them remember it
3. Why the wrong answer seems plausible but isn't

Question: "${question}"
Choices: ${options.map((o, i) => `[${i}] ${o}`).join(' | ')}
Correct: [${safeCorrectIndex}] "${correctAnswer}"
Student answered: ${wasTimeout ? 'Timed out (no answer)' : `[${yourAnswerIndex}] "${yourAnswer}"`}

Output ONLY the explanation. No labels, no formatting.`;

        const response = await withTimeout(
            ai.models.generateContent({
                model: GEMINI_MODEL,
                contents: prompt,
                config: { temperature: 0.4 },
            }),
            15000
        );

        return (response.text || '').trim();
    } catch (err) {
        console.error('Super explain error:', err.message);
        const safeIdx = (typeof correctIndex === 'number' && correctIndex >= 0 && correctIndex < options.length) ? correctIndex : 0;
        return `The correct answer is "${options[safeIdx]}". Super Explain is temporarily unavailable — try Simple Explain instead.`;
    }
}

async function generateRedemptionQuestions(wrongAnswers, count = 10) {
    const topicSummary = wrongAnswers.map(q =>
        `- Topic: ${q.topic || 'General'} | Q: "${q.question}" | Correct: "${q.correctAnswer}"`
    ).join('\n');

    const systemPrompt = `You generate "redemption" quiz questions for a player who got certain questions wrong. Your job is to create NEW questions that test the SAME concepts and knowledge areas — but are NOT the exact same questions.

Rules:
- Analyze the topics and concepts behind the wrong answers provided.
- Generate ${count} NEW, DIFFERENT questions that test similar knowledge from the same domains.
- Questions should help the player strengthen their weak areas.
- Mix difficulty: some slightly easier (to build confidence), some at the same level.
- 4 plausible options each — one correct, three convincingly wrong.
- Do NOT repeat any of the original questions verbatim.
${BASE_FORMAT_INSTRUCTIONS}`;

    const userPrompt = `The player got these questions wrong:\n${topicSummary}\n\nGenerate ${count} new questions covering these same knowledge areas.`;

    // Use the same retry pattern as generateQuestions
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await withTimeout(
                ai.models.generateContent({
                    model: GEMINI_MODEL,
                    contents: `${systemPrompt}\n\n${userPrompt}`,
                    config: { temperature: 0.65, maxOutputTokens: 4096 },
                }),
                15000
            );

            const raw = response.text.trim();
            let jsonStr = raw;
            const match = raw.match(/\[[\s\S]*\]/);
            if (match) jsonStr = match[0];
            const questions = JSON.parse(jsonStr);

            const parsed = questions.slice(0, count).map(q => ({
                question: String(q.question || ''),
                options: Array.isArray(q.options) && q.options.length === 4
                    ? q.options.map(String) : null,
                correct: (typeof q.correct === 'number' && q.correct >= 0 && q.correct <= 3)
                    ? q.correct : 0,
                difficulty: q.difficulty || 'medium',
            }));

            if (parsed.some(q => !q.options || !q.question)) {
                throw new Error('AI returned malformed redemption questions');
            }
            return parsed;
        } catch (err) {
            console.error(`Redemption generation attempt ${attempt + 1} failed:`, err.message);
            if (!isRetryable(err) || attempt === 1) throw new Error('Failed to generate redemption questions: ' + err.message);
        }
    }
}

/**
 * Filter preset questions by keyword matching (no AI call — instant and free).
 * Checks question text, options, and metadata fields (_questionType, _subject).
 * Returns array of matching indices sorted by relevance score (best first).
 */
function filterQuestionsByKeyword(questions, query, maxResults = 30) {
    if (!questions || !questions.length || !query) return [];

    const queryLower = query.toLowerCase().trim();
    const words = queryLower.split(/\s+/).filter(w => w.length > 1);
    if (!words.length) return [];

    // Common synonyms/aliases to expand search coverage
    const ALIASES = {
        'grammar': ['conventions', 'english conventions', 'standard english', 'sentence structure', 'punctuation'],
        'vocabulary': ['craft and structure', 'word meaning', 'most nearly mean', 'context clues'],
        'reading': ['information and ideas', 'passage', 'comprehension', 'inference'],
        'writing': ['expression of ideas', 'craft and structure', 'conventions'],
        'algebra': ['equation', 'variable', 'solve for', 'linear', 'quadratic', 'polynomial'],
        'geometry': ['triangle', 'circle', 'angle', 'area', 'perimeter', 'volume', 'trigonometry'],
        'trig': ['trigonometry', 'sine', 'cosine', 'tangent', 'angle'],
        'trigonometry': ['sine', 'cosine', 'tangent', 'angle', 'geometry and trigonometry'],
        'statistics': ['data analysis', 'probability', 'mean', 'median', 'problem solving'],
        'data': ['data analysis', 'statistics', 'graph', 'table', 'chart', 'problem solving'],
        'fractions': ['1/', '2/', '3/', '4/', '5/'],
    };

    // Expand search terms with aliases
    const expandedTerms = [...words];
    for (const word of words) {
        if (ALIASES[word]) expandedTerms.push(...ALIASES[word]);
    }
    // Also check the full phrase as an alias key
    if (ALIASES[queryLower]) expandedTerms.push(...ALIASES[queryLower]);

    const scored = [];

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        // Build a searchable string from all available fields
        const parts = [
            q.question || '',
            (q.options || []).join(' '),
            q._questionType || '',
            q._subject || '',
        ];
        const haystack = parts.join(' ').toLowerCase();

        let score = 0;

        // Exact full-phrase match gets highest boost
        if (haystack.includes(queryLower)) {
            score += 10;
        }

        // Score individual search words + expanded aliases
        for (const term of expandedTerms) {
            if (haystack.includes(term)) {
                score += term.length > 3 ? 2 : 1; // longer matches score higher
            }
        }

        if (score > 0) {
            scored.push({ index: i, score });
        }
    }

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map(s => s.index);
}

module.exports = { generateQuestions, generateRedemptionQuestions, generateBio, explainQuestion, superExplainQuestion, filterQuestionsByKeyword };
