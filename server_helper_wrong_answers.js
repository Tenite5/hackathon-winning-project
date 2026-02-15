function recordWrongAnswers(game) {
    if (!game) return;

    game.players.forEach(player => {
        const userId = player.userId;
        if (!db.wrongAnswers.has(userId)) {
            db.wrongAnswers.set(userId, []);
        }
        const userLog = db.wrongAnswers.get(userId);

        game.questions.forEach((q, idx) => {
            const myAnswer = player.answers[idx];
            // If answer is correct, skip
            if (myAnswer && myAnswer.isCorrect) return;

            // Avoid duplicates? The game ID + question index is unique
            // But if we replay the same game ID somehow? Unlikely with uuidv4.

            userLog.push({
                id: `${game.id}_${idx}`,
                topic: game.topic,
                question: q.question,
                options: q.options,
                correctIndex: q.correct,
                correctAnswer: q.options[q.correct],
                yourAnswerIndex: myAnswer ? myAnswer.answerIndex : -1,
                yourAnswer: myAnswer && myAnswer.answerIndex >= 0 ? q.options[myAnswer.answerIndex] : 'No answer (timed out)',
                timedOut: !myAnswer || myAnswer.answerIndex < 0,
                difficulty: q.difficulty || 'medium',
                explanation: q.explanation || null,
                playedAt: game.createdAt,
            });
        });

        // Limit log size per user if needed (e.g. keep last 100)
        if (userLog.length > 100) {
            userLog.sort((a, b) => b.playedAt - a.playedAt);
            userLog.length = 100;
        }
    });
}
