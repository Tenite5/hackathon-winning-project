/**
 * @file public/js/shop.js
 * @description Points shop — browse items, purchase, equip frames.
 */

(function () {
    'use strict';
    const { $, state, socket, showPanel, toast, escapeHtml, api } = QV;

    // Frame color/gradient map for preview rendering
    const FRAME_STYLES = {
        frame_gold: { gradient: 'linear-gradient(135deg, #ffd700, #f0c040, #ffd700)', glow: 'rgba(255,215,0,0.5)' },
        frame_diamond: { gradient: 'linear-gradient(135deg, #b9f2ff, #e0f7ff, #7dd3fc)', glow: 'rgba(125,211,252,0.5)' },
        frame_fire: { gradient: 'linear-gradient(135deg, #ff6b35, #ff4500, #ff8c00)', glow: 'rgba(255,69,0,0.5)' },
        frame_neon: { gradient: 'linear-gradient(135deg, #39ff14, #00ff88, #00ffcc)', glow: 'rgba(57,255,20,0.5)' },
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

        const frames = data.items.filter(i => i.type === 'frame');
        const memberships = data.items.filter(i => i.type === 'membership');

        if (frames.length) {
            const section = document.createElement('div');
            section.className = 'shop-section';
            section.innerHTML = '<h3 class="shop-section-title">Profile Frames</h3>';
            const itemsWrap = document.createElement('div');
            itemsWrap.className = 'shop-cards';
            frames.forEach(item => itemsWrap.appendChild(createItemCard(item, data.points)));
            section.appendChild(itemsWrap);
            grid.appendChild(section);
        }

        if (memberships.length) {
            const section = document.createElement('div');
            section.className = 'shop-section';
            section.innerHTML = '<h3 class="shop-section-title">Membership</h3>';
            const itemsWrap = document.createElement('div');
            itemsWrap.className = 'shop-cards';
            memberships.forEach(item => itemsWrap.appendChild(createItemCard(item, data.points)));
            section.appendChild(itemsWrap);
            grid.appendChild(section);
        }
    }

    function createItemCard(item, userPoints) {
        const card = document.createElement('div');
        card.className = 'shop-card glass-card' + (item.owned ? ' shop-card-owned' : '');

        const frameStyle = FRAME_STYLES[item.id];
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
        if (item.owned && item.type === 'frame') {
            if (item.equipped) {
                actionHtml = `<button class="btn btn-shop-equipped" disabled>Equipped</button>`;
            } else {
                actionHtml = `<button class="btn btn-shop-equip" data-frame-id="${item.id}">Equip</button>`;
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
            equipBtn.addEventListener('click', () => handleEquip(item.id));
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
                state.user.activeFrame = result.activeFrame;
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

    async function handleEquip(frameId) {
        try {
            const result = await api('/shop/equip-frame', { method: 'POST', body: { frameId } });
            if (state.user) state.user.activeFrame = result.activeFrame;
            toast('Frame equipped!', 'success');
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
