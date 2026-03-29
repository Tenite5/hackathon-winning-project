/**
 * @file routes/shop.js
 * @description Points shop — browse items, purchase with points, equip frames.
 */

'use strict';

const { Router } = require('express');
const db = require('../db/store');
const { requireAuth } = require('../middleware/auth');

// ── Shop Catalog ──────────────────────────────────────────────
const SHOP_ITEMS = [
    // Profile Frames
    { id: 'frame_gold', name: 'Gold Frame', price: 50, type: 'frame', description: 'A shining golden border for your avatar.', color: '#ffd700' },
    { id: 'frame_diamond', name: 'Diamond Frame', price: 150, type: 'frame', description: 'Brilliant diamond sparkle around your profile.', color: '#b9f2ff' },
    { id: 'frame_fire', name: 'Fire Frame', price: 100, type: 'frame', description: 'Blazing flames surround your avatar.', color: '#ff6b35' },
    { id: 'frame_neon', name: 'Neon Frame', price: 200, type: 'frame', description: 'Vibrant neon glow that pulses with energy.', color: '#39ff14' },
    // Membership
    { id: 'diamond_7d', name: 'Diamond Pro (7 days)', price: 500, type: 'membership', description: '7 days of Diamond Pro perks.', duration: 7 },
    { id: 'diamond_30d', name: 'Diamond Pro (30 days)', price: 1500, type: 'membership', description: '30 days of Diamond Pro perks.', duration: 30 },
];

const SHOP_MAP = new Map(SHOP_ITEMS.map(i => [i.id, i]));

const router = Router();

// GET /shop/items — all items + user balance
router.get('/shop/items', requireAuth, (req, res) => {
    const user = db.users.get(req.user.id);
    const owned = new Set((user.purchasedItems || []).map(p => p.itemId));
    const items = SHOP_ITEMS.map(item => ({
        ...item,
        owned: owned.has(item.id),
        equipped: item.type === 'frame' && user.activeFrame === item.id,
    }));
    res.json({
        items,
        points: user.points || 0,
        activeFrame: user.activeFrame || null,
    });
});

// GET /shop/my-items — user's purchased items
router.get('/shop/my-items', requireAuth, (req, res) => {
    const user = db.users.get(req.user.id);
    res.json({
        purchasedItems: user.purchasedItems || [],
        activeFrame: user.activeFrame || null,
        points: user.points || 0,
    });
});

// POST /shop/purchase — buy an item
router.post('/shop/purchase', requireAuth, (req, res) => {
    const { itemId } = req.body;
    if (!itemId || typeof itemId !== 'string') return res.status(400).json({ error: 'Missing itemId' });

    const item = SHOP_MAP.get(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const user = db.users.get(req.user.id);
    const owned = (user.purchasedItems || []).some(p => p.itemId === itemId);

    // Membership can be re-purchased (extends duration)
    if (owned && item.type !== 'membership') {
        return res.status(400).json({ error: 'You already own this item' });
    }

    if ((user.points || 0) < item.price) {
        return res.status(400).json({ error: 'Not enough points', needed: item.price, have: user.points || 0 });
    }

    // Deduct points
    user.points = (user.points || 0) - item.price;

    // Apply item effect
    if (item.type === 'frame') {
        if (!user.purchasedItems) user.purchasedItems = [];
        user.purchasedItems.push({ itemId: item.id, purchasedAt: Date.now() });
        // Auto-equip
        user.activeFrame = item.id;
    } else if (item.type === 'membership') {
        if (!user.purchasedItems) user.purchasedItems = [];
        user.purchasedItems.push({ itemId: item.id, purchasedAt: Date.now() });
        const now = Date.now();
        const durationMs = (item.duration || 7) * 24 * 60 * 60 * 1000;
        // Extend from current expiry or from now
        const base = (user.diamondExpiresAt && user.diamondExpiresAt > now) ? user.diamondExpiresAt : now;
        user.isDiamondPro = true;
        user.diamondSince = user.diamondSince || now;
        user.diamondExpiresAt = base + durationMs;
    }

    db.saveUser(user.id);

    res.json({
        success: true,
        points: user.points,
        activeFrame: user.activeFrame,
        isDiamondPro: user.isDiamondPro,
        diamondExpiresAt: user.diamondExpiresAt,
    });
});

// POST /shop/equip-frame — equip or unequip a frame
router.post('/shop/equip-frame', requireAuth, (req, res) => {
    const { frameId } = req.body;
    const user = db.users.get(req.user.id);

    if (!frameId || frameId === 'none') {
        // Unequip
        user.activeFrame = null;
        db.saveUser(user.id);
        return res.json({ success: true, activeFrame: null });
    }

    const item = SHOP_MAP.get(frameId);
    if (!item || item.type !== 'frame') return res.status(400).json({ error: 'Invalid frame' });

    const owned = (user.purchasedItems || []).some(p => p.itemId === frameId);
    if (!owned) return res.status(400).json({ error: 'You do not own this frame' });

    user.activeFrame = frameId;
    db.saveUser(user.id);

    res.json({ success: true, activeFrame: user.activeFrame });
});

module.exports = router;
