/**
 * @file public/js/profile.js
 * @description Profile panel, public profile modal, leaderboard.
 */

(function () {
    'use strict';
    const { $, state, socket, showModal, toast, escapeHtml, getRankColor, api } = QV;

    // ═══════════════════════════════════════════════════════════════
    // OWN PROFILE
    // ═══════════════════════════════════════════════════════════════
    QV.updateProfile = function updateProfile() {
        if (!state.user) return;
        const u = state.user;

        // Show PFP or letter fallback
        const img = $('profile-avatar-img');
        const letter = $('profile-avatar-letter');
        if (u.photoURL) {
            img.src = u.photoURL;
            img.classList.remove('hidden');
            letter.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            letter.classList.remove('hidden');
            letter.textContent = u.username[0].toUpperCase();
        }

        $('profile-username').textContent = u.username;
        $('profile-rank-icon').style.background = u.rank.color;
        $('profile-rank-name').textContent = u.rank.name;
        $('profile-elo-value').textContent = u.elo;
        $('profile-bio-text').textContent = u.bio || 'No bio yet.';

        $('stat-wins').textContent = u.stats.totalWins || 0;
        $('stat-losses').textContent = u.stats.totalLosses || 0;
        $('stat-games').textContent = u.stats.gamesPlayed || 0;
        const acc = u.stats.totalAnswers > 0
            ? Math.round((u.stats.correctAnswers / u.stats.totalAnswers) * 100)
            : 0;
        $('stat-accuracy').textContent = acc + '%';
    };

    $('btn-regen-bio').addEventListener('click', async () => {
        $('btn-regen-bio').disabled = true;
        toast('Generating new bio...', 'info');
        try {
            const data = await api('/profile/regenerate-bio', { method: 'POST' });
            state.user.bio = data.bio;
            $('profile-bio-text').textContent = data.bio;
            toast('Bio updated!', 'success');
        } catch (err) {
            toast(err.message, 'error');
        }
        $('btn-regen-bio').disabled = false;
    });

    // ═══════════════════════════════════════════════════════════════
    // PUBLIC PROFILE VIEWER
    // ═══════════════════════════════════════════════════════════════
    QV.openUserProfile = async function openUserProfile(userId) {
        try {
            const data = await api(`/profile/${userId}`);
            const u = data.user;

            // Show PFP or letter fallback in modal
            const img = $('modal-profile-avatar-img');
            const letter = $('modal-profile-avatar-letter');
            if (u.photoURL) {
                img.src = u.photoURL;
                img.classList.remove('hidden');
                letter.classList.add('hidden');
            } else {
                img.classList.add('hidden');
                letter.classList.remove('hidden');
                letter.textContent = u.username[0].toUpperCase();
            }

            $('modal-profile-username').textContent = u.username;
            $('modal-profile-rank-icon').style.background = u.rank.color;
            $('modal-profile-rank-name').textContent = u.rank.name;
            $('modal-profile-elo').textContent = u.elo;
            $('modal-profile-bio').textContent = u.bio || 'No bio yet.';

            $('modal-stat-wins').textContent = u.stats.totalWins || 0;
            $('modal-stat-losses').textContent = u.stats.totalLosses || 0;
            $('modal-stat-games').textContent = u.stats.gamesPlayed || 0;
            const acc = u.stats.totalAnswers > 0
                ? Math.round((u.stats.correctAnswers / u.stats.totalAnswers) * 100)
                : 0;
            $('modal-stat-accuracy').textContent = acc + '%';

            showModal('modal-user-profile');
        } catch (err) {
            toast('Could not load profile: ' + err.message, 'error');
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // LEADERBOARD
    // ═══════════════════════════════════════════════════════════════
    QV.loadLeaderboard = async function loadLeaderboard() {
        try {
            const data = await api('/leaderboard');
            const table = $('leaderboard-table');

            if (data.leaderboard.length === 0) {
                table.innerHTML = `<div class="empty-state"><p>No players ranked yet. Be the first!</p></div>`;
                return;
            }

            table.innerHTML = `
                <div class="lb-row lb-header">
                    <span>#</span>
                    <span>Player</span>
                    <span>Elo</span>
                    <span>Rank</span>
                </div>
            `;

            data.leaderboard.forEach((user, idx) => {
                const rankClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : '';
                const row = document.createElement('div');
                row.className = 'lb-row';
                row.style.cursor = 'pointer';
                const avatarContent = user.photoURL
                    ? `<img src="${escapeHtml(user.photoURL)}" class="lb-avatar-img" alt="" />`
                    : `${user.username[0].toUpperCase()}`;
                row.innerHTML = `
                    <span class="lb-rank ${rankClass}">${idx + 1}</span>
                    <div class="lb-user">
                        <div class="lb-avatar" style="background: ${getRankColor(user.elo)}">${avatarContent}</div>
                        <span class="lb-username">${escapeHtml(user.username)}</span>
                    </div>
                    <span class="lb-elo">${user.elo}</span>
                    <span class="lb-badge" style="background: ${user.rank.color}20; color: ${user.rank.color}">${user.rank.name}</span>
                `;
                row.addEventListener('click', () => QV.openUserProfile(user.id));
                table.appendChild(row);
            });
        } catch (err) {
            console.error('Leaderboard error:', err);
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // SETTINGS
    // ═══════════════════════════════════════════════════════════════
    let settingsAvatarData = null; // null = unchanged, '' = removed, string = new photo

    QV.loadSettings = function loadSettings() {
        if (!state.user) return;
        $('settings-username').value = state.user.username;
        settingsAvatarData = null;
        const img = $('settings-avatar-img');
        if (state.user.photoURL) {
            img.src = state.user.photoURL;
            img.style.display = 'block';
        } else {
            img.src = '';
            img.style.display = 'none';
        }
        $('settings-error').classList.add('hidden');
        $('settings-status').classList.add('hidden');
    };

    // Process avatar file for settings (reuse resize logic)
    function processSettingsAvatar(file) {
        if (!file || !file.type.startsWith('image/')) {
            showSettingsError('Please select an image file.');
            return;
        }
        if (file.size > 4 * 1024 * 1024) {
            showSettingsError('Image too large. Max 4 MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const size = 200;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                const min = Math.min(img.width, img.height);
                const sx = (img.width - min) / 2;
                const sy = (img.height - min) / 2;
                ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
                settingsAvatarData = canvas.toDataURL('image/jpeg', 0.85);
                const preview = $('settings-avatar-img');
                preview.src = settingsAvatarData;
                preview.style.display = 'block';
                $('settings-error').classList.add('hidden');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function showSettingsError(msg) {
        const el = $('settings-error');
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    // Click to select file
    $('settings-avatar-zone').addEventListener('click', () => {
        $('settings-avatar-file').click();
    });
    $('settings-avatar-file').addEventListener('change', (e) => {
        if (e.target.files[0]) processSettingsAvatar(e.target.files[0]);
    });

    // Drag & drop
    const settingsDropZone = $('settings-avatar-zone');
    settingsDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        settingsDropZone.classList.add('drag-over');
    });
    settingsDropZone.addEventListener('dragleave', () => {
        settingsDropZone.classList.remove('drag-over');
    });
    settingsDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        settingsDropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) processSettingsAvatar(file);
    });

    // Paste image in settings
    document.addEventListener('paste', (e) => {
        if (state.currentPanel !== 'settings') return;
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                processSettingsAvatar(item.getAsFile());
                return;
            }
        }
    });

    // Remove avatar
    $('btn-remove-avatar').addEventListener('click', () => {
        settingsAvatarData = '';
        const img = $('settings-avatar-img');
        img.src = '';
        img.style.display = 'none';
    });

    // Save settings
    $('btn-save-settings').addEventListener('click', async () => {
        $('settings-error').classList.add('hidden');
        $('settings-status').classList.add('hidden');

        const username = $('settings-username').value.trim();
        if (!username || username.length < 2) {
            showSettingsError('Name must be at least 2 characters.');
            return;
        }

        const body = { username };
        if (settingsAvatarData !== null) {
            body.photoURL = settingsAvatarData;
        }

        try {
            $('btn-save-settings').disabled = true;
            const data = await api('/profile/update-settings', {
                method: 'POST',
                body,
            });
            state.user = data.user;
            QV.updateNavUser();
            QV.updateProfile();
            settingsAvatarData = null;

            const status = $('settings-status');
            status.textContent = '✓ Saved!';
            status.classList.remove('hidden');
            setTimeout(() => status.classList.add('hidden'), 3000);

            toast('Settings saved!', 'success');
        } catch (err) {
            showSettingsError(err.message);
        }
        $('btn-save-settings').disabled = false;
    });
})();
