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

        $('profile-avatar-letter').textContent = u.username[0].toUpperCase();
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

            $('modal-profile-avatar-letter').textContent = u.username[0].toUpperCase();
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
                row.innerHTML = `
                    <span class="lb-rank ${rankClass}">${idx + 1}</span>
                    <div class="lb-user">
                        <div class="lb-avatar" style="background: ${getRankColor(user.elo)}">${user.username[0].toUpperCase()}</div>
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
})();
