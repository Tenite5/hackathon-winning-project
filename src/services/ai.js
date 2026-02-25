/**
 * @file services/ai.js
 * @description Google Gemini AI client — question generation, bio generation, and question explanation.
 */

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateQuestions(topic, count = 5, difficulty = null) {
    try {
        const difficultyHint = difficulty
            ? ` All questions should be "${difficulty}" difficulty level.`
            : '';

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const systemPrompt = `You are a trivia question generator. Generate exactly ${count} trivia questions about the given topic.${difficultyHint}
Return ONLY a valid JSON array with no additional text, markdown, or code blocks. Each object must have:
- "question": the question text
- "options": array of exactly 4 answer strings
- "correct": index (0-3) of the correct answer
- "difficulty": "easy", "medium", or "hard"
- "explanation": a 1-2 sentence explanation of why the correct answer is correct

Example format: [{"question":"...","options":["A","B","C","D"],"correct":0,"difficulty":"medium","explanation":"..."}]`;

        const result = await model.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `${systemPrompt}\n\nGenerate ${count} trivia questions about: ${topic}` }],
                },
            ],
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 4096,
            },
        });

        const raw = result.response.text().trim();
        let jsonStr = raw;
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) jsonStr = match[0];
        const questions = JSON.parse(jsonStr);
        return questions.slice(0, count).map(q => ({
            ...q,
            explanation: q.explanation || 'No explanation available.',
        }));
    } catch (err) {
        console.error('AI generation error:', err.message);
        return Array.from({ length: count }, (_, i) => ({
            question: `Sample question ${i + 1} about ${topic}?`,
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correct: 0,
            difficulty: difficulty || 'medium',
            explanation: 'This is a sample question.',
        }));
    }
}

async function generateBio(user) {
    try {
        const stats = user.stats;
        const cats = stats.categories || {};
        const catEntries = Object.entries(cats);

        let subjectBreakdown = '';
        if (catEntries.length > 0) {
            const sorted = catEntries.sort((a, b) => {
                const aWinRate = a[1].wins / (a[1].wins + a[1].losses || 1);
                const bWinRate = b[1].wins / (b[1].wins + b[1].losses || 1);
                return bWinRate - aWinRate;
            });
            const strengths = sorted.filter(([, d]) => d.wins > d.losses).slice(0, 3)
                .map(([cat, d]) => `${cat} (${d.wins}W/${d.losses}L, ${Math.round(d.accuracy * 100)}% acc)`).join(', ');
            const weaknesses = sorted.filter(([, d]) => d.losses >= d.wins).slice(-3)
                .map(([cat, d]) => `${cat} (${d.wins}W/${d.losses}L, ${Math.round(d.accuracy * 100)}% acc)`).join(', ');
            subjectBreakdown = `\nBest subjects: ${strengths || 'None yet'}. Worst subjects: ${weaknesses || 'None yet'}.`;
        }

        const statsStr = catEntries
            .map(([cat, data]) => `${cat}: ${data.wins}W/${data.losses}L, ${Math.round(data.accuracy * 100)}% accuracy`)
            .join(', ');

        const systemPrompt = `You write short, witty, roast/boast bios for trivia players. Focus heavily on their SPECIFIC subject strengths and weaknesses. If they dominate a subject, brag about it. If they're bad at a subject, roast them for it. Be funny, specific, and use casual internet language. STRICT LIMIT: 100 words maximum.`;

        const userPrompt = `Write a bio for "${user.username}" with Elo ${user.elo}, ${stats.totalWins || 0} wins, ${stats.totalLosses || 0} losses.${subjectBreakdown}\nAll categories: ${statsStr || 'No category data yet'}. Total questions answered correctly: ${stats.correctAnswers || 0}/${stats.totalAnswers || 0}.`;

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const result = await model.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
                },
            ],
            generationConfig: {
                temperature: 1.0,
                maxOutputTokens: 150,
            },
        });

        return result.response.text().trim();
    } catch (err) {
        console.error('Bio generation error:', err.message);
        return `${user.username} is a mysterious competitor with untold trivia powers.`;
    }
}

async function explainQuestion(question, options, correctIndex, yourAnswerIndex) {
    try {
        const yourAnswer = yourAnswerIndex >= 0 ? options[yourAnswerIndex] : 'No answer (timed out)';
        const correctAnswer = options[correctIndex];

        const systemPrompt = `You are a friendly, knowledgeable tutor. A trivia player got a question wrong. Explain WHY the correct answer is right in a clear, educational, and slightly encouraging way. Also explain why the wrong answer they chose is incorrect. Keep it concise (2-4 sentences). Use simple language. Be helpful, not condescending.`;

        const userPrompt = `Question: "${question}"\nOptions: ${options.map((o, i) => `${i === correctIndex ? '✓' : '✗'} ${o}`).join(', ')}\nCorrect answer: "${correctAnswer}"\nPlayer answered: "${yourAnswer}"\n\nExplain why the correct answer is right and why the player's answer was wrong.`;

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const result = await model.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
                },
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 200,
            },
        });

        return result.response.text().trim();
    } catch (err) {
        console.error('Explain error:', err.message);
        return `The correct answer is "${options[correctIndex]}". Unfortunately I couldn't generate a detailed explanation right now. Try again later!`;
    }
}

module.exports = { generateQuestions, generateBio, explainQuestion };
