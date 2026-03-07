/**
 * @file services/ai.js
 * @description Google Gemini AI client — question generation, bio generation, and question explanation.
 *              Uses the new @google/genai SDK with gemini-3-flash-preview model.
 */

'use strict';

const { GoogleGenAI } = require('@google/genai');

// The new SDK uses a Client pattern — pass the API key on construction.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = 'gemini-3-flash-preview';

async function generateQuestions(topic, count = 5, difficulty = null) {
    try {
        const difficultyHint = difficulty
            ? ` All questions should be "${difficulty}" difficulty level.`
            : '';

        const systemPrompt = `You are a question generator. Generate exactly ${count} questions/problems about the inputted thing.${difficultyHint}
Return ONLY a valid JSON array with no additional text, markdown, or code blocks. Each object must have:
- "question": the question text
- "options": array of exactly 4 answer strings
- "correct": index (0-3) of the correct answer
- "difficulty": "easy", "medium", or "hard"

Example format: [{"question":"...","options":["A","B","C","D"],"correct":0,"difficulty":"medium"}]`;

        const response = await ai.models.generateContent({
            model: MODEL,
            contents: `${systemPrompt}\n\nGenerate ${count} questions/problems about: ${topic}`,
            config: {
                temperature: 0.6,
                maxOutputTokens: 4096,
            },
        });

        const raw = response.text.trim();
        let jsonStr = raw;
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) jsonStr = match[0];
        const questions = JSON.parse(jsonStr);
        return questions.slice(0, count).map(q => ({
            question: q.question,
            options: q.options,
            correct: q.correct,
            difficulty: q.difficulty || 'medium',
        }));
    } catch (err) {
        console.error('AI generation error:', err.message);
        return Array.from({ length: count }, (_, i) => ({
            question: `Sample question ${i + 1} about ${topic}?`,
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correct: 0,
            difficulty: difficulty || 'medium',
        }));
    }
}

async function generateBio(user) {
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

        const systemPrompt = `You write short, witty, roast/boast player bios for a quiz game called QVIZIO. Rules:
- If the player has strong subjects, hype them up. If they have weak subjects, lovingly roast them.
- If the player has very few or no games played, write a short "newcomer" bio instead of making up stats.
- Be funny, specific, and use casual internet language.
- Output ONLY the bio text as plain text. No quotes around it, no labels, no prefixes like "Bio:" or "Here's".
- Do NOT wrap the output in quotation marks.
- STRICT LIMIT: 2-3 sentences, 80 words maximum.`;

        const userPrompt = `Player: "${user.username}"
Elo: ${user.elo || 1000}
Record: ${totalWins}W / ${totalLosses}L (${totalGames} total games)
Correct answers: ${stats.correctAnswers || 0} / ${stats.totalAnswers || 0}${subjectBreakdown}
Category breakdown: ${statsStr || 'No category data yet'}`;

        const response = await ai.models.generateContent({
            model: MODEL,
            contents: `${systemPrompt}\n\n${userPrompt}`,
            config: {
                temperature: 0.85,
                maxOutputTokens: 600,
            },
        });

        let bio = (response.text || '').trim();
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
        const yourAnswer = yourAnswerIndex >= 0 ? options[yourAnswerIndex] : 'No answer (timed out)';
        const correctAnswer = options[correctIndex];
        const wasTimeout = yourAnswerIndex < 0;

        const systemPrompt = `You are a friendly, knowledgeable tutor. A player got a question wrong in a quiz game. Your job:
1. Briefly explain WHY the correct answer is right (1-2 sentences with a key fact).
2. ${wasTimeout ? 'The player ran out of time, so just encourage them.' : 'Explain why their chosen answer is wrong (1 sentence).'}
3. End with a short encouraging note.

Rules:
- Be concise: 3-4 sentences total.
- Use simple, clear language.
- Be warm and encouraging, never condescending.
- Output ONLY the explanation text, no labels or formatting.`;

        const userPrompt = `Question: "${question}"
Answer choices: ${options.map((o, i) => `[${i}] ${o}`).join(' | ')}
Correct answer: [${correctIndex}] "${correctAnswer}"
Player's answer: ${wasTimeout ? 'Timed out (no answer)' : `[${yourAnswerIndex}] "${yourAnswer}"`}`;

        const response = await ai.models.generateContent({
            model: MODEL,
            contents: `${systemPrompt}\n\n${userPrompt}`,
            config: {
                temperature: 0.5,
                maxOutputTokens: 500,
            },
        });

        return response.text.trim();
    } catch (err) {
        console.error('Explain error:', err.message);
        return `The correct answer is "${options[correctIndex]}". Unfortunately I couldn't generate a detailed explanation right now. Try again later!`;
    }
}

// ── Batch explain multiple questions at once for the mistakes analyzer ──
async function explainQuestionsBatch(questions) {
    try {
        if (!questions || questions.length === 0) return [];

        // Limit batch size to 10
        const batch = questions.slice(0, 10);

        const questionsBlock = batch.map((q, i) => {
            const yourAnswer = q.yourAnswerIndex >= 0 ? q.options[q.yourAnswerIndex] : 'No answer (timed out)';
            const correctAnswer = q.options[q.correctIndex];
            return `[Q${i + 1}] Question: "${q.question}"
Options: ${q.options.map((o, j) => `[${j}] ${o}`).join(' | ')}
Correct: [${q.correctIndex}] "${correctAnswer}"
Player answered: ${q.yourAnswerIndex < 0 ? 'Timed out' : `[${q.yourAnswerIndex}] "${yourAnswer}"`}`;
        }).join('\n\n');

        const systemPrompt = `You are a friendly, knowledgeable tutor. A player got multiple questions wrong in a quiz game. For EACH question:
1. Briefly explain WHY the correct answer is right (1-2 sentences).
2. If the player chose a wrong answer, explain why it's wrong (1 sentence). If they timed out, encourage them.
3. End each with a short encouraging note.

Rules:
- Be concise: 3-4 sentences per question.
- Use simple, clear language. Be warm and encouraging.
- Output as a JSON array of strings, one explanation per question, in order.
- Output ONLY the JSON array, no markdown or code blocks.`;

        const response = await ai.models.generateContent({
            model: MODEL,
            contents: `${systemPrompt}\n\n${questionsBlock}`,
            config: {
                temperature: 0.5,
                maxOutputTokens: 3000,
            },
        });

        const raw = response.text.trim();
        let jsonStr = raw;
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) jsonStr = match[0];
        const explanations = JSON.parse(jsonStr);
        return explanations.slice(0, batch.length);
    } catch (err) {
        console.error('Batch explain error:', err.message);
        return questions.map(q => `The correct answer is "${q.options[q.correctIndex]}". Unfortunately I couldn't generate a detailed explanation right now.`);
    }
}

module.exports = { generateQuestions, generateBio, explainQuestion, explainQuestionsBatch };
