/**
 * @file public/js/auth.js
 * @description Firebase auth — Google + Email/Password sign-in, profile setup with drag-drop avatar, logout.
 */

(function () {
    'use strict';
    const { $, $$, api, state, showView, toast } = QV;

    let auth = null;
    let firebaseReady = null; // resolves when Firebase is initialized

    // ── Firebase Init (resolves a promise so handlers can await it) ──
    firebaseReady = (async () => {
        try {
            const config = await api('/firebase-config');
            firebase.initializeApp(config);
            auth = firebase.auth();
        } catch (err) {
            console.error('Failed to load Firebase config:', err);
            throw err;
        }
    })();

    // Wait for Firebase to be ready, show spinner text on button
    async function ensureFirebase() {
        if (auth) return;
        await firebaseReady;
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

    // Send Firebase ID token to our backend
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
            showProfileSetup(firebaseUser);
        } else {
            QV.onAuthenticated();
        }
    }

    // ── Profile Setup ──────────────────────────────────────────
    let avatarDataURL = ''; // holds base64 of uploaded image

    function showProfileSetup(firebaseUser) {
        showView('view-profile-setup');
        avatarDataURL = '';

        const photoURL = firebaseUser?.photoURL || '';
        const name = firebaseUser?.displayName || '';
        if (photoURL) {
            $('setup-avatar-preview').src = photoURL;
            // Google profile photo — we'll use URL, not base64
            avatarDataURL = photoURL;
        }
        if (name) {
            $('setup-username').value = name.replace(/[^a-zA-Z0-9_ ]/g, '').trim().replace(/\s+/g, '_').slice(0, 20);
        }
    }

    // ── Avatar File Upload ─────────────────────────────────────
    function processAvatarFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            showSetupError('Please select an image file.');
            return;
        }
        if (file.size > 4 * 1024 * 1024) {
            showSetupError('Image too large. Max 4 MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            // Resize to 200x200 for storage efficiency
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const size = 200;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                // Center-crop
                const min = Math.min(img.width, img.height);
                const sx = (img.width - min) / 2;
                const sy = (img.height - min) / 2;
                ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
                avatarDataURL = canvas.toDataURL('image/jpeg', 0.85);
                $('setup-avatar-preview').src = avatarDataURL;
                $('setup-error').classList.add('hidden');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Click to open file picker
    $('avatar-drop-zone').addEventListener('click', () => {
        $('setup-avatar-file').click();
    });
    $('setup-avatar-file').addEventListener('change', (e) => {
        if (e.target.files[0]) processAvatarFile(e.target.files[0]);
    });

    // Drag & drop
    const dropZone = $('avatar-drop-zone');
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) processAvatarFile(file);
    });

    // Paste image (Ctrl+V anywhere on setup page)
    document.addEventListener('paste', (e) => {
        // Only handle paste when profile setup view is active
        if (!$('view-profile-setup').classList.contains('active')) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) processAvatarFile(file);
                return;
            }
        }
    });

    // Fallback if image fails to load
    $('setup-avatar-preview').addEventListener('error', () => {
        const name = $('setup-username').value.trim() || 'Q';
        $('setup-avatar-preview').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6C5CE7&color=fff&size=200`;
    });

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
        try {
            await ensureFirebase();
        } catch { showAuthError('Could not connect. Please refresh.'); return; }

        const email = $('login-email').value.trim();
        const password = $('login-password').value;
        if (!email || !password) { showAuthError('Fill in all fields.'); return; }

        try {
            const result = await auth.signInWithEmailAndPassword(email, password);
            await authenticateWithBackend(result.user);
        } catch (err) {
            const msg = (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')
                ? 'Invalid email or password'
                : err.message;
            showAuthError(msg);
        }
    });

    // ── Email Register ─────────────────────────────────────────
    $('form-register').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('auth-error').classList.add('hidden');
        try {
            await ensureFirebase();
        } catch { showAuthError('Could not connect. Please refresh.'); return; }

        const email = $('register-email').value.trim();
        const password = $('register-password').value;
        if (!email || !password) { showAuthError('Fill in all fields.'); return; }
        if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

        try {
            const result = await auth.createUserWithEmailAndPassword(email, password);
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
        try { await ensureFirebase(); } catch { showAuthError('Could not connect.'); return; }
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
        try { await ensureFirebase(); } catch { showAuthError('Could not connect. Please refresh.'); return; }

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
        if (!username || username.length < 2) {
            showSetupError('Name must be at least 2 characters.');
            return;
        }

        try {
            const data = await api('/complete-profile', {
                method: 'POST',
                body: {
                    username,
                    photoURL: avatarDataURL || undefined,
                },
            });
            state.user = data.user;
            QV.onAuthenticated();
            toast('Welcome, ' + data.user.username + '!', 'success');
        } catch (err) {
            showSetupError(err.message);
        }
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
})();
