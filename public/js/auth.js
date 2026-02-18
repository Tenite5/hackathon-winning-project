/**
 * @file public/js/auth.js
 * @description Login / register form handlers, auth tab switching, logout.
 */

(function () {
    'use strict';
    const { $, $$, api, state, showView, toast } = QV;

    // Tab switching
    $$('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            $('form-login').classList.toggle('hidden', tab.dataset.tab !== 'login');
            $('form-register').classList.toggle('hidden', tab.dataset.tab !== 'register');
            $('auth-error').classList.add('hidden');
        });
    });

    function showAuthError(msg) {
        const el = $('auth-error');
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    $('form-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('auth-error').classList.add('hidden');
        try {
            const data = await api('/login', {
                method: 'POST',
                body: {
                    username: $('login-username').value.trim(),
                    password: $('login-password').value,
                },
            });
            state.token = data.token;
            state.user = data.user;
            localStorage.setItem('qvizio_token', data.token);
            QV.onAuthenticated();
        } catch (err) {
            showAuthError(err.message);
        }
    });

    $('form-register').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('auth-error').classList.add('hidden');
        try {
            const data = await api('/register', {
                method: 'POST',
                body: {
                    username: $('register-username').value.trim(),
                    password: $('register-password').value,
                },
            });
            state.token = data.token;
            state.user = data.user;
            localStorage.setItem('qvizio_token', data.token);
            QV.onAuthenticated();
        } catch (err) {
            showAuthError(err.message);
        }
    });

    $('btn-logout').addEventListener('click', () => {
        state.token = null;
        state.user = null;
        localStorage.removeItem('qvizio_token');
        QV.socket.disconnect();
        QV.socket.connect();
        showView('view-auth');
    });
})();
