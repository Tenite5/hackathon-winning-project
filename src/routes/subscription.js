/**
 * @file routes/subscription.js
 * @description PayPal + BOG payment — checkout + capture + status.
 *
 * PayPal flow:
 *  1. POST /checkout { method:'paypal' } → creates PayPal order → returns approval URL
 *  2. User pays → PayPal redirects to GET /capture?token=ORDER_ID&PayerID=...
 *  3. Server captures → activates Diamond Pro → redirects to app
 *
 * BOG (Bank of Georgia) flow:
 *  1. POST /checkout { method:'bog' } → creates BOG order → returns redirect URL
 *  2. User pays → BOG redirects to GET /capture/bog?order_id=BOG_ORDER_ID
 *  3. Server verifies → activates Diamond Pro → redirects to app
 */

'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');

// ── PayPal ────────────────────────────────────────────────────────────────────

const PAYPAL_BASE = process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const DIAMOND_PRICE_USD = process.env.DIAMOND_PRICE_USD || process.env.DIAMOND_PRICE || '4.99';

async function getPayPalToken() {
    const credentials = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString('base64');

    const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });

    if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
    const data = await res.json();
    return data.access_token;
}

// ── BOG (Bank of Georgia) ────────────────────────────────────────────────────

const BOG_OAUTH_URL = 'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token';
const BOG_API_BASE  = 'https://api.bog.ge';
const DIAMOND_PRICE_GEL = process.env.DIAMOND_PRICE_GEL || '10';

async function getBOGToken() {
    const credentials = Buffer.from(
        `${process.env.BOG_CLIENT_ID}:${process.env.BOG_CLIENT_SECRET}`
    ).toString('base64');

    const res = await fetch(BOG_OAUTH_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });

    if (!res.ok) throw new Error(`BOG auth failed: ${res.status}`);
    const data = await res.json();
    return data.access_token;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/subscription/checkout
 * Body: { method: 'paypal' | 'bog' }
 * Returns { url } — client redirects there.
 */
router.post('/checkout', requireAuth, async (req, res) => {
    try {
        const user = db.users.get(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (user.isDiamondPro) {
            return res.status(400).json({ error: 'already_subscribed', message: 'You already have Diamond Pro!' });
        }

        const method = req.body?.method === 'bog' ? 'bog' : 'paypal';
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        // ── PayPal ────────────────────────────────────────────────────────────
        if (method === 'paypal') {
            if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
                return res.status(503).json({ error: 'PayPal payments are not configured yet.' });
            }

            const token = await getPayPalToken();

            const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    intent: 'CAPTURE',
                    purchase_units: [{
                        custom_id: user.id,
                        description: 'Diamond Pro — QVIZIO RANKED',
                        amount: { currency_code: 'USD', value: DIAMOND_PRICE_USD },
                    }],
                    application_context: {
                        brand_name: 'QVIZIO RANKED',
                        user_action: 'PAY_NOW',
                        landing_page: 'BILLING',
                        return_url: `${baseUrl}/api/subscription/capture`,
                        cancel_url: `${baseUrl}/`,
                    },
                }),
            });

            if (!response.ok) {
                const err = await response.text();
                console.error('PayPal create order error:', err);
                return res.status(502).json({ error: 'Failed to create PayPal order. Please try again.' });
            }

            const order = await response.json();
            const approvalUrl = order.links?.find(l => l.rel === 'approve')?.href;
            if (!approvalUrl) return res.status(502).json({ error: 'No approval URL returned from PayPal.' });

            return res.json({ url: approvalUrl });
        }

        // ── BOG ───────────────────────────────────────────────────────────────
        if (!process.env.BOG_CLIENT_ID || !process.env.BOG_CLIENT_SECRET) {
            return res.status(503).json({ error: 'BOG payments are not configured yet.' });
        }

        const bogToken = await getBOGToken();
        // Encode userId in external_order_id so we can retrieve it on capture
        const externalOrderId = `${user.id}_${Date.now()}`;

        const bogResponse = await fetch(`${BOG_API_BASE}/payments/v1/ecommerce/orders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${bogToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_url: `${baseUrl}/api/subscription/webhook/bog`,
                external_order_id: externalOrderId,
                purchase_units: {
                    currency: 'GEL',
                    total_amount: parseFloat(DIAMOND_PRICE_GEL),
                },
                redirect_urls: {
                    fail: `${baseUrl}/?diamond=error`,
                    success: `${baseUrl}/api/subscription/capture/bog`,
                },
                buyer: {
                    full_name: user.username || undefined,
                    email: user.email || undefined,
                },
            }),
        });

        if (!bogResponse.ok) {
            const err = await bogResponse.text();
            console.error('BOG create order error:', err);
            return res.status(502).json({ error: 'Failed to create BOG order. Please try again.' });
        }

        const bogOrder = await bogResponse.json();
        const redirectUrl = bogOrder._links?.redirect?.href;
        if (!redirectUrl) return res.status(502).json({ error: 'No redirect URL returned from BOG.' });

        return res.json({ url: redirectUrl });

    } catch (err) {
        console.error('Checkout route error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/subscription/capture
 * PayPal redirects here after approval. Captures payment and activates Diamond Pro.
 */
router.get('/capture', async (req, res) => {
    const { token: orderId, PayerID } = req.query;
    if (!orderId || !PayerID) return res.redirect('/?diamond=error');

    try {
        const token = await getPayPalToken();

        const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });

        const capture = await response.json();

        if (capture.status !== 'COMPLETED') {
            console.warn('PayPal capture incomplete:', capture.status);
            return res.redirect('/?diamond=error');
        }

        const userId = capture.purchase_units?.[0]?.custom_id;
        if (userId) {
            const user = db.users.get(userId);
            if (user) {
                user.isDiamondPro = true;
                user.diamondSince = Date.now();
                user.diamondOrderId = orderId;
                db.saveUser(userId);
                console.log(`✦ Diamond Pro activated via PayPal for user: ${user.username} (${userId})`);
            } else {
                console.warn(`PayPal capture: user not found in memory for userId=${userId}`);
            }
        }

        res.redirect('/?diamond=activated');
    } catch (err) {
        console.error('PayPal capture error:', err.message);
        res.redirect('/?diamond=error');
    }
});

/**
 * GET /api/subscription/capture/bog
 * BOG redirects here after payment. Verifies order and activates Diamond Pro.
 */
router.get('/capture/bog', async (req, res) => {
    const { order_id } = req.query;
    if (!order_id) return res.redirect('/?diamond=error');

    try {
        const token = await getBOGToken();

        const response = await fetch(`${BOG_API_BASE}/payments/v1/ecommerce/orders/${order_id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
            console.warn('BOG order fetch failed:', response.status);
            return res.redirect('/?diamond=error');
        }

        const order = await response.json();

        if (order.order_status?.key !== 'completed') {
            console.warn('BOG order not completed:', order.order_status?.key);
            return res.redirect('/?diamond=error');
        }

        // external_order_id format: "userId_timestamp"
        const userId = (order.external_order_id || '').split('_')[0];

        if (userId) {
            const user = db.users.get(userId);
            if (user) {
                user.isDiamondPro = true;
                user.diamondSince = Date.now();
                user.diamondOrderId = `bog_${order_id}`;
                db.saveUser(userId);
                console.log(`✦ Diamond Pro activated via BOG for user: ${user.username} (${userId})`);
            } else {
                console.warn(`BOG capture: user not found in memory for userId=${userId}`);
            }
        }

        res.redirect('/?diamond=activated');
    } catch (err) {
        console.error('BOG capture error:', err.message);
        res.redirect('/?diamond=error');
    }
});

/**
 * GET /api/subscription/status
 */
router.get('/status', requireAuth, (req, res) => {
    const user = db.users.get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
        isDiamondPro: user.isDiamondPro || false,
        diamondSince: user.diamondSince || 0,
    });
});

module.exports = router;
