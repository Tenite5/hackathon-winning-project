/**
 * @file public/js/mobile.js
 * @description Mobile navigation, more menu, mobile chat overlay.
 */

(function () {
    'use strict';
    const { $, $$, state, socket, showPanel } = QV;

    // ── Mobile Bottom Nav (uses router for pushState / back-button)
    $$('.mobile-nav-btn[data-panel]').forEach(btn => {
        btn.addEventListener('click', () => {
            var path = QV.panelToPath(btn.dataset.panel);
            if (path) {
                QV.navigateTo(path);
            } else {
                showPanel(btn.dataset.panel);
            }
        });
    });

    // ── More Button ────────────────────────────────────────────
    const moreBtn = $('mnav-more');
    if (moreBtn) {
        moreBtn.addEventListener('click', () => {
            $('mobile-more-menu').classList.toggle('hidden');
        });
    }

    const moreBackdrop = $('mobile-more-backdrop');
    if (moreBackdrop) {
        moreBackdrop.addEventListener('click', () => {
            $('mobile-more-menu').classList.add('hidden');
        });
    }

    // ── More Menu Items (uses router for pushState / back-button)
    $$('.mobile-more-item[data-panel]').forEach(btn => {
        btn.addEventListener('click', () => {
            $('mobile-more-menu').classList.add('hidden');
            var path = QV.panelToPath(btn.dataset.panel);
            if (path) {
                QV.navigateTo(path);
            } else {
                showPanel(btn.dataset.panel);
            }
        });
    });

    // ── Mobile Chat Overlay ────────────────────────────────────
    const mobileChatBtn = $('mobile-chat-btn');
    if (mobileChatBtn) {
        mobileChatBtn.addEventListener('click', () => {
            $('mobile-more-menu').classList.add('hidden');
            $('mobile-chat-overlay').classList.remove('hidden');
            // Sync desktop chat messages to mobile
            const desktopMsgs = $('global-chat-messages');
            const mobileMsgs = $('mobile-chat-messages');
            if (desktopMsgs && mobileMsgs) {
                mobileMsgs.innerHTML = desktopMsgs.innerHTML;
                mobileMsgs.scrollTop = mobileMsgs.scrollHeight;
            }
        });
    }

    const mobileChatClose = $('mobile-chat-close');
    if (mobileChatClose) {
        mobileChatClose.addEventListener('click', () => {
            $('mobile-chat-overlay').classList.add('hidden');
        });
    }

    // Mobile chat send
    const btnMobileChatSend = $('btn-mobile-chat-send');
    if (btnMobileChatSend) {
        btnMobileChatSend.addEventListener('click', sendMobileChat);
    }
    const mobileChatInput = $('mobile-chat-input');
    if (mobileChatInput) {
        mobileChatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMobileChat();
        });
    }

    function sendMobileChat() {
        const input = $('mobile-chat-input');
        const text = input.value.trim();
        if (!text) return;
        socket.emit('global-chat', { text });
        input.value = '';
    }

    // ── Sync desktop chat to mobile via MutationObserver ───────
    const desktopChatContainer = $('global-chat-messages');
    if (desktopChatContainer) {
        const chatObserver = new MutationObserver(() => {
            const mobileMsgs = $('mobile-chat-messages');
            if (mobileMsgs && !$('mobile-chat-overlay').classList.contains('hidden')) {
                mobileMsgs.innerHTML = desktopChatContainer.innerHTML;
                mobileMsgs.scrollTop = mobileMsgs.scrollHeight;
            }
        });
        chatObserver.observe(desktopChatContainer, { childList: true });
    }
})();
