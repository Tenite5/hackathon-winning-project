/**
 * @file routes/pdf.js
 * @description API routes for PDF/image upload, analysis, storage, and management.
 */

'use strict';

const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { generateQuestionsFromFile, getPdfPageCount, evictCache } = require('../services/pdfAnalysis');
const { validateInt } = require('../middleware/validate');
const PdfModel = require('../db/models/Pdf');
const db = require('../db/store');
const { checkDailyLimit, incrementDailyLimit } = require('../middleware/dailyLimits');

const router = express.Router();

/**
 * Fix multer filename encoding — multer decodes originalname as latin1
 * but browsers send UTF-8 encoded filenames, causing garbled characters.
 */
function fixFilename(name) {
    if (!name) return 'document';
    try {
        // Try to re-decode as UTF-8 from latin1
        const fixed = Buffer.from(name, 'latin1').toString('utf8');
        // If the result contains the replacement character, the original was fine
        if (fixed.includes('\uFFFD')) return name;
        return fixed;
    } catch {
        return name;
    }
}

// Multer config: 20MB max, memory storage, only PDF and images
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and image files (PNG, JPEG, WebP, GIF) are allowed'));
        }
    },
});

// ── Upload & Analyze ────────────────────────────────────────────────────────
// POST /api/pdf/analyze
// Uploads a file, optionally validates page range, generates questions via Gemini
router.post('/pdf/analyze', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Daily PDF generation limit
        const userId = req.user.id;
        const user = db.users.get(userId);
        const rl = checkDailyLimit(userId, user?.isDiamondPro, 'pdfGen');
        if (rl.limited) {
            return res.status(429).json({
                error: 'daily_limit',
                message: user?.isDiamondPro
                    ? `You've reached your 20 daily PDF generations. Resets tomorrow.`
                    : `Free accounts get 2 PDF generations per day. Upgrade to Diamond Pro for 20. (${rl.remaining} remaining)`,
            });
        }

        const { buffer, mimetype } = req.file;
        const originalname = fixFilename(req.file.originalname);
        const count = validateInt(req.body.questionCount, 3, 20, 5);
        const userPrompt = (req.body.userPrompt || '').trim().slice(0, 500);
        let pageFrom = parseInt(req.body.pageFrom) || 0;
        let pageTo = parseInt(req.body.pageTo) || 0;

        // For PDFs, check page count and validate range
        let totalPages = 0;
        if (mimetype === 'application/pdf') {
            try {
                totalPages = await getPdfPageCount(buffer);
            } catch (err) {
                return res.status(400).json({ error: 'Could not read PDF. The file may be corrupt.' });
            }

            // If > 102 pages, page range is required
            if (totalPages > 102 && (!pageFrom || !pageTo)) {
                return res.status(400).json({
                    error: 'page_range_required',
                    totalPages,
                    message: `This PDF has ${totalPages} pages. Please specify a page range (max 102 pages at a time).`,
                });
            }

            // Validate range
            if (pageFrom && pageTo) {
                pageFrom = Math.max(1, Math.min(pageFrom, totalPages));
                pageTo = Math.max(pageFrom, Math.min(pageTo, totalPages));
                if (pageTo - pageFrom + 1 > 102) {
                    return res.status(400).json({ error: 'Maximum 102 pages can be processed at once.' });
                }
            } else {
                pageFrom = 1;
                pageTo = totalPages;
            }
        } else {
            // Image — single "page"
            pageFrom = 1;
            pageTo = 1;
            totalPages = 1;
        }

        // Generate questions from the file (page range passed for extraction)
        const questions = await generateQuestionsFromFile(
            buffer, mimetype, originalname, count, userPrompt, null, pageFrom, pageTo
        );

        incrementDailyLimit(userId, 'pdfGen');

        res.json({
            questions,
            fileInfo: {
                fileName: originalname,
                mimeType: mimetype,
                totalPages,
                pageFrom,
                pageTo,
            },
        });
    } catch (err) {
        console.error('PDF analyze error:', err.message);
        if (err.message && err.message.includes('Only PDF and image')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message || 'Failed to analyze file' });
    }
});

// ── Get page count only (for large PDF validation) ──────────────────────────
// POST /api/pdf/page-count
router.post('/pdf/page-count', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        if (req.file.mimetype !== 'application/pdf') {
            return res.json({ totalPages: 1 });
        }
        const totalPages = await getPdfPageCount(req.file.buffer);
        res.json({ totalPages });
    } catch (err) {
        res.status(400).json({ error: 'Could not read PDF' });
    }
});

// ── Save PDF (selected pages) ───────────────────────────────────────────────
// POST /api/pdf/save
router.post('/pdf/save', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const userId = req.user.id;
        const saveUser = db.users.get(userId);
        const saveLimit = saveUser?.isDiamondPro ? 20 : 2;

        // Check storage limit
        const existingCount = await PdfModel.countDocuments({ userId });
        if (existingCount >= saveLimit) {
            return res.status(400).json({
                error: 'storage_limit',
                message: saveUser?.isDiamondPro
                    ? `Diamond Pro allows up to 20 saved documents. Delete one to make room.`
                    : `Free accounts can store up to 2 PDFs/images. Upgrade to Diamond Pro for 20 slots.`,
            });
        }

        const { buffer, mimetype } = req.file;
        const originalname = fixFilename(req.file.originalname);
        let totalPages = 1;
        let pageFrom = parseInt(req.body.pageFrom) || 1;
        let pageTo = parseInt(req.body.pageTo) || 1;

        if (mimetype === 'application/pdf') {
            totalPages = await getPdfPageCount(buffer);
            pageFrom = Math.max(1, Math.min(pageFrom, totalPages));
            pageTo = Math.max(pageFrom, Math.min(pageTo, totalPages));
        }

        const pdfId = randomUUID();
        await PdfModel.create({
            _id: pdfId,
            userId,
            fileName: originalname.slice(0, 200),
            totalPages,
            pageFrom,
            pageTo,
            fileData: buffer,
            fileSize: buffer.length,
            mimeType: mimetype,
        });

        res.json({
            id: pdfId,
            fileName: originalname,
            totalPages,
            pageFrom,
            pageTo,
            fileSize: buffer.length,
            createdAt: Date.now(),
        });
    } catch (err) {
        console.error('PDF save error:', err.message);
        res.status(500).json({ error: 'Failed to save file' });
    }
});

// ── List saved PDFs ─────────────────────────────────────────────────────────
// GET /api/pdf/list
router.get('/pdf/list', requireAuth, async (req, res) => {
    try {
        const docs = await PdfModel.find(
            { userId: req.user.id },
            { fileData: 0 } // exclude binary data from listing
        ).sort({ createdAt: -1 }).lean();

        res.json(docs.map(d => ({
            id: d._id,
            fileName: d.fileName,
            totalPages: d.totalPages,
            pageFrom: d.pageFrom,
            pageTo: d.pageTo,
            fileSize: d.fileSize,
            mimeType: d.mimeType,
            createdAt: d.createdAt,
        })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to list files' });
    }
});

// ── Delete a saved PDF ──────────────────────────────────────────────────────
// DELETE /api/pdf/:id
router.delete('/pdf/:id', requireAuth, async (req, res) => {
    try {
        const doc = await PdfModel.findOne({ _id: req.params.id, userId: req.user.id });
        if (!doc) return res.status(404).json({ error: 'PDF not found' });

        evictCache(doc._id);
        await PdfModel.deleteOne({ _id: doc._id });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// ── Reuse a saved PDF to generate new questions ─────────────────────────────
// POST /api/pdf/reuse/:id
router.post('/pdf/reuse/:id', requireAuth, async (req, res) => {
    try {
        const doc = await PdfModel.findOne({ _id: req.params.id, userId: req.user.id });
        if (!doc) return res.status(404).json({ error: 'PDF not found' });

        const count = validateInt(req.body.questionCount, 3, 20, 5);
        const userPrompt = (req.body.userPrompt || '').trim().slice(0, 500);

        const questions = await generateQuestionsFromFile(
            doc.fileData, doc.mimeType, doc.fileName, count, userPrompt, doc._id, doc.pageFrom, doc.pageTo
        );

        res.json({
            questions,
            fileInfo: {
                id: doc._id,
                fileName: doc.fileName,
                mimeType: doc.mimeType,
                totalPages: doc.totalPages,
                pageFrom: doc.pageFrom,
                pageTo: doc.pageTo,
            },
        });
    } catch (err) {
        console.error('PDF reuse error:', err.message);
        res.status(500).json({ error: 'Failed to generate questions from saved file' });
    }
});

module.exports = router;
