/**
 * @file public/js/auth.js
 * @description Google Sign-In via Firebase, logout.
 */

(function () {
    'use strict';
    const { $, api, state, showView, toast } = QV;

    // ── Firebase config ────────────────────────────────────────
    const firebaseConfig = {
        apiKey: "AIzaSyDXZsgi2jypW5kPy4EaH-ScUPNBy5B8Dkc",
        authDomain: "quizrankedio.firebaseapp.com",
        projectId: "quizrankedio",
        storageBucket: "quizrankedio.firebasestorage.app",
        messagingSenderId: "1069522836587",
        appId: "1:1069522836587:web:67d04f02e2a1f4b427e52e",
        measurementId: "G-TXLFGWBF1D"
    };

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // ── Helpers ────────────────────────────────────────────────
    function showAuthError(msg) {
        const el = $('auth-error');
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    // ── Google Sign-In ─────────────────────────────────────────
    $('btn-google-login').addEventListener('click', async () => {
        $('auth-error').classList.add('hidden');
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            const result = await auth.signInWithPopup(provider);
            const idToken = await result.user.getIdToken();

            // Send token to our backend
            const data = await api('/google-auth', {
                method: 'POST',
                body: { idToken },
            });

            state.token = data.token;
            state.user = data.user;
            localStorage.setItem('qvizio_token', data.token);
            QV.onAuthenticated();
        } catch (err) {
            if (err.code === 'auth/popup-closed-by-user') return;
            showAuthError(err.message || 'Google sign-in failed');
        }
    });

    // ── Logout ─────────────────────────────────────────────────
    $('btn-logout').addEventListener('click', async () => {
        // Sign out of Firebase
        try { await auth.signOut(); } catch (_) { /* ignore */ }
        state.token = null;
        state.user = null;
        localStorage.removeItem('qvizio_token');
        QV.socket.disconnect();
        QV.socket.connect();
        showView('view-auth');
    });
})();
