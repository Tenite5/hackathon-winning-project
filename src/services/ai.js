/**
 * @file services/ai.js
 * @description AI clients — Gemini for question generation, Groq for bio + explanation.
 */

'use strict';

const { GoogleGenAI } = require('@google/genai');
const Groq = require('groq-sdk');

// Gemini — used only for question generation
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = 'gemini-3-flash-preview';

// Groq — used for bio generation and mistake explanations (fast inference)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = 'llama-3.3-70b-versatile';

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
            model: GEMINI_MODEL,
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

        const systemPrompt = `You write creative, funny player bios for a quiz game called QVIZIO. Rules:
- Write 2-3 full sentences that tell a mini story or paint a vivid picture of the player.
- Reference their actual stats and subjects naturally — weave them into the narrative, don't just list them.
- If they're good at something, hype it with flair. If they're bad, roast them with love and humor.
- Use varied vocabulary and vivid descriptions. NEVER use lazy one-word adjectives like "fire", "trash", "mid", "cracked". Instead, describe things creatively.
- If the player has very few or no games played, invent a dramatic mysterious newcomer backstory.
- Output ONLY the bio text. No quotes, no labels, no prefixes.
- Aim for 50-60 words.`;

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
        const yourAnswer = yourAnswerIndex >= 0 ? options[yourAnswerIndex] : 'No answer (timed out)';
        const correctAnswer = options[correctIndex];
        const wasTimeout = yourAnswerIndex < 0;

        const systemPrompt = `You are a sharp, friendly tutor. A player got a quiz question wrong. Your job is to explain the underlying reason WHY the correct answer is right — not just say it is correct. Give the actual fact, mechanism, or logic behind it. If the player chose a wrong answer, briefly say why that option is incorrect.

Rules:
- STRICT LIMIT: Maximum 43 words. Do NOT exceed 43 words.
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
            max_tokens: 200,
        });

        return (response.choices?.[0]?.message?.content || '').trim();
    } catch (err) {
        console.error('Explain error:', err.message);
        return `The correct answer is "${options[correctIndex]}". Unfortunately I couldn't generate a detailed explanation right now. Try again later!`;
    }
}



module.exports = { generateQuestions, generateBio, explainQuestion };
