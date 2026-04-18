/**
 * @file public/js/shop.js
 * @description Points shop — browse items, purchase, equip frames.
 */

(function () {
    'use strict';
    const { $, state, socket, showPanel, toast, escapeHtml, api } = QV;

    // Frame color/gradient map for preview rendering
    const FRAME_STYLES = {
        frame_gold:    { gradient: 'linear-gradient(135deg, #ffd700, #f0c040, #ffd700)',      glow: 'rgba(255,215,0,0.5)' },
        frame_diamond: { gradient: 'linear-gradient(135deg, #b9f2ff, #e0f7ff, #7dd3fc)',      glow: 'rgba(125,211,252,0.5)' },
        frame_fire:    { gradient: 'linear-gradient(135deg, #ff6b35, #ff4500, #ff8c00)',      glow: 'rgba(255,69,0,0.5)' },
        frame_neon:    { gradient: 'linear-gradient(135deg, #39ff14, #00ff88, #00ffcc)',      glow: 'rgba(57,255,20,0.5)' },
        frame_rose:    { gradient: 'linear-gradient(135deg, #f9a8d4, #fb7185, #f0abfc)',      glow: 'rgba(249,168,212,0.5)' },
        frame_sunset:  { gradient: 'linear-gradient(135deg, #fb923c, #f472b6, #a78bfa)',      glow: 'rgba(251,146,60,0.5)' },
        frame_ocean:   { gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee, #0ea5e9)',      glow: 'rgba(6,182,212,0.5)' },
        frame_galaxy:  { gradient: 'linear-gradient(135deg, #312e81, #a855f7, #ec4899)',      glow: 'rgba(168,85,247,0.55)' },
        frame_rainbow: { gradient: 'conic-gradient(from 0deg, #ef4444, #f59e0b, #84cc16, #06b6d4, #6366f1, #a855f7, #ec4899, #ef4444)', glow: 'rgba(236,72,153,0.55)' },
        frame_shadow:  { gradient: 'linear-gradient(135deg, #0f0f12, #1f2937, #111827)',      glow: 'rgba(17,24,39,0.65)' },
        frame_aurora:  { gradient: 'linear-gradient(135deg, #34d399, #22d3ee, #a78bfa, #f472b6)', glow: 'rgba(52,211,153,0.55)' },
        frame_mythic:  { gradient: 'conic-gradient(from 120deg, #dc2626, #f59e0b, #facc15, #dc2626)', glow: 'rgba(239,68,68,0.6)' },
    };

    const NAME_EFFECT_STYLES = {
        name_gold:    { gradient: 'linear-gradient(90deg, #f59e0b, #fde047, #f59e0b)' },
        name_rainbow: { gradient: 'linear-gradient(90deg, #ef4444, #f59e0b, #84cc16, #06b6d4, #a855f7, #ec4899)' },
        name_fire:    { gradient: 'linear-gradient(90deg, #dc2626, #f97316, #facc15)' },
        name_galaxy:  { gradient: 'linear-gradient(90deg, #312e81, #a855f7, #ec4899)' },
    };

    let _shopData = null;

    // ── Load Shop ─────────────────────────────────────────────
    QV.loadShop = async function loadShop() {
        const grid = $('shop-items-grid');
        grid.innerHTML = '<p class="text-muted" style="text-align:center; padding: 2rem;">Loading shop...</p>';

        try {
            const data = await api('/shop/items');
            _shopData = data;
            $('shop-points-badge').textContent = (data.points || 0) + ' pts';
            QV.updatePointsDisplay(data.points || 0);
            renderShop(data);
        } catch (err) {
            console.error('Shop load error:', err);
            grid.innerHTML = '<p class="text-muted" style="text-align:center; padding: 2rem;">Failed to load shop.</p>';
        }
    };

    function renderShop(data) {
        const grid = $('shop-items-grid');
        grid.innerHTML = '';

        const sections = [
            { type: 'frame',       title: 'Profile Frames',       subtitle: 'Show off with a glowing border.' },
            { type: 'nameEffect',  title: 'Name Effects',         subtitle: 'Make your username pop wherever it appears.' },
            { type: 'badge',       title: 'Profile Badges',       subtitle: 'Tiny flair that shows up next to your name.' },
            { type: 'membership',  title: 'Membership',           subtitle: 'Unlock every Diamond Pro perk.' },
        ];

        sections.forEach(sec => {
            const items = data.items.filter(i => i.type === sec.type);
            if (!items.length) return;
            const section = document.createElement('div');
            section.className = 'shop-section';
            section.innerHTML = `
                <div class="shop-section-header">
                    <h3 class="shop-section-title">${escapeHtml(sec.title)}</h3>
                    <p class="shop-section-subtitle">${escapeHtml(sec.subtitle)}</p>
                </div>
            `;
            const itemsWrap = document.createElement('div');
            itemsWrap.className = 'shop-cards';
            items.forEach(item => itemsWrap.appendChild(createItemCard(item, data.points)));
            section.appendChild(itemsWrap);
            grid.appendChild(section);
        });
    }

    function createItemCard(item, userPoints) {
        const card = document.createElement('div');
        card.className = 'shop-card glass-card shop-card-' + item.type + (item.owned ? ' shop-card-owned' : '');
        if (item.equipped) card.classList.add('shop-card-equipped');

        const frameStyle = FRAME_STYLES[item.id];
        const nameStyle = NAME_EFFECT_STYLES[item.id];
        let previewHtml = '';

        if (item.type === 'frame' && frameStyle) {
            previewHtml = `<div class="shop-frame-preview">
                <div class="shop-frame-ring" style="background:${frameStyle.gradient}; box-shadow: 0 0 16px ${frameStyle.glow};">
                    <div class="shop-frame-inner">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5">
                            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                        </svg>
                    </div>
                </div>
            </div>`;
        } else if (item.type === 'nameEffect' && nameStyle) {
            previewHtml = `<div class="shop-name-preview">
                <span class="shop-name-sample" style="background-image:${nameStyle.gradient};-webkit-background-clip:text;background-clip:text;color:transparent;">${escapeHtml(item.name.replace(/ Name$/,'')) || 'Name'}</span>
            </div>`;
        } else if (item.type === 'badge') {
            const emoji = item.emoji || '⭐';
            const color = item.color || '#fbbf24';
            previewHtml = `<div class="shop-badge-preview">
                <div class="shop-badge-chip" style="background: linear-gradient(135deg, ${color}33, ${color}66); box-shadow: 0 0 14px ${color}66; border: 1px solid ${color};">
                    <span style="font-size:1.7rem; line-height:1;">${emoji}</span>
                </div>
            </div>`;
        } else if (item.type === 'membership') {
            previewHtml = `<div class="shop-membership-preview">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <polygon points="12 2 22 9 18 21 6 21 2 9" fill="url(#shopDiamondGrad)" stroke="none"/>
                    <defs><linearGradient id="shopDiamondGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#a855f7"/><stop offset="50%" stop-color="#ec4899"/><stop offset="100%" stop-color="#fbbf24"/>
                    </linearGradient></defs>
                </svg>
            </div>`;
        }

        let actionHtml = '';
        const equippable = item.type === 'frame' || item.type === 'nameEffect' || item.type === 'badge';
        if (item.owned && equippable) {
            if (item.equipped) {
                actionHtml = `<button class="btn btn-shop-equipped" disabled>Equipped ✓</button>`;
            } else {
                actionHtml = `<button class="btn btn-shop-equip" data-item-id="${item.id}" data-item-type="${item.type}">Equip</button>`;
            }
        } else if (item.owned && item.type === 'membership') {
            actionHtml = `<span class="shop-owned-label">Owned</span>
                <button class="btn btn-shop-buy" data-item-id="${item.id}" ${userPoints < item.price ? 'disabled title="Not enough points"' : ''}>Extend</button>`;
        } else {
            const canAfford = userPoints >= item.price;
            actionHtml = `<button class="btn btn-shop-buy" data-item-id="${item.id}" ${!canAfford ? 'disabled title="Not enough points"' : ''}>Buy</button>`;
        }

        card.innerHTML = `
            ${previewHtml}
            <div class="shop-card-info">
                <div class="shop-card-name">${escapeHtml(item.name)}</div>
                <div class="shop-card-desc">${escapeHtml(item.description)}</div>
            </div>
            <div class="shop-card-footer">
                <div class="shop-card-price">
                    <span class="shop-coin-icon">&#x1FA99;</span> ${item.price}
                </div>
                <div class="shop-card-action">${actionHtml}</div>
            </div>
        `;

        // Bind buy button
        const buyBtn = card.querySelector('.btn-shop-buy');
        if (buyBtn) {
            buyBtn.addEventListener('click', () => handlePurchase(item.id, buyBtn));
        }

        // Bind equip button
        const equipBtn = card.querySelector('.btn-shop-equip');
        if (equipBtn) {
            equipBtn.addEventListener('click', () => handleEquip(item.id, item.type));
        }

        return card;
    }

    async function handlePurchase(itemId, btn) {
        btn.disabled = true;
        btn.textContent = 'Buying...';
        try {
            const result = await api('/shop/purchase', { method: 'POST', body: { itemId } });
            toast('Purchase successful!', 'success');
            // Update local user state
            if (state.user) {
                state.user.points = result.points;
                if (result.activeFrame !== undefined) state.user.activeFrame = result.activeFrame;
                if (result.activeNameEffect !== undefined) state.user.activeNameEffect = result.activeNameEffect;
                if (result.activeBadge !== undefined) state.user.activeBadge = result.activeBadge;
                if (result.isDiamondPro !== undefined) state.user.isDiamondPro = result.isDiamondPro;
                if (result.diamondExpiresAt !== undefined) state.user.diamondExpiresAt = result.diamondExpiresAt;
                QV.updatePointsDisplay(result.points);
            }
            QV.loadShop();
        } catch (err) {
            toast(err.message || 'Purchase failed', 'error');
            btn.disabled = false;
            btn.textContent = 'Buy';
        }
    }

    async function handleEquip(itemId, type) {
        try {
            let result;
            if (type === 'frame') {
                // Preserve older endpoint for frames (backward compat with server tests)
                result = await api('/shop/equip', { method: 'POST', body: { itemId, type } });
                if (state.user) state.user.activeFrame = result.activeFrame;
                toast('Frame equipped!', 'success');
            } else if (type === 'nameEffect') {
                result = await api('/shop/equip', { method: 'POST', body: { itemId, type } });
                if (state.user) state.user.activeNameEffect = result.activeNameEffect;
                toast('Name effect equipped!', 'success');
            } else if (type === 'badge') {
                result = await api('/shop/equip', { method: 'POST', body: { itemId, type } });
                if (state.user) state.user.activeBadge = result.activeBadge;
                toast('Badge equipped!', 'success');
            }
            QV.loadShop();
        } catch (err) {
            toast(err.message || 'Equip failed', 'error');
        }
    }

    // ── Points display updater ─────────────────────────────────
    QV.updatePointsDisplay = function updatePointsDisplay(pts) {
        const badge = $('shop-points-badge');
        if (badge) badge.textContent = (pts || 0) + ' pts';
        const sidebarPts = $('sidebar-points-display');
        if (sidebarPts) sidebarPts.textContent = (pts || 0);
    };

    // ── Auto-load when navigating to shop panel ─────────────────
    const shopNav = document.getElementById('nav-shop');
    if (shopNav) {
        shopNav.addEventListener('click', () => {
            QV.loadShop();
        });
    }
})();
