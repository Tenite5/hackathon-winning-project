/**
 * @file services/pdfAnalysis.js
 * @description Gemini-powered PDF/image analysis — generates quiz questions from uploaded documents.
 *              Uses Gemini API file uploads + optional context caching for cost reduction.
 */

'use strict';

const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = 'gemini-2.0-flash';

// In-memory cache name map: pdfId -> gemini cache name (TTL managed by Gemini)
const cacheMap = new Map();

/**
 * Generate quiz questions from a PDF buffer or image buffer using Gemini.
 * @param {Buffer} fileBuffer   - The file data (PDF or image)
 * @param {string} mimeType     - e.g. 'application/pdf' or 'image/png'
 * @param {string} fileName     - Original file name
 * @param {number} count        - Number of questions to generate
 * @param {string} [userPrompt] - Optional extra instructions from user
 * @param {string} [pdfId]      - If provided, try to use/create a Gemini cache
 * @returns {Promise<Array>}    - Array of question objects
 */
async function generateQuestionsFromFile(fileBuffer, mimeType, fileName, count = 5, userPrompt = '', pdfId = null) {
    try {
        const systemPrompt = `You are a question generator. Analyze the provided document/image thoroughly and generate exactly ${count} quiz questions based on its content.${userPrompt ? `\n\nAdditional instructions from the user: ${userPrompt}` : ''}

Return ONLY a valid JSON array with no additional text, markdown, or code blocks. Each object must have:
- "question": the question text
- "options": array of exactly 4 answer strings
- "correct": index (0-3) of the correct answer
- "difficulty": "easy", "medium", or "hard"

Example format: [{"question":"...","options":["A","B","C","D"],"correct":0,"difficulty":"medium"}]`;

        // Try cached content path first
        if (pdfId && cacheMap.has(pdfId)) {
            try {
                const cacheName = cacheMap.get(pdfId);
                const response = await ai.models.generateContent({
                    model: GEMINI_MODEL,
                    contents: systemPrompt,
                    config: {
                        cachedContent: cacheName,
                        temperature: 0.6,
                        maxOutputTokens: 8192,
                    },
                });
                return parseQuestions(response.text, count);
            } catch (cacheErr) {
                console.log('Cache miss or expired, falling back to direct upload:', cacheErr.message);
                cacheMap.delete(pdfId);
            }
        }

        // Write buffer to temp file for upload
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `qvizio_${randomUUID()}${getExtension(mimeType)}`);
        fs.writeFileSync(tmpFile, fileBuffer);

        try {
            // Upload file to Gemini
            const uploadedFile = await ai.files.upload({
                file: tmpFile,
                config: { mimeType },
            });

            // Try creating a cache for reuse (only for PDFs, not small images)
            if (pdfId && mimeType === 'application/pdf') {
                try {
                    const cache = await ai.caches.create({
                        model: GEMINI_MODEL,
                        config: {
                            contents: [{
                                role: 'user',
                                parts: [{ fileData: { fileUri: uploadedFile.uri, mimeType } }],
                            }],
                            displayName: `qvizio-pdf-${pdfId}`,
                            ttl: '3600s', // 1 hour TTL
                        },
                    });
                    if (cache.name) {
                        cacheMap.set(pdfId, cache.name);
                    }
                } catch (cacheErr) {
                    // Caching is optional — continue without it
                    console.log('Cache creation skipped:', cacheErr.message);
                }
            }

            // Generate content with the uploaded file
            const response = await ai.models.generateContent({
                model: GEMINI_MODEL,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { fileData: { fileUri: uploadedFile.uri, mimeType } },
                            { text: systemPrompt },
                        ],
                    },
                ],
                config: {
                    temperature: 0.6,
                    maxOutputTokens: 8192,
                },
            });

            return parseQuestions(response.text, count);
        } finally {
            // Clean up temp file
            try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
        }
    } catch (err) {
        console.error('PDF analysis error:', err.message);
        return generateFallbackQuestions(count, fileName);
    }
}

/**
 * Get page count from a PDF buffer using pdf-parse.
 */
async function getPdfPageCount(buffer) {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.numpages;
}

function parseQuestions(rawText, count) {
    const raw = rawText.trim();
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
}

function generateFallbackQuestions(count, fileName) {
    return Array.from({ length: count }, (_, i) => ({
        question: `Sample question ${i + 1} from ${fileName}?`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correct: 0,
        difficulty: 'medium',
    }));
}

function getExtension(mime) {
    const map = {
        'application/pdf': '.pdf',
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp',
        'image/gif': '.gif',
    };
    return map[mime] || '.bin';
}

/** Evict a cached content entry when a PDF is deleted */
function evictCache(pdfId) {
    const cacheName = cacheMap.get(pdfId);
    if (cacheName) {
        ai.caches.delete({ name: cacheName }).catch(() => {});
        cacheMap.delete(pdfId);
    }
}

module.exports = { generateQuestionsFromFile, getPdfPageCount, evictCache };
