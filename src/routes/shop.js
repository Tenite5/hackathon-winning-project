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
    // ── Profile Frames ────────────────────────────────────────
    { id: 'frame_gold',     name: 'Gold Frame',     price: 50,   type: 'frame', description: 'A shining golden border for your avatar.',                    color: '#ffd700' },
    { id: 'frame_fire',     name: 'Fire Frame',     price: 100,  type: 'frame', description: 'Blazing flames ripple around your avatar.',                   color: '#ff6b35' },
    { id: 'frame_diamond',  name: 'Diamond Frame',  price: 150,  type: 'frame', description: 'Brilliant diamond sparkle that catches the light.',           color: '#b9f2ff' },
    { id: 'frame_rose',     name: 'Rose Gold Frame',price: 180,  type: 'frame', description: 'Soft rose-gold shimmer — elegant and warm.',                  color: '#f9a8d4' },
    { id: 'frame_neon',     name: 'Neon Frame',     price: 200,  type: 'frame', description: 'Vibrant neon glow that pulses with energy.',                  color: '#39ff14' },
    { id: 'frame_sunset',   name: 'Sunset Frame',   price: 220,  type: 'frame', description: 'Dusk sky gradient — peach melts into violet.',                color: '#fb923c' },
    { id: 'frame_ocean',    name: 'Deep Ocean Frame',price: 260, type: 'frame', description: 'Cool teal tide with a slow, breathing glow.',                 color: '#06b6d4' },
    { id: 'frame_galaxy',   name: 'Galaxy Frame',   price: 320,  type: 'frame', description: 'Starry night sky swirling around your portrait.',             color: '#a855f7' },
    { id: 'frame_rainbow',  name: 'Rainbow Frame',  price: 400,  type: 'frame', description: 'A living rainbow arc that rotates endlessly.',               color: '#ff4d8d' },
    { id: 'frame_shadow',   name: 'Shadow Frame',   price: 450,  type: 'frame', description: 'Black-on-black ember — ominous and minimal.',                 color: '#1f2937' },
    { id: 'frame_aurora',   name: 'Aurora Frame',   price: 500,  type: 'frame', description: 'Northern-lights ribbons dance around your avatar.',           color: '#34d399' },
    { id: 'frame_mythic',   name: 'Mythic Frame',   price: 650,  type: 'frame', description: 'A rotating ring of mythic gold-crimson plasma.',              color: '#ef4444' },

    // ── Name Effects ──────────────────────────────────────────
    // Applies to "nameEffect" on user — can be rendered as a style on the
    // username elsewhere in the app (future enhancement).
    { id: 'name_gold',     name: 'Gold Name',     price: 120, type: 'nameEffect', description: 'Your name gleams in polished gold wherever it appears.', color: '#f0c040' },
    { id: 'name_rainbow',  name: 'Rainbow Name',  price: 350, type: 'nameEffect', description: 'A soft rainbow gradient flows across your name.',         color: '#ff4d8d' },
    { id: 'name_fire',     name: 'Fiery Name',    price: 280, type: 'nameEffect', description: 'Burning orange-red tones on every mention of you.',       color: '#ff4500' },
    { id: 'name_galaxy',   name: 'Galactic Name', price: 420, type: 'nameEffect', description: 'Deep violet-to-pink gradient, like stars at dusk.',       color: '#a855f7' },

    // ── Profile Badges ────────────────────────────────────────
    { id: 'badge_crown',  name: 'Crown Badge',  price: 300, type: 'badge', description: 'A tiny crown next to your name — fit for royalty.', color: '#fbbf24', emoji: '👑' },
    { id: 'badge_flame',  name: 'Flame Badge',  price: 250, type: 'badge', description: 'A burning flame shows you are on a hot streak.',     color: '#ef4444', emoji: '🔥' },
    { id: 'badge_star',   name: 'Star Badge',   price: 200, type: 'badge', description: 'A golden star for the shining champions.',            color: '#f59e0b', emoji: '⭐' },
    { id: 'badge_bolt',   name: 'Lightning Bolt',price: 220,type: 'badge', description: 'Electric speed — perfect for fast-fingered triviaists.',color: '#60a5fa', emoji: '⚡' },

    // ── Membership ────────────────────────────────────────────
    { id: 'diamond_7d',  name: 'Diamond Pro (7 days)',  price: 500,  type: 'membership', description: '7 days of Diamond Pro perks.',  duration: 7 },
    { id: 'diamond_30d', name: 'Diamond Pro (30 days)', price: 1500, type: 'membership', description: '30 days of Diamond Pro perks.', duration: 30 },
];

const SHOP_MAP = new Map(SHOP_ITEMS.map(i => [i.id, i]));

const router = Router();

// GET /shop/items — all items + user balance
router.get('/shop/items', requireAuth, (req, res) => {
    const user = db.users.get(req.user.id);
    const owned = new Set((user.purchasedItems || []).map(p => p.itemId));
    const items = SHOP_ITEMS.map(item => {
        let equipped = false;
        if (item.type === 'frame') equipped = user.activeFrame === item.id;
        else if (item.type === 'nameEffect') equipped = user.activeNameEffect === item.id;
        else if (item.type === 'badge') equipped = user.activeBadge === item.id;
        return { ...item, owned: owned.has(item.id), equipped };
    });
    res.json({
        items,
        points: user.points || 0,
        activeFrame: user.activeFrame || null,
        activeNameEffect: user.activeNameEffect || null,
        activeBadge: user.activeBadge || null,
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

    if (!user.purchasedItems) user.purchasedItems = [];

    // Apply item effect
    if (item.type === 'frame') {
        user.purchasedItems.push({ itemId: item.id, purchasedAt: Date.now() });
        user.activeFrame = item.id; // auto-equip
    } else if (item.type === 'nameEffect') {
        user.purchasedItems.push({ itemId: item.id, purchasedAt: Date.now() });
        user.activeNameEffect = item.id; // auto-equip
    } else if (item.type === 'badge') {
        user.purchasedItems.push({ itemId: item.id, purchasedAt: Date.now() });
        user.activeBadge = item.id; // auto-equip
    } else if (item.type === 'membership') {
        user.purchasedItems.push({ itemId: item.id, purchasedAt: Date.now() });
        const now = Date.now();
        const durationMs = (item.duration || 7) * 24 * 60 * 60 * 1000;
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
        activeNameEffect: user.activeNameEffect,
        activeBadge: user.activeBadge,
        isDiamondPro: user.isDiamondPro,
        diamondExpiresAt: user.diamondExpiresAt,
    });
});

// POST /shop/equip — equip/unequip any cosmetic (frame, nameEffect, badge)
router.post('/shop/equip', requireAuth, (req, res) => {
    const { itemId, type } = req.body || {};
    const user = db.users.get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const validTypes = { frame: 'activeFrame', nameEffect: 'activeNameEffect', badge: 'activeBadge' };
    const field = validTypes[type];
    if (!field) return res.status(400).json({ error: 'Invalid cosmetic type' });

    if (!itemId || itemId === 'none') {
        user[field] = null;
        db.saveUser(user.id);
        return res.json({ success: true, [field]: null });
    }

    const item = SHOP_MAP.get(itemId);
    if (!item || item.type !== type) return res.status(400).json({ error: 'Invalid item' });

    const owned = (user.purchasedItems || []).some(p => p.itemId === itemId);
    if (!owned) return res.status(400).json({ error: 'You do not own this item' });

    user[field] = itemId;
    db.saveUser(user.id);
    res.json({ success: true, [field]: itemId });
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
