/**
 * @file public/js/auth.js
 * @description Firebase auth — Google + Email/Password sign-in, profile setup, logout.
 */

(function () {
    'use strict';
    const { $, $$, api, state, showView, toast } = QV;

    let auth = null; // firebase.auth instance, set after config loads

    // ── Load Firebase config from server ───────────────────────
    async function initFirebase() {
        try {
            const config = await api('/firebase-config');
            firebase.initializeApp(config);
            auth = firebase.auth();
        } catch (err) {
            console.error('Failed to load Firebase config:', err);
        }
    }

    // ── Helpers ────────────────────────────────────────────────
    function showAuthError(msg) {
        const el = $('auth-error');
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    function showSetupError(msg) {
        const el = $('setup-error');
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    // After Firebase gives us an idToken, send it to our backend
    async function authenticateWithBackend(firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        const data = await api('/firebase-auth', {
            method: 'POST',
            body: { idToken },
        });

        state.token = data.token;
        state.user = data.user;
        localStorage.setItem('qvizio_token', data.token);

        if (data.needsSetup) {
            // New user → show profile setup
            showProfileSetup(firebaseUser);
        } else {
            QV.onAuthenticated();
        }
    }

    // ── Profile Setup ──────────────────────────────────────────
    function showProfileSetup(firebaseUser) {
        showView('view-profile-setup');

        // Pre-fill with Google photo if available
        const photoURL = firebaseUser?.photoURL || '';
        const name = firebaseUser?.displayName || '';
        if (photoURL) {
            $('setup-avatar-preview').src = photoURL;
            $('setup-avatar-url').value = photoURL;
        }
        if (name) {
            $('setup-username').value = name.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
        }
    }

    // ── Tab Switching ──────────────────────────────────────────
    $$('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            $('form-login').classList.toggle('hidden', tab.dataset.tab !== 'login');
            $('form-register').classList.toggle('hidden', tab.dataset.tab !== 'register');
            $('auth-error').classList.add('hidden');
        });
    });

    // ── Email Login ────────────────────────────────────────────
    $('form-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('auth-error').classList.add('hidden');
        if (!auth) { showAuthError('Firebase not loaded yet. Please wait.'); return; }

        const email = $('login-email').value.trim();
        const password = $('login-password').value;
        if (!email || !password) { showAuthError('Fill in all fields.'); return; }

        try {
            const result = await auth.signInWithEmailAndPassword(email, password);
            await authenticateWithBackend(result.user);
        } catch (err) {
            const msg = err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found'
                ? 'Invalid email or password'
                : err.code === 'auth/invalid-credential'
                    ? 'Invalid email or password'
                    : err.message;
            showAuthError(msg);
        }
    });

    // ── Email Register ─────────────────────────────────────────
    $('form-register').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('auth-error').classList.add('hidden');
        if (!auth) { showAuthError('Firebase not loaded yet. Please wait.'); return; }

        const email = $('register-email').value.trim();
        const password = $('register-password').value;
        if (!email || !password) { showAuthError('Fill in all fields.'); return; }
        if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

        try {
            const result = await auth.createUserWithEmailAndPassword(email, password);
            // Send verification email (non-blocking)
            result.user.sendEmailVerification().catch(() => {});
            toast('Verification email sent! Check your inbox.', 'success');
            await authenticateWithBackend(result.user);
        } catch (err) {
            const msg = err.code === 'auth/email-already-in-use'
                ? 'An account with this email already exists. Try logging in.'
                : err.message;
            showAuthError(msg);
        }
    });

    // ── Forgot Password ────────────────────────────────────────
    $('btn-forgot-password').addEventListener('click', async (e) => {
        e.preventDefault();
        if (!auth) { showAuthError('Firebase not loaded yet.'); return; }
        const email = $('login-email').value.trim();
        if (!email) { showAuthError('Enter your email first, then click "Forgot password".'); return; }
        try {
            await auth.sendPasswordResetEmail(email);
            toast('Password reset email sent! Check your inbox.', 'success');
        } catch (err) {
            showAuthError(err.message);
        }
    });

    // ── Google Sign-In ─────────────────────────────────────────
    $('btn-google-login').addEventListener('click', async () => {
        $('auth-error').classList.add('hidden');
        if (!auth) { showAuthError('Firebase not loaded yet. Please wait.'); return; }

        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            const result = await auth.signInWithPopup(provider);
            await authenticateWithBackend(result.user);
        } catch (err) {
            if (err.code === 'auth/popup-closed-by-user') return;
            showAuthError(err.message || 'Google sign-in failed');
        }
    });

    // ── Complete Profile ───────────────────────────────────────
    $('btn-complete-profile').addEventListener('click', async () => {
        $('setup-error').classList.add('hidden');
        const username = $('setup-username').value.trim();
        const photoURL = $('setup-avatar-url').value.trim();

        if (!username || username.length < 2) {
            showSetupError('Name must be at least 2 characters.');
            return;
        }

        try {
            const data = await api('/complete-profile', {
                method: 'POST',
                body: { username, photoURL: photoURL || undefined },
            });
            state.user = data.user;
            QV.onAuthenticated();
            toast('Profile created! Welcome, ' + data.user.username + '!', 'success');
        } catch (err) {
            showSetupError(err.message);
        }
    });

    // Live preview avatar URL
    $('setup-avatar-url').addEventListener('input', () => {
        const url = $('setup-avatar-url').value.trim();
        if (url && url.startsWith('http')) {
            $('setup-avatar-preview').src = url;
        }
    });
    // Fallback if image fails
    $('setup-avatar-preview').addEventListener('error', () => {
        const name = $('setup-username').value.trim() || 'Q';
        $('setup-avatar-preview').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6C5CE7&color=fff&size=100`;
    });

    // ── Logout ─────────────────────────────────────────────────
    $('btn-logout').addEventListener('click', async () => {
        try { if (auth) await auth.signOut(); } catch (_) { /* ignore */ }
        state.token = null;
        state.user = null;
        localStorage.removeItem('qvizio_token');
        QV.socket.disconnect();
        QV.socket.connect();
        showView('view-auth');
    });

    // ── Init ───────────────────────────────────────────────────
    initFirebase();
})();
