/**
 * @file middleware/validate.js
 * @description Input validation and sanitization helpers.
 */

'use strict';

/** Validate a username: 3-20 chars, alphanumeric + underscore only. */
function validateUsername(str) {
    if (typeof str !== 'string') return { valid: false, error: 'Username must be a string' };
    const trimmed = str.trim();
    if (trimmed.length < 2 || trimmed.length > 20) return { valid: false, error: 'Username must be 2-20 characters' };
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
    return { valid: true, value: trimmed };
}

/** Validate a password: minimum 4 characters. */
function validatePassword(str) {
    if (typeof str !== 'string') return { valid: false, error: 'Password must be a string' };
    if (str.length < 4) return { valid: false, error: 'Password must be at least 4 characters' };
    return { valid: true, value: str };
}

/**
 * Sanitize a text string — trim and limit length.
 * @param {string} str
 * @param {number} [maxLen=500] — maximum allowed length
 */
function sanitizeText(str, maxLen = 500) {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, maxLen);
}

/** Validate that a value is an integer in [min, max]. */
function validateInt(val, min, max, defaultVal) {
    const n = parseInt(val, 10);
    if (isNaN(n)) return defaultVal;
    return Math.max(min, Math.min(max, n));
}

module.exports = { validateUsername, validatePassword, sanitizeText, validateInt };
