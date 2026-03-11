/**
 * @file services/pdfAnalysis.js
 * @description Gemini-powered PDF/image analysis — generates quiz questions from uploaded documents.
 *              Uses pdf-lib for page counting + extraction, Gemini 2.5 Flash for analysis.
 *              Optional Gemini API context caching for cost reduction on reused PDFs.
 */

'use strict';

const { GoogleGenAI } = require('@google/genai');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = 'gemini-2.5-flash';

// In-memory cache name map: pdfId -> gemini cache name (TTL managed by Gemini)
const cacheMap = new Map();

/**
 * Get page count from a PDF buffer using pdf-lib.
 */
async function getPdfPageCount(buffer) {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return pdfDoc.getPageCount();
}

/**
 * Extract specific pages from a PDF buffer. Returns a new PDF buffer with only those pages.
 * @param {Buffer} buffer   - Original PDF bytes
 * @param {number} from     - 1-based start page
 * @param {number} to       - 1-based end page (inclusive)
 * @returns {Promise<Buffer>}
 */
async function extractPages(buffer, from, to) {
    const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();

    // Clamp range
    const start = Math.max(0, from - 1);           // convert to 0-based
    const end = Math.min(totalPages - 1, to - 1);  // convert to 0-based

    const newDoc = await PDFDocument.create();
    const indices = [];
    for (let i = start; i <= end; i++) indices.push(i);

    const copiedPages = await newDoc.copyPages(srcDoc, indices);
    copiedPages.forEach(page => newDoc.addPage(page));

    const pdfBytes = await newDoc.save();
    return Buffer.from(pdfBytes);
}

/**
 * Generate quiz questions from a PDF buffer or image buffer using Gemini.
 * For PDFs with page ranges, only the selected pages are sent to Gemini.
 */
async function generateQuestionsFromFile(fileBuffer, mimeType, fileName, count = 5, userPrompt = '', pdfId = null, pageFrom = 0, pageTo = 0) {
    try {
        // If PDF with a page range, extract only those pages
        let bufferToSend = fileBuffer;
        if (mimeType === 'application/pdf' && pageFrom > 0 && pageTo > 0) {
            const totalPages = await getPdfPageCount(fileBuffer);
            if (pageFrom <= totalPages && pageTo <= totalPages) {
                bufferToSend = await extractPages(fileBuffer, pageFrom, pageTo);
                console.log(`Extracted pages ${pageFrom}-${pageTo} from ${totalPages} total (${bufferToSend.length} bytes)`);
            }
        }

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

        // Write buffer to temp file for Gemini upload
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `qvizio_${randomUUID()}${getExtension(mimeType)}`);
        fs.writeFileSync(tmpFile, bufferToSend);

        try {
            // Upload file to Gemini
            console.log(`Uploading to Gemini: ${fileName} (${bufferToSend.length} bytes, ${mimeType})`);
            const uploadedFile = await ai.files.upload({
                file: tmpFile,
                config: { mimeType },
            });
            console.log(`Gemini file uploaded: ${uploadedFile.name}, uri: ${uploadedFile.uri}`);

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
                            ttl: '3600s',
                        },
                    });
                    if (cache.name) {
                        cacheMap.set(pdfId, cache.name);
                        console.log(`Cache created: ${cache.name}`);
                    }
                } catch (cacheErr) {
                    console.log('Cache creation skipped:', cacheErr.message);
                }
            }

            // Generate content with the uploaded file
            console.log(`Sending generateContent request to ${GEMINI_MODEL}...`);
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

            console.log('Gemini response received, parsing questions...');
            return parseQuestions(response.text, count);
        } finally {
            try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
        }
    } catch (err) {
        console.error('PDF analysis error:', err.message);
        console.error(err.stack);
        return generateFallbackQuestions(count, fileName);
    }
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

module.exports = { generateQuestionsFromFile, getPdfPageCount, extractPages, evictCache };
