/**
 * @file services/gameEngine.js
 * @description Core game flow — question delivery, answer processing, scoring, wrong-answer recording, and game-over logic.
 */

'use strict';

const db = require('../db/store');
const { calculateElo, sanitizeUser } = require('./elo');
const { generateBio } = require('./ai');

/**
 * Simple XOR-based obfuscation for question data sent over sockets.
 * Prevents casual inspection of answers in browser devtools.
 * NOT cryptographic security — just enough to stop inspect-menu cheating.
 */
const OBFUSCATION_KEY = 'QvZ!0_s3cR3t';

function obfuscateString(str) {
    const bytes = Buffer.from(str, 'utf8');
    const key = Buffer.from(OBFUSCATION_KEY, 'utf8');
    const result = Buffer.alloc(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        result[i] = bytes[i] ^ key[i % key.length];
    }
    return result.toString('base64');
}

/** Obfuscate question data before sending to clients */
function obfuscateQuestion(q) {
    return {
        question: obfuscateString(q.question),
        options: q.options.map(o => obfuscateString(o)),
        difficulty: q.difficulty,
    };
}

/** Strip sensitive fields from question for game-over review */
function sanitizeQuestionForReview(q) {
    const correct = (typeof q.correct === 'number' && q.correct >= 0 && q.correct < q.options.length)
        ? q.correct : 0;
    return {
        question: q.question,
        options: q.options,
        correct,
        difficulty: q.difficulty,
    };
}

/** Record wrong answers for every player in a finished game. */
function recordWrongAnswers(game) {
    if (!game) return;

    game.players.forEach(player => {
        const userId = player.userId;
        if (!db.wrongAnswers.has(userId)) {
            db.wrongAnswers.set(userId, []);
        }
        const userLog = db.wrongAnswers.get(userId);

        const questionsPlayed = Math.min(game.currentQuestion + 1, game.questions.length);
        game.questions.slice(0, questionsPlayed).forEach((q, idx) => {
            const myAnswer = player.answers[idx];
            if (myAnswer && myAnswer.isCorrect) return;

            const entryId = `${game.id}_${idx}`;
            if (userLog.find(e => e.id === entryId)) return;

            userLog.push({
                id: entryId,
                topic: game.topic,
                question: q.question,
                options: q.options,
                correctIndex: q.correct,
                correctAnswer: q.options[q.correct],
                yourAnswerIndex: myAnswer ? myAnswer.answerIndex : -1,
                yourAnswer: myAnswer && myAnswer.answerIndex >= 0 ? q.options[myAnswer.answerIndex] : 'No answer (timed out)',
                timedOut: !myAnswer || myAnswer.answerIndex < 0,
                difficulty: q.difficulty || 'medium',
                playedAt: game.createdAt || Date.now(),
            });
        });

        userLog.sort((a, b) => b.playedAt - a.playedAt);
        if (userLog.length > 100) {
            userLog.length = 100;
        }
        db.saveWrongAnswers(userId);
    });
}

/** Update per-category stats for an array of users after a game. */
function updateCategoryStats(game, winnerUserId, isDraw) {
    const cat = game.topic;
    game.players.forEach(p => {
        const u = db.users.get(p.userId);
        if (!u) return;
        if (!u.stats.categories[cat]) {
            u.stats.categories[cat] = { wins: 0, losses: 0, accuracy: 0, totalAnswered: 0, correctAnswers: 0 };
        }
        if (!isDraw && winnerUserId === p.userId) {
            u.stats.categories[cat].wins++;
        } else if (!isDraw) {
            u.stats.categories[cat].losses++;
        }
        const correct = p.answers.filter(a => a && a.isCorrect).length;
        const total = p.answers.filter(a => a).length;
        u.stats.totalAnswers += total;
        u.stats.correctAnswers += correct;
        u.stats.categories[cat].totalAnswered += total;
        u.stats.categories[cat].correctAnswers += correct;
        u.stats.categories[cat].accuracy = u.stats.categories[cat].totalAnswered > 0
            ? u.stats.categories[cat].correctAnswers / u.stats.categories[cat].totalAnswered
            : 0;
    });
}

/** Send the next question for a game. Sets timers. Returns void. */
function startGameQuestion(gameId, io) {
    const game = db.games.get(gameId);
    if (!game || game.status !== 'playing') return;

    if (game.currentQuestion >= game.questions.length) {
        endGame(gameId, io);
        return;
    }

    const q = game.questions[game.currentQuestion];
    game.questionStartTime = Date.now();

    const questionId = `${gameId}_q${game.currentQuestion}_${Date.now()}`;
    game.currentQuestionId = questionId;

    const obfuscated = obfuscateQuestion(q);

    io.to(gameId).emit('game-question', {
        gameId,
        questionId,
        questionIndex: game.currentQuestion,
        totalQuestions: game.questions.length,
        question: obfuscated.question,
        options: obfuscated.options,
        difficulty: obfuscated.difficulty,
        imageUrl: q.imageUrl || null,
        encoded: true,
        timeLimit: game.timeLimit,
        playerCount: game.players.length,
        gameType: game.type,
        topic: game.topic,
        scores: game.players.map(p => {
            const u = db.users.get(p.userId);
            return { userId: p.userId, username: p.username, score: p.score, elo: u ? u.elo : 1000, photoURL: u ? (u.photoURL || null) : null };
        }),
    });

    // timeLimit === 0 means infinite time (solo practice) — no auto-timeout
    if (game.timeLimit > 0) {
        game.questionTimer = setTimeout(() => {
            if (game.currentQuestionId !== questionId) return;

            game.players.forEach(p => {
                if (p.answers[game.currentQuestion] === undefined) {
                    p.answers[game.currentQuestion] = { answerIndex: -1, isCorrect: false, points: 0, elapsed: game.timeLimit };
                    if (p.socketId) {
                        io.to(p.socketId).emit('answer-result', {
                            correct: false,
                            points: 0,
                            correctAnswer: q.correct,
                            playerScore: p.score,
                            timeout: true,
                        });
                    }
                }
            });
            proceedToNextQuestion(gameId, io);
        }, (game.timeLimit + 1) * 1000);
    }
}

/** Advance to the next question after round summary. */
function proceedToNextQuestion(gameId, io) {
    const game = db.games.get(gameId);
    if (!game || game.status !== 'playing') return;

    const q = game.questions[game.currentQuestion];
    if (!q) {
        // Safety: if there's no question at this index, end the game
        endGame(gameId, io);
        return;
    }

    io.to(gameId).emit('round-summary', {
        gameId,
        questionIndex: game.currentQuestion,
        correctAnswer: q.correct,
        correctAnswerText: q.options[q.correct],
        playerCount: game.players.length,
        players: game.players.map(p => ({
            userId: p.userId,
            username: p.username,
            score: p.score,
            answer: p.answers[game.currentQuestion],
        })),
    });

    game.currentQuestion++;

    const delay = game.players.length > 2 ? 5000 : 3000;
    setTimeout(() => {
        startGameQuestion(gameId, io);
    }, delay);
}

/** Record match history and ELO snapshot for all players in a finished game. */
function recordMatchHistory(game, eloUpdates = {}) {
    if (!game || game.type === 'solo') return;

    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    const isDraw = sorted.length > 1 && sorted[0].score === sorted[1].score;
    const winnerId = isDraw ? null : sorted[0].userId;

    game.players.forEach(p => {
        const user = db.users.get(p.userId);
        if (!user) return;

        // Determine result
        let result = 'draw';
        if (!isDraw) result = p.userId === winnerId ? 'win' : 'loss';

        // Opponents info
        const opponents = game.players
            .filter(op => op.userId !== p.userId)
            .map(op => ({ userId: op.userId, username: op.username, score: op.score }));

        const eloDelta = eloUpdates[p.userId] || 0;

        const entry = {
            gameId: game.id,
            type: game.type,
            topic: game.topic,
            result,
            myScore: p.score,
            opponents,
            eloAfter: user.elo,
            eloChange: eloDelta,
            timestamp: Date.now(),
        };

        if (!user.matchHistory) user.matchHistory = [];
        user.matchHistory.unshift(entry);
        if (user.matchHistory.length > 50) user.matchHistory = user.matchHistory.slice(0, 50);

        // Snapshot ELO
        if (!user.eloHistory) user.eloHistory = [];
        user.eloHistory.push({ elo: user.elo, timestamp: Date.now() });
        if (user.eloHistory.length > 100) user.eloHistory = user.eloHistory.slice(-100);

        // Persistent Notification for ranked match ends
        if (eloDelta !== 0) {
            const { pushNotification, NOTIFICATION_TYPES } = require('./notifications');
            const { app } = require('../app');
            const io = app.get('io');
            if (io) {
                pushNotification(io, user.id, {
                    type: NOTIFICATION_TYPES.MATCH_RESULT,
                    title: `Match ${result === 'win' ? 'Victory' : 'Defeat'}!`,
                    message: `Topic: ${game.topic}. ELO ${eloDelta > 0 ? '+' : ''}${eloDelta}. New Rating: ${user.elo}`,
                    data: { gameId: game.id, eloChange: eloDelta }
                });
            }
        }

        db.saveUser(user.id);
    });
}

/** End a game — determine winner, update stats/elo, emit game-over. */
function endGame(gameId, io) {
    const game = db.games.get(gameId);
    if (!game) return;
    if (game.status === 'finished') return; // Prevent double-end
    game.status = 'finished';

    // Clear any running question timer
    if (game.questionTimer) {
        clearTimeout(game.questionTimer);
        game.questionTimer = null;
    }

    // Tournament match bookkeeping — record winner in bracket
    if (game.type === 'tournament' && game.tournamentId) {
        handleTournamentMatchEnd(game, io);
    }

    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];

    recordWrongAnswers(game);

    const isDraw = sorted.length > 1 && sorted[0].score === sorted[1].score;

    const isRanked = !isDraw && game.players.length === 2 && (
        game.type === 'quick' || (game.type === 'custom' && game.ranked !== false)
    );

    let eloUpdates = {};

    if (isRanked) {
        const winnerUser = db.users.get(winner.userId);
        const loserUser = db.users.get(sorted[1].userId);
        if (winnerUser && loserUser) {
            const { winnerNew, loserNew } = calculateElo(winnerUser.elo, loserUser.elo);

            eloUpdates[winnerUser.id] = winnerNew - winnerUser.elo;
            eloUpdates[loserUser.id] = loserNew - loserUser.elo;

            winnerUser.elo = Math.max(0, winnerNew);
            loserUser.elo = Math.max(0, loserNew);

            winnerUser.stats.totalWins++;
            loserUser.stats.totalLosses++;
            winnerUser.stats.gamesPlayed++;
            loserUser.stats.gamesPlayed++;

            const cat = game.topic;
            [winnerUser, loserUser].forEach(u => {
                if (!u.stats.categories[cat]) u.stats.categories[cat] = { wins: 0, losses: 0, accuracy: 0, totalAnswered: 0, correctAnswers: 0 };
            });
            winnerUser.stats.categories[cat].wins++;
            loserUser.stats.categories[cat].losses++;

            game.players.forEach(p => {
                const u = db.users.get(p.userId);
                if (u) {
                    const correct = p.answers.filter(a => a && a.isCorrect).length;
                    const total = p.answers.filter(a => a).length;
                    u.stats.totalAnswers += total;
                    u.stats.correctAnswers += correct;
                    if (u.stats.categories[cat]) {
                        u.stats.categories[cat].totalAnswered += total;
                        u.stats.categories[cat].correctAnswers += correct;
                        u.stats.categories[cat].accuracy = u.stats.categories[cat].totalAnswered > 0
                            ? u.stats.categories[cat].correctAnswers / u.stats.categories[cat].totalAnswered
                            : 0;
                    }
                }
            });

            const eloDelta = eloUpdates[winnerUser.id];

            io.to(gameId).emit('game-over', {
                gameId,
                winner: { userId: winner.userId, username: winner.username, score: winner.score },
                isDraw: false,
                eloDelta,
                playerCount: game.players.length,
                players: game.players.map(p => {
                    const u = db.users.get(p.userId);
                    return {
                        userId: p.userId,
                        username: p.username,
                        score: p.score,
                        answers: p.answers,
                        elo: u ? u.elo : 0,
                        eloChange: eloUpdates[p.userId] || 0,
                    };
                }),
                questions: game.questions.map(sanitizeQuestionForReview),
                topic: game.topic,
            });

            if (winnerUser.stats.gamesPlayed % 3 === 0) generateBio(winnerUser).then(bio => { winnerUser.bio = bio; db.saveUser(winnerUser.id); }).catch(err => console.error('Bio regen error:', err.message));
            if (loserUser.stats.gamesPlayed % 3 === 0) generateBio(loserUser).then(bio => { loserUser.bio = bio; db.saveUser(loserUser.id); }).catch(err => console.error('Bio regen error:', err.message));

            db.saveUser(winnerUser.id);
            db.saveUser(loserUser.id);

            return;
        }
    }

    // Non-ranked games
    if (game.type !== 'solo') {
        const cat = game.topic;
        game.players.forEach(p => {
            const u = db.users.get(p.userId);
            if (u) {
                u.stats.gamesPlayed++;
                if (!u.stats.categories[cat]) u.stats.categories[cat] = { wins: 0, losses: 0, accuracy: 0, totalAnswered: 0, correctAnswers: 0 };
                if (!isDraw && winner.userId === p.userId) {
                    u.stats.totalWins++;
                    u.stats.categories[cat].wins++;
                } else if (!isDraw) {
                    u.stats.totalLosses++;
                    u.stats.categories[cat].losses++;
                }
                const correct = p.answers.filter(a => a && a.isCorrect).length;
                const total = p.answers.filter(a => a).length;
                u.stats.totalAnswers += total;
                u.stats.correctAnswers += correct;
                u.stats.categories[cat].totalAnswered += total;
                u.stats.categories[cat].correctAnswers += correct;
                u.stats.categories[cat].accuracy = u.stats.categories[cat].totalAnswered > 0
                    ? u.stats.categories[cat].correctAnswers / u.stats.categories[cat].totalAnswered
                    : 0;
                if (u.stats.gamesPlayed % 3 === 0) generateBio(u).then(bio => { u.bio = bio; db.saveUser(u.id); }).catch(err => console.error('Bio regen error:', err.message));
                db.saveUser(u.id);
            }
        });
    }

    io.to(gameId).emit('game-over', {
        gameId,
        winner: isDraw ? null : { userId: winner.userId, username: winner.username, score: winner.score },
        isDraw,
        playerCount: game.players.length,
        players: game.players.map(p => ({
            userId: p.userId,
            username: p.username,
            score: p.score,
            answers: p.answers,
        })),
        questions: game.questions.map(sanitizeQuestionForReview),
        topic: game.topic,
    });

    // Record match history for all players, including ELO changes if ranked
    recordMatchHistory(game, eloUpdates);
}

/** Handle tournament bracket update after a match ends. */
function handleTournamentMatchEnd(game, io) {
    const t = db.tournaments.get(game.tournamentId);
    if (!t) return;

    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    const winnerId = sorted[0] ? sorted[0].userId : null;
    if (!winnerId) return;

    // Find the bracket and match, update winnerId
    for (const bracket of t.brackets) {
        const match = bracket.matches.find(m => m.gameId === game.id);
        if (match) {
            match.winnerId = winnerId;
            break;
        }
    }

    // Notify tournament room
    io.to(`tournament-${game.tournamentId}`).emit('tournament-match-result', {
        tournamentId: game.tournamentId,
        gameId: game.id,
        winnerId,
        brackets: t.brackets,
    });

    // Defer the round completion check to allow the lazy-loaded module to be available
    setTimeout(() => {
        try {
            const { checkRoundCompletion } = require('../sockets/tournament');
            checkRoundCompletion(game.tournamentId, io);
        } catch (err) {
            console.error('Tournament round check failed:', err.message);
        }
    }, 500);
}

/** Handle a player's answer to the current question. */
function handleAnswer(io, socket, currentUser, gameId, answerIndex) {
    if (!currentUser) return;
    const game = db.games.get(gameId);
    if (!game || game.status !== 'playing') return;

    const player = game.players.find(p => p.userId === currentUser.id);
    if (!player) return;

    const q = game.questions[game.currentQuestion];
    if (!q) return;

    if (player.answers[game.currentQuestion] !== undefined) return;

    const elapsed = (Date.now() - game.questionStartTime) / 1000;
    const timeLimit = game.timeLimit || 10;
    const isCorrect = answerIndex === q.correct;

    let points = 0;
    if (isCorrect) {
        // No speed bonus in infinite-time mode — flat 100 points for correct
        const speedBonus = timeLimit === 0 ? 30 : Math.round(30 * Math.max(0, 1 - elapsed / timeLimit));
        points = 70 + speedBonus;
    }

    player.answers[game.currentQuestion] = { answerIndex, isCorrect, points, elapsed };
    player.score += points;

    socket.emit('answer-result', {
        correct: isCorrect,
        points,
        correctAnswer: q.correct,
        playerScore: player.score,
    });

    // Notify all other players that this player has answered
    game.players.forEach(p => {
        if (p.userId !== currentUser.id && p.socketId) {
            io.to(p.socketId).emit('opponent-answered', { hasAnswered: true, userId: currentUser.id });
        }
    });

    const allAnswered = game.players.every(p => p.answers[game.currentQuestion] !== undefined);
    if (allAnswered) {
        clearTimeout(game.questionTimer);
        proceedToNextQuestion(gameId, io);
    }
}

/** Handle disconnect mid-game — forfeit logic with ELO penalty. */
function handleDisconnectFromGames(io, currentUser) {
    if (!currentUser) return;

    for (const [, game] of db.games) {
        if (game.status !== 'playing') continue;
        const player = game.players.find(p => p.userId === currentUser.id);
        if (!player) continue;

        game.status = 'finished';
        clearTimeout(game.questionTimer);
        recordWrongAnswers(game);

        const isRanked = game.players.length === 2 && (
            game.type === 'quick' || (game.type === 'custom' && game.ranked !== false)
        );

        const winner = game.players.find(p => p.userId !== currentUser.id);

        if (isRanked && winner) {
            const winnerUser = db.users.get(winner.userId);
            const loserUser = db.users.get(currentUser.id);
            if (winnerUser && loserUser) {
                const K_ABANDON = 48;
                const expected = 1 / (1 + Math.pow(10, (loserUser.elo - winnerUser.elo) / 400));
                const winnerNew = Math.round(winnerUser.elo + K_ABANDON * (1 - expected));
                const loserNew = Math.round(loserUser.elo + K_ABANDON * (0 - (1 - expected)));
                const eloDelta = winnerNew - winnerUser.elo;

                winnerUser.elo = Math.max(0, winnerNew);
                loserUser.elo = Math.max(0, loserNew);

                winnerUser.stats.totalWins++;
                loserUser.stats.totalLosses++;
                winnerUser.stats.gamesPlayed++;
                loserUser.stats.gamesPlayed++;

                const cat = game.topic;
                [winnerUser, loserUser].forEach(u => {
                    if (!u.stats.categories[cat]) u.stats.categories[cat] = { wins: 0, losses: 0, accuracy: 0, totalAnswered: 0, correctAnswers: 0 };
                });
                winnerUser.stats.categories[cat].wins++;
                loserUser.stats.categories[cat].losses++;

                game.players.forEach(p => {
                    const u = db.users.get(p.userId);
                    if (u) {
                        const correct = p.answers.filter(a => a && a.isCorrect).length;
                        const total = p.answers.filter(a => a).length;
                        u.stats.totalAnswers += total;
                        u.stats.correctAnswers += correct;
                        if (u.stats.categories[cat]) {
                            u.stats.categories[cat].totalAnswered += total;
                            u.stats.categories[cat].correctAnswers += correct;
                            u.stats.categories[cat].accuracy = u.stats.categories[cat].totalAnswered > 0
                                ? u.stats.categories[cat].correctAnswers / u.stats.categories[cat].totalAnswered
                                : 0;
                        }
                    }
                });

                db.saveUser(winnerUser.id);
                db.saveUser(loserUser.id);

                io.to(game.id).emit('game-over', {
                    reason: 'opponent-disconnect',
                    winner: { userId: winner.userId, username: winner.username, score: winner.score },
                    isDraw: false,
                    eloDelta,
                    playerCount: game.players.length,
                    players: game.players.map(p => {
                        const u = db.users.get(p.userId);
                        return {
                            userId: p.userId,
                            username: p.username,
                            score: p.score,
                            answers: p.answers,
                            elo: u ? u.elo : 0,
                            eloChange: p.userId === winner.userId ? eloDelta : -eloDelta,
                        };
                    }),
                    questions: game.questions.map(sanitizeQuestionForReview),
                    topic: game.topic,
                });
                continue;
            }
        }

        // Non-ranked or solo
        if (winner) {
            io.to(game.id).emit('game-over', {
                reason: 'opponent-disconnect',
                winner: { userId: winner.userId, username: winner.username, score: winner.score },
                players: game.players,
                questions: game.questions.map(sanitizeQuestionForReview),
            });
        }
    }
}

/** Handle a voluntary forfeit (leave game button). Ends game as a loss for the forfeiter. */
function handleForfeit(io, socket, currentUser, gameId) {
    if (!currentUser) return;
    const game = db.games.get(gameId);
    if (!game || game.status !== 'playing') return;
    const player = game.players.find(p => p.userId === currentUser.id);
    if (!player) return;

    if (game.type === 'solo') {
        game.status = 'finished';
        clearTimeout(game.questionTimer);
        return;
    }

    // Leave the socket room so the broadcast game-over doesn't loop back to the forfeiter
    if (socket) socket.leave(gameId);

    handleDisconnectFromGames(io, currentUser);
}

module.exports = {
    startGameQuestion,
    proceedToNextQuestion,
    endGame,
    handleAnswer,
    handleDisconnectFromGames,
    handleForfeit,
    recordWrongAnswers,
};
