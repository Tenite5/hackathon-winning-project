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
const GEMINI_MODEL = 'gemini-2.0-flash';

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

        const userInstructions = userPrompt ? `\n\nAdditional focus from the user: ${userPrompt}` : '';

        const systemPrompt = `You are an expert quiz generator. You have been given a document. Read its text, tables, diagrams, formulas, and figures carefully.

First, determine the subject type of the document:

**If the document is STEM (math, physics, chemistry, engineering, CS, etc.):**
- Do NOT just ask "what is the formula for X?" — instead, create actual PROBLEMS that require applying the concepts.
- Generate computational questions where the student must solve something: calculate a value, simplify an expression, find an unknown, predict an outcome, or apply a theorem step-by-step.
- Use specific numbers from the document (constants, coefficients, example values) as inputs for new problems the student hasn't seen.
- Vary difficulty: some straightforward single-step calculations, some multi-step problems that combine concepts from the document.
- For example, if the document teaches logarithms: don't ask "What is the log rule for products?" — instead ask "Solve: log₂(32) + log₂(8) = ?" with numerical answer choices.

**If the document is non-STEM (history, literature, law, social science, etc.):**
- Ask questions that test real understanding — not just surface-level "what year did X happen?" but questions that connect causes to effects, compare events, or require inference from the context.
- Reference specific details: exact names, dates, quoted phrases, statistics, treaty names, court decisions, or table values.
- Mix direct factual recall with questions that require deriving meaning from what the text implies but doesn't state outright.

RULES:
1. Base most questions on specific content from the document. You may generate additional related questions on the same topic if needed to reach the total count.
2. Wrong answer options (distractors) must be plausible but clearly wrong — use slightly altered numbers, swapped terms, close-but-incorrect definitions, or common misconceptions.
3. Do NOT ask vague meta-questions like "What is the main topic?", "What does this document discuss?", or "Which formula is used for X?".
4. Every question must require the student to THINK — either solve, analyze, compare, or infer. No pure definition lookups.
5. Generate exactly ${count} questions.${userInstructions}

Return ONLY a valid JSON array — no markdown, no code fences, no extra text. Each object must have:
- "question": a specific question grounded in the document content
- "options": exactly 4 answer strings
- "correct": index (0-3) of the correct answer
- "difficulty": "easy", "medium", or "hard"

Example STEM: [{"question":"If log₃(x) = 4, what is x?","options":["12","27","81","64"],"correct":2,"difficulty":"medium"}]
Example non-STEM: [{"question":"According to the treaty, which nation gained control of the Suez Canal in 1888?","options":["Britain","France","Ottoman Empire","Egypt"],"correct":0,"difficulty":"medium"}]`;

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
        const tmpFile = path.join(tmpDir, `quizio_${randomUUID()}${getExtension(mimeType)}`);
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
                            displayName: `quizio-pdf-${pdfId}`,
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
        throw err;
    }
}

function parseQuestions(rawText, count) {
    const raw = rawText.trim();
    let jsonStr = raw;
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) jsonStr = match[0];
    let questions;
    try {
        questions = JSON.parse(jsonStr);
    } catch (e) {
        console.error('Failed to parse Gemini response as JSON:', raw.slice(0, 500));
        throw new Error('AI returned invalid JSON');
    }
    if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('AI returned empty or invalid questions');
    }
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
        ai.caches.delete({ name: cacheName }).catch(() => { });
        cacheMap.delete(pdfId);
    }
}

module.exports = { generateQuestionsFromFile, getPdfPageCount, extractPages, evictCache };
