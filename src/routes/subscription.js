/**
 * @file routes/subscription.js
 * @description PayPal (recurring) + BOG (monthly one-time) subscription for Diamond Pro.
 *
 * PayPal flow (recurring):
 *  1. POST /checkout { method:'paypal' } → creates PayPal subscription → returns approval URL
 *  2. User approves → PayPal redirects to GET /capture?subscription_id=SUB_ID
 *  3. Server verifies → activates Diamond Pro for 1 month → PayPal auto-renews
 *  4. Webhook POST /webhook/paypal handles renewals, cancellations, suspensions
 *
 * BOG (Bank of Georgia) flow (monthly one-time):
 *  1. POST /checkout { method:'bog' } → creates BOG order → returns redirect URL
 *  2. User pays → BOG redirects to GET /capture/bog?order_id=BOG_ORDER_ID
 *  3. Server verifies → activates Diamond Pro for 30 days (user must repay to renew)
 *
 * Cancel:
 *  POST /cancel — cancels PayPal subscription. BOG just expires naturally.
 *
 * Env vars needed:
 *  PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_PLAN_ID, PAYPAL_MODE (live|sandbox)
 *  BOG_CLIENT_ID, BOG_CLIENT_SECRET
 *  PAYPAL_WEBHOOK_ID (for webhook signature verification)
 */

'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TWO_DAYS_MS    =  2 * 24 * 60 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Check if a user's Diamond Pro is currently active (not expired). */
function isDiamondActive(user) {
    if (!user) return false;
    if (!user.isDiamondPro) return false;
    // No expiry set = legacy unlimited (will be migrated on next payment)
    if (!user.diamondExpiresAt) return true;
    return Date.now() < user.diamondExpiresAt;
}

/** Activate Diamond Pro for a user with a 30-day window. */
function activateDiamond(user, orderId, subscriptionId) {
    const now = Date.now();
    user.isDiamondPro = true;
    user.diamondSince = user.diamondSince || now;
    user.diamondExpiresAt = now + THIRTY_DAYS_MS;
    if (orderId) user.diamondOrderId = orderId;
    if (subscriptionId) user.paypalSubscriptionId = subscriptionId;
    db.saveUser(user.id);
}

/** Deactivate Diamond Pro for a user. */
function deactivateDiamond(user) {
    user.isDiamondPro = false;
    user.diamondExpiresAt = 0;
    user.paypalSubscriptionId = '';
    db.saveUser(user.id);
}

// ── PayPal ────────────────────────────────────────────────────────────────────

const PAYPAL_BASE = process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

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

        if (isDiamondActive(user)) {
            return res.status(400).json({ error: 'already_subscribed', message: 'You already have an active Diamond Pro subscription!' });
        }

        const method = req.body?.method === 'bog' ? 'bog' : 'paypal';
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        // ── PayPal (recurring subscription) ─────────────────────────────────
        if (method === 'paypal') {
            if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET || !process.env.PAYPAL_PLAN_ID) {
                return res.status(503).json({ error: 'PayPal subscription payments are not configured yet.' });
            }

            const token = await getPayPalToken();

            const response = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan_id: process.env.PAYPAL_PLAN_ID,
                    custom_id: user.id,
                    application_context: {
                        brand_name: 'QUIZIO RANKED',
                        user_action: 'SUBSCRIBE_NOW',
                        landing_page: 'BILLING',
                        return_url: `${baseUrl}/api/subscription/capture`,
                        cancel_url: `${baseUrl}/?diamond=error`,
                    },
                }),
            });

            if (!response.ok) {
                const err = await response.text();
                console.error('PayPal create subscription error:', err);
                return res.status(502).json({ error: 'Failed to create PayPal subscription. Please try again.' });
            }

            const subscription = await response.json();
            const approvalUrl = subscription.links?.find(l => l.rel === 'approve')?.href;
            if (!approvalUrl) return res.status(502).json({ error: 'No approval URL returned from PayPal.' });

            return res.json({ url: approvalUrl });
        }

        // ── BOG (monthly one-time payment) ──────────────────────────────────
        if (!process.env.BOG_CLIENT_ID || !process.env.BOG_CLIENT_SECRET) {
            return res.status(503).json({ error: 'BOG payments are not configured yet.' });
        }

        const bogToken = await getBOGToken();
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
 * PayPal redirects here after the user approves the subscription.
 */
router.get('/capture', async (req, res) => {
    const subscriptionId = req.query.subscription_id;
    if (!subscriptionId) return res.redirect('/?diamond=error');

    try {
        const token = await getPayPalToken();

        // Fetch subscription details to get custom_id (our userId)
        const response = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions/${subscriptionId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
            console.warn('PayPal subscription fetch failed:', response.status);
            return res.redirect('/?diamond=error');
        }

        const subscription = await response.json();

        if (subscription.status !== 'ACTIVE' && subscription.status !== 'APPROVED') {
            console.warn('PayPal subscription not active:', subscription.status);
            return res.redirect('/?diamond=error');
        }

        const userId = subscription.custom_id;
        if (userId) {
            const user = db.users.get(userId);
            if (user) {
                activateDiamond(user, null, subscriptionId);
                console.log(`✦ Diamond Pro subscription activated via PayPal for user: ${user.username} (${userId}), sub: ${subscriptionId}`);
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
 * BOG redirects here after payment. Grants 30 days of Diamond Pro.
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
                activateDiamond(user, `bog_${order_id}`, null);
                console.log(`✦ Diamond Pro (30 days) activated via BOG for user: ${user.username} (${userId})`);
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
 * POST /api/subscription/webhook/paypal
 * PayPal sends webhook events here for subscription lifecycle events.
 * Handles: PAYMENT.SALE.COMPLETED (renewal), BILLING.SUBSCRIPTION.CANCELLED,
 *          BILLING.SUBSCRIPTION.SUSPENDED, BILLING.SUBSCRIPTION.EXPIRED
 */
router.post('/webhook/paypal', express.json(), async (req, res) => {
    try {
        const event = req.body;
        const eventType = event?.event_type;
        const resource = event?.resource;

        console.log(`PayPal webhook received: ${eventType}`);

        // Verify webhook signature if PAYPAL_WEBHOOK_ID is set
        if (process.env.PAYPAL_WEBHOOK_ID) {
            try {
                const token = await getPayPalToken();
                const verifyRes = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        auth_algo: req.headers['paypal-auth-algo'],
                        cert_url: req.headers['paypal-cert-url'],
                        transmission_id: req.headers['paypal-transmission-id'],
                        transmission_sig: req.headers['paypal-transmission-sig'],
                        transmission_time: req.headers['paypal-transmission-time'],
                        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
                        webhook_event: event,
                    }),
                });
                const verifyData = await verifyRes.json();
                if (verifyData.verification_status !== 'SUCCESS') {
                    console.warn('PayPal webhook signature verification failed');
                    return res.status(401).json({ error: 'Invalid signature' });
                }
            } catch (verifyErr) {
                console.error('PayPal webhook verify error:', verifyErr.message);
            }
        }

        // Find user by subscription ID
        const subscriptionId = resource?.billing_agreement_id || resource?.id;
        let targetUser = null;

        if (subscriptionId) {
            for (const [, user] of db.users) {
                if (user.paypalSubscriptionId === subscriptionId) {
                    targetUser = user;
                    break;
                }
            }
        }

        switch (eventType) {
            // Recurring payment succeeded — extend by 30 days
            case 'PAYMENT.SALE.COMPLETED': {
                if (targetUser) {
                    const now = Date.now();
                    // Extend from current expiry if still active, otherwise from now
                    const base = (targetUser.diamondExpiresAt && targetUser.diamondExpiresAt > now)
                        ? targetUser.diamondExpiresAt
                        : now;
                    targetUser.isDiamondPro = true;
                    targetUser.diamondExpiresAt = base + THIRTY_DAYS_MS;
                    db.saveUser(targetUser.id);
                    console.log(`✦ Diamond Pro renewed for ${targetUser.username}, expires: ${new Date(targetUser.diamondExpiresAt).toISOString()}`);
                } else {
                    console.warn(`PayPal webhook: no user found for subscription ${subscriptionId}`);
                }
                break;
            }

            // Subscription cancelled or suspended — 2-day grace period then cut off
            case 'BILLING.SUBSCRIPTION.CANCELLED':
            case 'BILLING.SUBSCRIPTION.SUSPENDED':
            case 'BILLING.SUBSCRIPTION.EXPIRED': {
                if (targetUser) {
                    const now = Date.now();
                    const graceCutoff = now + TWO_DAYS_MS;
                    // If they have more than 2 days left, cap it at 2 days
                    if (!targetUser.diamondExpiresAt || targetUser.diamondExpiresAt > graceCutoff) {
                        targetUser.diamondExpiresAt = graceCutoff;
                    }
                    targetUser.paypalSubscriptionId = '';
                    db.saveUser(targetUser.id);
                    console.log(`✦ Diamond Pro subscription ${eventType} for ${targetUser.username}, access cut off at ${new Date(targetUser.diamondExpiresAt).toISOString()}`);
                }
                break;
            }

            default:
                console.log(`PayPal webhook unhandled event: ${eventType}`);
        }

        res.status(200).json({ received: true });
    } catch (err) {
        console.error('PayPal webhook error:', err.message);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

/**
 * POST /api/subscription/cancel
 * Cancels the user's PayPal subscription. BOG subscriptions expire naturally.
 */
router.post('/cancel', requireAuth, async (req, res) => {
    try {
        const user = db.users.get(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!isDiamondActive(user)) {
            return res.status(400).json({ error: 'No active subscription to cancel.' });
        }

        // If PayPal subscription, cancel it via API
        if (user.paypalSubscriptionId) {
            try {
                const token = await getPayPalToken();
                const cancelRes = await fetch(
                    `${PAYPAL_BASE}/v1/billing/subscriptions/${user.paypalSubscriptionId}/cancel`,
                    {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reason: 'User requested cancellation' }),
                    }
                );

                if (!cancelRes.ok && cancelRes.status !== 204) {
                    const err = await cancelRes.text();
                    console.error('PayPal cancel error:', err);
                    return res.status(502).json({ error: 'Failed to cancel PayPal subscription. Please try again.' });
                }

                console.log(`✦ PayPal subscription cancelled for ${user.username}, sub: ${user.paypalSubscriptionId}`);
                user.paypalSubscriptionId = '';
                // Cap remaining access to 2 days
                const graceCutoff = Date.now() + TWO_DAYS_MS;
                if (!user.diamondExpiresAt || user.diamondExpiresAt > graceCutoff) {
                    user.diamondExpiresAt = graceCutoff;
                }
                db.saveUser(user.id);
            } catch (cancelErr) {
                console.error('PayPal cancel error:', cancelErr.message);
                return res.status(502).json({ error: 'Failed to cancel subscription. Please try again.' });
            }
        }

        res.json({
            message: 'Subscription cancelled. Your Diamond Pro access remains active for 2 more days.',
            expiresAt: user.diamondExpiresAt,
        });
    } catch (err) {
        console.error('Cancel route error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/subscription/status
 */
router.get('/status', requireAuth, (req, res) => {
    const user = db.users.get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const active = isDiamondActive(user);

    // Auto-deactivate expired subscriptions
    if (user.isDiamondPro && !active) {
        deactivateDiamond(user);
    }

    res.json({
        isDiamondPro: active,
        diamondSince: user.diamondSince || 0,
        diamondExpiresAt: user.diamondExpiresAt || 0,
        isRecurring: !!user.paypalSubscriptionId,
        method: user.paypalSubscriptionId ? 'paypal' : (user.diamondOrderId?.startsWith('bog_') ? 'bog' : ''),
    });
});

// Export the helper so other modules can check expiration
router.isDiamondActive = isDiamondActive;

module.exports = router;
