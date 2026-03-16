/**
 * @file routes/subscription.js
 * @description Lemon Squeezy subscription management — checkout + webhook + status.
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');

const LS_API_KEY      = process.env.LEMONSQUEEZY_API_KEY;
const LS_STORE_ID     = process.env.LEMONSQUEEZY_STORE_ID;
const LS_VARIANT_ID   = process.env.LEMONSQUEEZY_VARIANT_ID;
const LS_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

/**
 * POST /api/subscription/checkout
 * Create a Lemon Squeezy checkout URL for the authenticated user.
 */
router.post('/checkout', requireAuth, async (req, res) => {
    try {
        const user = db.users.get(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (user.isDiamondPro) {
            return res.status(400).json({ error: 'already_subscribed', message: 'You already have Diamond Pro!' });
        }

        if (!LS_API_KEY || !LS_STORE_ID || !LS_VARIANT_ID) {
            return res.status(503).json({ error: 'Payments are not configured yet. Check back soon!' });
        }

        const body = {
            data: {
                type: 'checkouts',
                attributes: {
                    checkout_data: {
                        custom: { userId: user.id },
                        email: user.email || undefined,
                        name: user.username || undefined,
                    },
                    product_options: {
                        redirect_url: `${req.protocol}://${req.get('host')}/?diamond=activated`,
                    },
                },
                relationships: {
                    store: { data: { type: 'stores', id: String(LS_STORE_ID) } },
                    variant: { data: { type: 'variants', id: String(LS_VARIANT_ID) } },
                },
            },
        };

        const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${LS_API_KEY}`,
                'Accept': 'application/vnd.api+json',
                'Content-Type': 'application/vnd.api+json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('LS checkout error:', err);
            return res.status(502).json({ error: 'Failed to create checkout. Please try again.' });
        }

        const data = await response.json();
        const checkoutUrl = data?.data?.attributes?.url;
        if (!checkoutUrl) {
            return res.status(502).json({ error: 'No checkout URL returned from payment provider.' });
        }

        res.json({ url: checkoutUrl });
    } catch (err) {
        console.error('Checkout route error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/subscription/webhook
 * Lemon Squeezy webhook — activates Diamond Pro on successful order.
 * Note: body must be raw (Buffer) — configured in app.js before express.json().
 */
router.post('/webhook', (req, res) => {
    try {
        if (!LS_WEBHOOK_SECRET) {
            console.warn('LS webhook received but LEMONSQUEEZY_WEBHOOK_SECRET is not set');
            return res.sendStatus(200);
        }

        const rawBody = req.body;
        const signature = req.headers['x-signature'];
        if (!signature) return res.sendStatus(400);

        const expected = crypto
            .createHmac('sha256', LS_WEBHOOK_SECRET)
            .update(rawBody)
            .digest('hex');

        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
            console.warn('LS webhook: invalid signature');
            return res.sendStatus(401);
        }

        const payload = JSON.parse(rawBody.toString());
        const eventName = payload?.meta?.event_name;
        const status = payload?.data?.attributes?.status;
        const userId = payload?.meta?.custom_data?.userId;
        const orderId = String(payload?.data?.id || '');

        if ((eventName === 'order_created') && status === 'paid' && userId) {
            const user = db.users.get(userId);
            if (user) {
                user.isDiamondPro = true;
                user.diamondSince = Date.now();
                user.diamondOrderId = orderId;
                db.saveUser(userId);
                console.log(`✦ Diamond Pro activated for user: ${user.username} (${userId})`);
            } else {
                console.warn(`LS webhook: user not found for userId=${userId}`);
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('LS webhook error:', err.message);
        res.sendStatus(200); // Always 200 to prevent LS retries
    }
});

/**
 * GET /api/subscription/status
 * Re-check subscription status after returning from checkout.
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
