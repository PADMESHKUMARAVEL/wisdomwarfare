import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { formatAccuracy } from '../../utils/helpers';

const API_BASE = process.env.REACT_APP_API_BASE ;

const GameUI = ({ user, onLogout, onFinish, gameCode }) => {
  const [socket, setSocket] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [result, setResult] = useState({
    message: '',
    correct: false,
    points: 0,
    correctAnswer: '',
    correctAnswerKey: null,
    showNextButton: false
  });
  const [leaderboard, setLeaderboard] = useState([]);
  const [gameStats, setGameStats] = useState({
    score: 0,
    correct: 0,
    total: 0,
    questionsAnswered: 0
  });
  const [connected, setConnected] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [finalResults, setFinalResults] = useState(null);
  const [gameStatus, setGameStatus] = useState({
    questionsLoaded: 0,
    isGameActive: false,
    currentIndex: -1,
    gameSessionId: null
  });
  const [loading, setLoading] = useState(true);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  // Removed canPlay state

  const timerRef = useRef(null);
  const socketRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Removed checkIfUserCanPlay function and its useEffect

  useEffect(() => {
    console.log('🎮 Initializing socket connection to:', API_BASE, 'for game', gameCode);

    const newSocket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = newSocket;
    setSocket(newSocket);
    setLoading(true);

    const normalizeCorrectAnswer = (raw, question) => {
      if (!question || !question.options) return null;
      if (!raw) return null;
      if (typeof raw === 'string' && question.options.hasOwnProperty(raw)) {
        return raw;
      }
      for (const [k, v] of Object.entries(question.options)) {
        if (v === raw) return k;
      }
      return null;
    };

    const onConnect = () => {
      console.log('✅ Connected to game server with ID:', newSocket.id);
      if (!mountedRef.current) return;
      setConnected(true);
      setLoading(false);

      // tell server which game + user
      newSocket.emit('joinGame', {
        game_code: gameCode || null,
        user_id: user?.user_id || user?.uid || null,
        email: user?.email || null
      });

      newSocket.emit('getGameStatus', { game_code: gameCode || null });
      fetchLeaderboard();
    };

    const onConnectError = (err) => {
      console.error('❌ Connection error:', err);
      if (!mountedRef.current) return;
      setConnected(false);
      setLoading(false);
    };

    const onDisconnect = (reason) => {
      console.log('❌ Disconnected from game server:', reason);
      if (!mountedRef.current) return;
      setConnected(false);
    };

    const onReconnect = (attemptNumber) => {
      console.log(`✅ Reconnected after ${attemptNumber} attempts`);
      if (!mountedRef.current) return;
      setConnected(true);
      newSocket.emit('joinGame', {
        game_code: gameCode || null,
        user_id: user?.user_id || user?.uid || null,
        email: user?.email || null
      });
      newSocket.emit('getGameStatus', { game_code: gameCode || null });
    };

    const onGameStatus = (status) => {
      console.log('📊 Game status received:', status);
      if (!mountedRef.current) return;
      setGameStatus((prev) => ({
        questionsLoaded: status.questionsLoaded ?? prev.questionsLoaded,
        isGameActive: Boolean(status.isGameActive),
        currentIndex:
          typeof status.currentIndex === 'number'
            ? status.currentIndex
            : prev.currentIndex,
        gameSessionId: status.gameSessionId ?? prev.gameSessionId
      }));
      setLoading(false);
    };

    const onGameStarted = (data) => {
      console.log('🎮 Game started:', data);
      if (!mountedRef.current) return;
      setGameStatus((prev) => ({ ...prev, isGameActive: true }));
    };

    const onNewQuestion = (question) => {
      console.log('❓ New question received:', question);
      if (!mountedRef.current) return;

      setCurrentQuestion(question);
      setTimeLeft(question.time || 30);
      setSelectedAnswer('');
      setResult({
        message: '',
        correct: false,
        points: 0,
        correctAnswer: '',
        correctAnswerKey: null,
        showNextButton: false
      });
      setIsAnswerSubmitted(false);

      if (timerRef.current) clearInterval(timerRef.current);

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setIsAnswerSubmitted(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const onQuestionClosed = (data) => {
      console.log('⏹️ Question closed:', data);
      if (timerRef.current) clearInterval(timerRef.current);
      if (!mountedRef.current) return;
      setIsAnswerSubmitted(true);

      setResult((prev) => {
        const q = currentQuestion;
        const normalizedKey = normalizeCorrectAnswer(
          data.correctAnswer ?? data.correct_answer ?? '',
          q
        );
        return {
          message:
            data.explanation ||
            `Time's up! Correct answer was: ${
              data.correctAnswer ?? data.correct_answer ?? ''
            }`,
          correct: false,
          points: 0,
          correctAnswer: data.correctAnswer ?? data.correct_answer ?? '',
          correctAnswerKey: normalizedKey,
          showNextButton: true
        };
      });
    };

    const onLeaderboardUpdate = (data) => {
      console.log('🏆 Leaderboard updated:', data);
      if (!mountedRef.current) return;
      setLeaderboard(Array.isArray(data) ? data : []);
    };

    const onAnswerResult = (data) => {
      console.log('📝 Answer result:', data);
      if (!mountedRef.current) return;

      // 🔒 Make sure this result is for THIS user only
      const eventUserMatches =
        !user ||
        (!data.user_id && !data.email) ||
        (user &&
          ((data.user_id &&
            (data.user_id === user.user_id || data.user_id === user.uid)) ||
            (data.email && data.email === user.email)));

      if (!eventUserMatches) {
        // ignore broadcasts meant for other players
        return;
      }

      setIsAnswerSubmitted(true);

      const q = currentQuestion;
      const normalizedKey = normalizeCorrectAnswer(
        data.correctAnswer ?? data.correct_answer ?? data.correct ?? '',
        q
      );

      if (data.error) {
        setResult({
          message: data.error,
          correct: false,
          points: 0,
          correctAnswer: data.correctAnswer || data.correct_answer || '',
          correctAnswerKey: normalizedKey || null,
          showNextButton: data.showNextButton ?? true
        });
      } else {
        setResult({
          message: data.message || '',
          correct: Boolean(data.correct),
          points: Number(data.points) || 0,
          correctAnswer: data.correctAnswer || data.correct_answer || '',
          correctAnswerKey: normalizedKey || null,
          showNextButton: data.showNextButton ?? true
        });

        setGameStats((prev) => {
          if (data.correct) {
            return {
              score: prev.score + (Number(data.points) || 0),
              correct: prev.correct + 1,
              total: prev.total + 1,
              questionsAnswered: prev.questionsAnswered + 1
            };
          }

          return {
            ...prev,
            total: prev.total + 1,
            questionsAnswered: prev.questionsAnswered + 1
          };
        });
      }
    };

    const onGameCompleted = (data) => {
      console.log('🎉 Game completed:', data);
      if (timerRef.current) clearInterval(timerRef.current);
      if (!mountedRef.current) return;
      setGameCompleted(true);
      setFinalResults(data);
      setIsAnswerSubmitted(true);
      setResult((prev) => ({ ...prev, showNextButton: false }));
      setGameStatus((prev) => ({ ...prev, isGameActive: false }));
    };

    newSocket.on('connect', onConnect);
    newSocket.on('connect_error', onConnectError);
    newSocket.on('disconnect', onDisconnect);
    newSocket.on('reconnect', onReconnect);
    newSocket.on('gameStatus', onGameStatus);
    newSocket.on('gameStarted', onGameStarted);
    newSocket.on('newQuestion', onNewQuestion);
    newSocket.on('questionClosed', onQuestionClosed);
    newSocket.on('leaderboardUpdate', onLeaderboardUpdate);
    newSocket.on('answerResult', onAnswerResult);
    newSocket.on('gameCompleted', onGameCompleted);

    fetchLeaderboard();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (newSocket) {
        newSocket.off('connect', onConnect);
        newSocket.off('connect_error', onConnectError);
        newSocket.off('disconnect', onDisconnect);
        newSocket.off('reconnect', onReconnect);
        newSocket.off('gameStatus', onGameStatus);
        newSocket.off('gameStarted', onGameStarted);
        newSocket.off('newQuestion', onNewQuestion);
        newSocket.off('questionClosed', onQuestionClosed);
        newSocket.off('leaderboardUpdate', onLeaderboardUpdate);
        newSocket.off('answerResult', onAnswerResult);
        newSocket.off('gameCompleted', onGameCompleted);

        try {
          newSocket.close();
        } catch (e) {
          console.warn('Error closing socket', e);
        }
      }

      socketRef.current = null;
      setSocket(null);
      setConnected(false);
    };
  }, [gameCode, user]);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${API_BASE}/leaderboard`);
      const data = await res.json();
      if (mountedRef.current) setLeaderboard(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    }
  };

  const handleAnswer = (answerKey) => {
    if (!socketRef.current || !user || !currentQuestion || isAnswerSubmitted) {
      console.log('Cannot submit answer:', {
        socket: !!socketRef.current,
        user: !!user,
        question: !!currentQuestion,
        submitted: isAnswerSubmitted
      });
      return;
    }

    setSelectedAnswer(answerKey);
    setIsAnswerSubmitted(true);

    const payload = {
      user_id: user.user_id || user.uid,
      answer: answerKey,
      email: user.email,
      display_name: user.display_name || user.displayName,
      game_code: gameCode || null
    };

    console.log('Submitting answer:', payload);
    socketRef.current.emit('submitAnswer', payload);
  };

  const handleNextQuestion = () => {
    if (socketRef.current && socketRef.current.connected) {
      console.log('➡️ Emitting nextQuestion event');
      socketRef.current.emit('nextQuestion', { game_code: gameCode || null });
      setResult((prev) => ({ ...prev, showNextButton: false }));
      setSelectedAnswer('');
      setIsAnswerSubmitted(false);
    } else {
      console.error('Socket not connected');
    }
  };

  const handlePlayAgain = () => {
    setGameCompleted(false);
    setFinalResults(null);
    setGameStats({
      score: 0,
      correct: 0,
      total: 0,
      questionsAnswered: 0
    });
    setCurrentQuestion(null);
    setResult({
      message: '',
      correct: false,
      points: 0,
      correctAnswer: '',
      correctAnswerKey: null,
      showNextButton: false
    });
    setIsAnswerSubmitted(false);

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('playAgain', {
        user_id: user?.user_id || user?.uid,
        game_code: gameCode || null
      });
      fetchLeaderboard();
    } else {
      window.location.reload();
    }
  };

  const refreshGameStatus = () => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('getGameStatus', { game_code: gameCode || null });
    }
  };

  const computedAccuracy =
    gameStats.total > 0
      ? formatAccuracy((gameStats.correct / gameStats.total) * 100)
      : '0.00';

  // Removed the "Game Already Played" section completely

  if (gameCompleted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-cyan-900 to-gray-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8 p-6 bg-gray-800 rounded-2xl border-2 border-cyan-600">
            <div>
              <h1 className="text-4xl font-bold text-cyan-400 mb-2">
                🎉 Game Completed! 🎉
              </h1>
              <p className="text-cyan-200">Wisdom Warfare - Final Results</p>
            </div>
            {user && (
              <div className="text-right">
                <p className="text-cyan-100 font-semibold">
                  {user.display_name || user.displayName}
                </p>
                <p className="text-cyan-200 text-sm">{user.email}</p>
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-2xl p-8 border-2 border-cyan-600">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-cyan-300 mb-4">
                Your Final Score
              </h2>
              <div className="text-6xl font-bold text-cyan-400 mb-2">
                {gameStats.score}
              </div>
              <div className="text-xl text-cyan-200">
                {gameStats.correct}/30 Correct • {computedAccuracy}% Accuracy
              </div>
            </div>

            {finalResults?.finalResults?.results && (
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-cyan-300 mb-4 text-center">
                  🏆 Final Rankings
                </h3>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {finalResults.finalResults.results.map((player, index) => {
                    const isCurrentUser =
                      user && player.email === user.email;
                    return (
                      <div
                        key={player.user_id}
                        className={`flex justify-between items-center p-4 rounded-lg ${
                          isCurrentUser
                            ? 'bg-cyan-700 border-2 border-cyan-400'
                            : index === 0
                            ? 'bg-yellow-600'
                            : index === 1
                            ? 'bg-gray-600'
                            : index === 2
                            ? 'bg-amber-800'
                            : 'bg-gray-700'
                        } ${isCurrentUser ? 'scale-105' : ''}`}
                      >
                        <div className="flex items-center">
                          <span
                            className={`text-xl font-bold mr-4 ${
                              index < 3 ? 'text-white' : 'text-cyan-300'
                            }`}
                          >
                            {index + 1}
                          </span>
                          <div>
                            <div
                              className={`font-semibold ${
                                isCurrentUser ? 'text-cyan-100' : 'text-white'
                              }`}
                            >
                              {player.display_name || player.email}
                            </div>
                            {isCurrentUser && (
                              <div className="text-cyan-200 text-sm">You</div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-cyan-300">
                            {player.session_score ?? player.score ?? 0} pts
                          </div>
                          <div className="text-sm text-gray-300">
                            {formatAccuracy(player.accuracy ?? 0)}% accuracy
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={onFinish}
                className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-lg transition-colors"
              >
                📊 View Dashboard
              </button>
              <button
                onClick={onLogout}
                className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-lg transition-colors"
              >
                🚪 Logout
              </button>
              <button
                onClick={handlePlayAgain}
                className="px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-lg transition-colors"
              >
                🔄 Play Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-cyan-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-cyan-400 mb-2">
            Connecting to Game...
          </h2>
          <p className="text-cyan-200">
            Please wait while we connect to the game server
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-cyan-900 to-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row justify-between items-center mb-8 p-6 bg-gray-800 rounded-2xl border-2 border-cyan-600">
          <div className="text-center lg:text-left mb-4 lg:mb-0">
            <h1 className="text-4xl font-bold text-cyan-400 mb-2">
              Wisdom Warfare
            </h1>
            <p className="text-cyan-200">Real-time Compiler Design Quiz</p>
            <div className="mt-2 text-sm text-cyan-300">
              Questions: {gameStatus.questionsLoaded} | Status:{' '}
              {gameStatus.isGameActive ? '🟢 ACTIVE' : '🟡 WAITING'} | Connection:{' '}
              {connected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
            {gameCode && (
              <div className="mt-1 text-xs text-cyan-400">
                Game Code: <span className="font-mono">{gameCode}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-center">
            {user && (
              <div className="text-center sm:text-right">
                <p className="text-cyan-100 font-semibold">
                  {user.display_name || user.displayName}
                </p>
                <p className="text-cyan-200 text-sm">{user.email}</p>
              </div>
            )}

            <div className="flex gap-2 items-center">
              <div
                className={`w-3 h-3 rounded-full ${
                  connected ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className="text-sm text-gray-300">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            <button
              onClick={refreshGameStatus}
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              Refresh
            </button>

            <button
              onClick={onLogout}
              className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-2xl p-6 border-2 border-cyan-600">
              {currentQuestion ? (
                <>
                  <div className="flex flex-col sm:flex-row justify-between items-center mb-6 p-4 bg-gray-700 rounded-lg">
                    <div className="flex items-center gap-4 mb-2 sm:mb-0">
                      <div className="text-2xl font-bold text-cyan-400 bg-gray-900 px-4 py-2 rounded-lg">
                        {timeLeft}s
                      </div>
                      <div className="text-lg text-gray-300">
                        Difficulty:{' '}
                        <span className="font-bold text-cyan-300">
                          {currentQuestion.difficulty}
                        </span>
                      </div>
                      <div className="text-lg text-cyan-200">
                        Question:{' '}
                        <span className="font-bold text-cyan-300">
                          {currentQuestion.questionNumber}/
                          {currentQuestion.totalQuestions}
                        </span>
                      </div>
                    </div>

                    <div className="text-lg text-cyan-200">
                      Your Score:{' '}
                      <span className="font-bold text-cyan-300">
                        {gameStats.score}
                      </span>
                    </div>
                  </div>

                  <h2 className="text-2xl font-bold text-white mb-8 leading-relaxed">
                    {currentQuestion.text}
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {Object.entries(currentQuestion.options || {}).map(
                      ([key, value]) => {
                        const isSelected = selectedAnswer === key;
                        const correctKeyFromResult =
                          result.correctAnswerKey ?? null;
                        const isCorrect = Boolean(result.correct) && isSelected;
                        const isWrong = !result.correct && isSelected;
                        const isCorrectAnswer = correctKeyFromResult
                          ? correctKeyFromResult === key
                          : result.correctAnswer &&
                            (result.correctAnswer === value ||
                              result.correctAnswer === key);
                        const isDisabled =
                          isAnswerSubmitted || timeLeft === 0;

                        return (
                          <button
                            key={key}
                            onClick={() => handleAnswer(key)}
                            disabled={isDisabled}
                            className={`p-4 rounded-xl text-left font-semibold text-lg transition-all duration-200 ${
                              isSelected
                                ? isCorrect
                                  ? 'bg-green-600 text-white border-2 border-green-400'
                                  : 'bg-red-600 text-white border-2 border-red-400'
                                : isCorrectAnswer && result.message
                                ? 'bg-green-600 text-white border-2 border-green-400'
                                : isDisabled
                                ? 'bg-gray-800 text-gray-500 border-2 border-gray-700 cursor-not-allowed'
                                : 'bg-gray-700 text-white hover:bg-gray-600 border-2 border-gray-600 hover:border-cyan-500 cursor-pointer hover:scale-105'
                            }`}
                          >
                            <span className="font-bold mr-3">{key}.</span>
                            {value}
                          </button>
                        );
                      }
                    )}
                  </div>

                  {result.message && (
                    <div
                      className={`p-4 rounded-lg mb-4 text-center font-bold text-lg ${
                        result.correct
                          ? 'bg-green-600 text-white'
                          : result.message.includes("Time's up")
                          ? 'bg-yellow-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {result.message}
                    </div>
                  )}

                {/*  {result.showNextButton && (
                    <div className="text-center">
                      <button
                        onClick={handleNextQuestion}
                        disabled={
                          !socketRef.current || !socketRef.current.connected
                        }
                        className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-lg transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                      >
                        {!socketRef.current || !socketRef.current.connected
                          ? 'Connecting...'
                          : 'Next Question →'}
                      </button>
                      <p className="text-gray-400 text-sm mt-2">
                        Click to proceed to the next question immediately
                      </p>
                    </div>
                  )}*/}

                  {!result.showNextButton &&
                    timeLeft > 0 &&
                    !isAnswerSubmitted && (
                      <div className="text-center text-gray-400 mt-4">
                        Next question in {timeLeft}s...
                      </div>
                    )}
                </>
              ) : (
                <div className="text-center py-16">
                  {gameStatus.questionsLoaded === 0 ? (
                    <>
                      <div className="text-6xl text-red-400 mb-6">❌</div>
                      <h3 className="text-3xl font-bold text-white mb-4">
                        No Questions Available
                      </h3>
                      <p className="text-gray-300 text-lg mb-4">
                        Please ask the administrator to upload questions.
                      </p>
                      <div className="text-cyan-300">
                        <a
                          href={`${API_BASE.replace(
                            '4001',
                            '4001'
                          )}/admin`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-cyan-200"
                        >
                          Go to Admin Panel
                        </a>
                      </div>
                    </>
                  ) : !gameStatus.isGameActive ? (
                    <>
                      <div className="text-6xl text-cyan-400 mb-6">⏳</div>
                      <h3 className="text-3xl font-bold text-white mb-4">
                        Waiting for Game to Start
                      </h3>
                      <p className="text-gray-300 text-lg">
                        The administrator will start the game shortly. Get
                        ready!
                      </p>
                      <div className="mt-4 text-cyan-300">
                        {gameStatus.questionsLoaded} questions loaded and ready
                      </div>
                      {!connected && (
                        <p className="text-red-400 mt-4">
                          Trying to reconnect...
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-6xl text-cyan-400 mb-6">⏳</div>
                      <h3 className="text-3xl font-bold text-white mb-4">
                        Waiting for next question...
                      </h3>
                      <p className="text-gray-300 text-lg">
                        The next question will appear shortly. Get ready!
                      </p>
                      {!connected && (
                        <p className="text-red-400 mt-4">
                          Trying to reconnect...
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-800 rounded-2xl p-6 border-2 border-cyan-600 h-fit">
            <h2 className="text-2xl font-bold text-cyan-400 mb-6 text-center">
              🏆 Live Leaderboard
            </h2>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {leaderboard.map((player, index) => {
                const isCurrentUser = user && player.email === user.email;
                return (
                  <div
                    key={player.user_id}
                    className={`flex justify-between items-center p-3 rounded-lg transition-all ${
                      isCurrentUser
                        ? 'bg-cyan-700 border-2 border-cyan-400'
                        : index === 0
                        ? 'bg-yellow-600'
                        : index === 1
                        ? 'bg-gray-600'
                        : index === 2
                        ? 'bg-amber-800'
                        : 'bg-gray-700'
                    } ${isCurrentUser ? 'scale-105' : ''}`}
                  >
                    <div className="flex items-center min-w-0">
                      <span
                        className={`font-bold mr-3 ${
                          index < 3 ? 'text-white' : 'text-cyan-300'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate font-semibold ${
                            isCurrentUser ? 'text-cyan-100' : 'text-white'
                          }`}
                        >
                          {player.display_name || player.email}
                        </div>
                        {isCurrentUser && (
                          <div className="text-cyan-200 text-xs">You</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-cyan-300">
                        {player.score ?? player.session_score ?? 0}
                      </div>
                      <div className="text-xs text-gray-300">
                        {formatAccuracy(player.accuracy ?? 0)}%
                      </div>
                    </div>
                  </div>
                );
              })}

              {leaderboard.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  No scores yet. Be the first!
                </div>
              )}
            </div>

            <div className="mt-6 p-4 bg-gray-700 rounded-lg">
              <h3 className="text-lg font-bold text-cyan-300 mb-3">
                Your Stats
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-2xl font-bold text-cyan-400">
                    {gameStats.score}
                  </div>
                  <div className="text-xs text-gray-300">Score</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">
                    {gameStats.correct}
                  </div>
                  <div className="text-xs text-gray-300">Correct</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-cyan-300">
                    {gameStats.questionsAnswered}
                  </div>
                  <div className="text-xs text-gray-300">
                    Answered(out of 30)
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-gray-700 rounded-lg">
              <h3 className="text-lg font-bold text-cyan-300 mb-2">
                Game Status
              </h3>
              <div className="text-sm text-gray-300 space-y-1">
                <div className="flex justify-between">
                  <span>Questions:</span>
                  <span className="text-cyan-300">
                    {gameStatus.questionsLoaded}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span
                    className={
                      gameStatus.isGameActive
                        ? 'text-green-400'
                        : 'text-yellow-400'
                    }
                  >
                    {gameStatus.isGameActive ? 'Active 🟢' : 'Waiting 🟡'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Connection:</span>
                  <span
                    className={
                      connected ? 'text-green-400' : 'text-red-400'
                    }
                  >
                    {connected ? 'Connected 🟢' : 'Disconnected 🔴'}
                  </span>
                </div>
                {gameStatus.gameSessionId && (
                  <div className="flex justify-between">
                    <span>Session:</span>
                    <span className="text-cyan-300 text-xs truncate ml-2">
                      {gameStatus.gameSessionId.substring(0, 8)}...
                    </span>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={onFinish}
              className="w-full mt-4 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold transition-colors"
            >
              Exit Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameUI;