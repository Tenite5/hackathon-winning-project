/**
 * @file db/models/Pdf.js
 * @description Mongoose schema for stored PDF documents (selected pages only).
 */

'use strict';

const mongoose = require('mongoose');

const pdfSchema = new mongoose.Schema({
    _id: { type: String, required: true },              // UUID
    userId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    totalPages: { type: Number, required: true },
    pageFrom: { type: Number, required: true },
    pageTo: { type: Number, required: true },
    fileData: { type: Buffer, required: true },         // PDF binary (selected pages stored as original)
    fileSize: { type: Number, required: true },         // bytes
    mimeType: { type: String, default: 'application/pdf' },
    createdAt: { type: Number, default: Date.now },
}, { _id: false, versionKey: false });

// Compound index for quick user lookups
pdfSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Pdf', pdfSchema);
