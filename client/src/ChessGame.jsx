import React, { useState, useEffect, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import "./ChessGame.css";
import { useNavigate, useParams } from "react-router-dom";

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const getCapturedPieces = (game) => {
  const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const startingPieces = {
    w: { p: 8, n: 2, b: 2, r: 2, q: 1 },
    b: { p: 8, n: 2, b: 2, r: 2, q: 1 },
  };

  const currentPieces = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };

  // Count current pieces on board
  const board = game.board();
  board.forEach((row) => {
    row.forEach((square) => {
      if (square && square.type !== "k") {
        currentPieces[square.color][square.type]++;
      }
    });
  });

  // Calculate captured pieces
  const captured = { w: {}, b: {} };
  ["p", "n", "b", "r", "q"].forEach((piece) => {
    captured.w[piece] = startingPieces.w[piece] - currentPieces.w[piece]; // White pieces captured by Black
    captured.b[piece] = startingPieces.b[piece] - currentPieces.b[piece]; // Black pieces captured by White
  });

  // Calculate material advantage
  let whiteAdvantage = 0,
    blackAdvantage = 0;
  ["p", "n", "b", "r", "q"].forEach((piece) => {
    whiteAdvantage += captured.b[piece] * pieceValues[piece]; // White's captured black pieces
    blackAdvantage += captured.w[piece] * pieceValues[piece]; // Black's captured white pieces
  });

  const netAdvantage = whiteAdvantage - blackAdvantage;

  return {
    whiteCaptured: captured.b, // Black pieces captured by White
    blackCaptured: captured.w, // White pieces captured by Black
    whiteAdvantage: Math.max(0, netAdvantage),
    blackAdvantage: Math.max(0, -netAdvantage),
  };
};

const ChessGame = () => {
  const navigate = useNavigate();
  const [game, setGame] = useState(new Chess());
  const [gameOver, setGameOver] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [moveSquares, setMoveSquares] = useState({});
  const [promotionDialog, setPromotionDialog] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState(null);

  const [moveHistory, setMoveHistory] = useState([]);
  const [gameStates, setGameStates] = useState([new Chess().fen()]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Game metadata for PGN
  const [gameMetadata, setGameMetadata] = useState({
    event: "Casual Game",
    site: "React Chess",
    date: new Date().toISOString().split("T")[0].replace(/-/g, "."),
    round: "1",
    white: "White Player",
    black: "Black Player",
    result: "*",
  });

  const initialTime = 5 * 60;
  const [whiteTime, setWhiteTime] = useState(initialTime);
  const [blackTime, setBlackTime] = useState(initialTime);
  const [activeTimer, setActiveTimer] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Backend integration state
  const [isConnected, setIsConnected] = useState(false);
  const { roomId } = useParams();
  // console.log(roomId);
  const [gameId, setGameId] = useState(roomId);
  const [handleInputGameId, setHandleInputGameId] = useState(null);
  const [playerColor, setPlayerColor] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isMoveDone, setIsMoveDone] = useState(false);

  // WebSocket ref
  const ws = useRef(null);
  const currentPlayer = useRef(currentUser);
  const reconnectTimeout = useRef(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

  useEffect(() => {
    currentPlayer.current = currentUser;
  }, [currentUser]);

  const apiCall = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    };

    if (options.body && typeof options.body === "object") {
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Request failed" }));
      throw new Error(
        errorData.message || `HTTP error! status: ${response.status}`
      );
    }

    return response.json();
  };
  const checkAuthStatus = async () => {
    try {
      const userData = await apiCall("/auth/me");
      // setCurrentUser(userData);
      currentPlayer.current = userData;
      setPlayerConnected(true);
    } catch (error) {
      setCurrentUser(null);
      setPlayerConnected(false);
      currentPlayer.current = null;
    }
  };
  useEffect(() => {
    if (gameId) {
      console.log("yo 234");
      checkAuthStatus();
    }
  }, []);

  const [tp, setTP] = useState("");
  useEffect(() => {
    const func = async () => {
      if (currentPlayer.current) {
        const activeGame = currentPlayer.current.active_game;
        try {
          let res = await apiCall(`/games/${activeGame}`);
          // console.log(res);
          setTP(res);
        } catch (err) {
          console.log(err);
        }
      }
    };
    func();
  }, [currentPlayer.current]);

  useEffect(() => {
    if (tp !== "") {
      if (tp.metadata.length !== 0) {
        const newGame = new Chess(tp.metadata.fen);
        setGame(newGame);
        setWhiteTime(tp.metadata.white_time);
        setBlackTime(tp.metadata.black_time);
        // setActiveTimer(newGame.turn());
      }
    }
  }, [tp]);

  useEffect(() => {
    if (isMoveDone) {
      setIsMoveDone(false);
      console.log("sup");
    }
  }, [isMoveDone]);

  useEffect(() => {
    const setActiveGame = () => {
      if (
        currentPlayer.current &&
        currentPlayer.current.active_game !== gameId &&
        currentPlayer.current.active_game !== "" &&
        currentPlayer.current.active_game !== " "
      ) {
        navigate("/home");
        console.log(currentPlayer.current.active_game !== " ");
        return;
      }
      if (
        currentPlayer.current &&
        (currentPlayer.current.active_game === "" ||
          currentPlayer.current.active_game === " ") &&
        gameId &&
        !gameOver
      ) {
        console.log("check for active game");
        ws.current.send(
          JSON.stringify({ type: "set-active-game", gameid: gameId })
        );
      }
    };
    setActiveGame();
    checkAuthStatus();
  }, [currentPlayer.current]);

  const checkWebSocketStatus = () => {
    const state = ws.current?.readyState;
    const stateText = {
      0: "CONNECTING",
      1: "OPEN",
      2: "CLOSING",
      3: "CLOSED",
    };
    console.log("WebSocket state:", stateText[state] || "UNKNOWN");
  };

  // WebSocket connection management
  const connectWebSocket = () => {
    try {
      const token = currentPlayer.current;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//localhost:8080/ws?room=${gameId}`;

      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log("WebSocket connected");
        setConnectionStatus("connected");
        setIsConnected(true);

        // Clear reconnect timeout
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = null;
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.current.onclose = (event) => {
        console.log("WebSocket disconnected:", event.code, event.reason);
        setConnectionStatus("disconnected");
        setIsConnected(false);
      };

      ws.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        setConnectionStatus("error");
      };
    } catch (error) {
      console.error("Error connecting to WebSocket:", error);
      setConnectionStatus("error");
    }
  };

  // Handle WebSocket messages
  const handleWebSocketMessage = (message) => {
    console.log("Received message:", message);

    switch (message.type) {
      case "init":
        handleInitState(message);
        break;
      case "move":
        console.log(currentPlayer.current);
        if (message.playerId !== currentPlayer.current.id) {
          handleIncomingMove(message.move);
          setIsMoveDone(true);
        }
        break;
      case "game_sync":
        // Full game state synchronization
        syncGameState(message.move);
        break;

      case "game-over":
        setGameOver(true);
        setActiveTimer(null);
        break;
      case "error":
        handleError(message.error);
        break;
      default:
        console.log("Unknown message type:", message.type);
    }
  };

  const handleInitState = (message) => {
    setPlayerColor(message.color);
  };

  const handleError = (error) => {
    console.error("Game error:", error);
    alert(`Error: ${error}`);
  };

  // Send move to backend
  const sendMoveToBackend = (moveData) => {
    if (
      ws.current &&
      ws.current.readyState === WebSocket.OPEN &&
      // isOnlineGame &&
      gameId
    ) {
      console.log("sent");
      ws.current.send(
        JSON.stringify({
          type: "move",
          gameId: gameId,
          // playerId: currentUser.id,
          playerId: currentPlayer.current.id,
          move: moveData,
          timestamp: Date.now(),
        })
      );
      setIsMoveDone(true);
    }
  };

  // Function to handle incoming moves from backend
  const handleIncomingMove = (moveData) => {
    try {
      const {
        fen,
        san,
        moveHistory: newMoveHistory,
        gameStates: newGameStates,
      } = moveData;

      // Create new chess instance with the received FEN
      const newGame = new Chess(fen);

      // Update all game state
      setGame(newGame);
      setMoveHistory(newMoveHistory || []);
      setGameStates(newGameStates || [fen]);
      setHistoryIndex((newGameStates?.length || 1) - 1);

      // Clear selection states
      setSelectedSquare(null);
      setMoveSquares({});

      // Play sound for opponent's move
      if (moveData.captured) {
        playSound("capture");
      } else if (moveData.san?.includes("O-O")) {
        playSound("castle");
      } else {
        playSound("move");
      }

      // Check for check
      if (newGame.inCheck()) {
        setTimeout(() => playSound("check"), 100);
      }

      // Check game status
      const status = getGameStatus(newGame);
      console.log("status: ", status);
      if (status) {
        setGameOver(status);
        setActiveTimer(null);
      } else {
        setActiveTimer(newGame.turn());
      }
    } catch (error) {
      console.error("Error handling incoming move:", error);
    }
  };

  const syncGameState = (gameData) => {
    try {
      const {
        fen,
        moveHistory: newMoveHistory,
        gameStates: newGameStates,
        gameOver,
      } = gameData;

      const newGame = new Chess(fen);
      setGame(newGame);
      setMoveHistory(newMoveHistory || []);
      setGameStates(newGameStates || [fen]);
      setHistoryIndex((newGameStates?.length || 1) - 1);

      if (gameOver) {
        console.log("gameOver", gameOver);
        setGameOver(gameOver);
        setActiveTimer(null);
      } else {
        setActiveTimer(newGame.turn());
      }

      // Clear selection states
      setSelectedSquare(null);
      setMoveSquares({});
    } catch (error) {
      console.error("Error syncing game state:", error);
    }
  };

  // Request full game synchronization
  const requestGameSync = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && gameId) {
      ws.current.send(
        JSON.stringify({
          type: "request_sync",
          gameId: gameId,
          playerId: playerId,
        })
      );
    }
  };

  // Join existing game
  const joinGame = (gameId) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "join_game",
          gameId: gameId,
        })
      );
    } else {
      alert("Not connected to server");
    }
  };

  // Initialize WebSocket connection
  useEffect(() => {
    if (gameId) {
      connectWebSocket();
    }
    checkWebSocketStatus();
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "set-active-game" }));
    }
    return () => {
      // Safe cleanup
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.close();
      }

      // Clear any pending reconnect attempts
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
    };
  }, [gameId]); // Make sure this only runs once on mount

  useEffect(() => {
    if (gameOver) {
      ws.current.send(JSON.stringify({ type: "game-over" }));
    }
  }, [gameOver]);

  // Sound effects
  const playSound = (type) => {
    if (!soundEnabled) return;

    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    let frequency;
    let duration = 0.1;

    switch (type) {
      case "move":
        frequency = 800;
        break;
      case "capture":
        frequency = 600;
        duration = 0.15;
        break;
      case "check":
        frequency = 1000;
        duration = 0.2;
        break;
      case "castle":
        frequency = 700;
        duration = 0.2;
        break;
      case "gameEnd":
        frequency = 400;
        duration = 0.5;
        break;
      default:
        frequency = 800;
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + duration
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  };

  useEffect(() => {
    if (gameOver) {
      setActiveTimer(null);
      return;
    }

    const interval = setInterval(() => {
      if (activeTimer === "w") {
        setWhiteTime((t) => {
          if (t <= 1) {
            // setGameOver("Time's up! Black wins.");
            setGameOver(true);
            setGameMetadata((prev) => ({ ...prev, result: "0-1" }));
            setActiveTimer(null);
            playSound("gameEnd");
            return 0;
          }
          return t - 1;
        });
      } else if (activeTimer === "b") {
        setBlackTime((t) => {
          if (t <= 1) {
            // setGameOver("Time's up! White wins.");
            setGameOver(true);
            setGameMetadata((prev) => ({ ...prev, result: "1-0" }));
            setActiveTimer(null);
            playSound("gameEnd");
            return 0;
          }
          return t - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTimer, gameOver, soundEnabled]);

  const renderMoveHistory = () => {
    const pairs = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      const moveNumber = Math.floor(i / 2) + 1;
      const whiteMove = moveHistory[i];
      const blackMove = moveHistory[i + 1];

      if (blackMove) {
        pairs.push(`${moveNumber}. ${whiteMove} ${blackMove}`);
      } else {
        pairs.push(`${moveNumber}. ${whiteMove}`);
      }
    }
    return pairs;
  };

  const updateGame = (modify) => {
    setGame((g) => {
      const updated = new Chess(g.fen());
      const moveResult = modify(updated);

      if (moveResult) {
        const newFen = updated.fen();
        const newGameStates = gameStates.slice(0, historyIndex + 1);
        const newMoveHistory = moveHistory.slice(0, historyIndex);

        newGameStates.push(newFen);
        newMoveHistory.push(moveResult.san);

        setGameStates(newGameStates);
        setMoveHistory(newMoveHistory);
        setHistoryIndex(newGameStates.length - 1);

        // Play appropriate sound
        if (moveResult.captured) {
          playSound("capture");
        } else if (moveResult.san.includes("O-O")) {
          playSound("castle");
        } else {
          playSound("move");
        }

        // Check for check
        if (updated.inCheck()) {
          setTimeout(() => playSound("check"), 100);
        }
      }

      return updated;
    });
  };

  const undoMove = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setGame(new Chess(gameStates[newIndex]));
      setHistoryIndex(newIndex);
      setGameMetadata((prev) => ({ ...prev, result: "*" }));
    }
  };

  const redoMove = () => {
    if (historyIndex < gameStates.length - 1) {
      const newIndex = historyIndex + 1;
      setGame(new Chess(gameStates[newIndex]));
      setHistoryIndex(newIndex);
    }
  };

  const getGameStatus = (g) => {
    if (g.isGameOver()) {
      let result = "*";
      let message = "";

      if (g.isCheckmate()) {
        result = g.turn() === "w" ? "0-1" : "1-0";
        message = `Checkmate! ${g.turn() === "w" ? "Black" : "White"} wins`;
      } else if (g.isDraw()) {
        result = "1/2-1/2";
        message = "Draw!";
      } else if (g.isStalemate()) {
        result = "1/2-1/2";
        message = "Stalemate!";
      } else if (g.isInsufficientMaterial()) {
        result = "1/2-1/2";
        message = "Draw: Insufficient Material";
      } else {
        message = "Game over";
      }

      setGameMetadata((prev) => ({ ...prev, result }));
      playSound("gameEnd");
      setGameOver(true);
      return message;
    }
    return "";
  };

  const showValidMoves = (square) => {
    const moves = game.moves({ square, verbose: true });
    const highlights = {};
    moves.forEach((m) => {
      highlights[m.to] = {
        background: game.get(m.to)
          ? "radial-gradient(circle, red 35%, transparent 40%)"
          : "radial-gradient(circle, rgba(0,0,0,0.4) 25%, transparent 30%)",
        borderRadius: "50%",
      };
    });
    setMoveSquares(highlights);
  };

  const makeMove = ({ from, to, promotion }) => {
    console.log(game.turn());
    if (historyIndex !== gameStates.length - 1) return;
    if (game.turn() !== playerColor[0]) return;
    updateGame((g) => {
      const moveResult = g.move({ from, to, promotion });
      if (moveResult) {
        console.log("sending");
        sendMoveToBackend({
          from,
          to,
          promotion,
          fen: g.fen(), // Send the resulting FEN
          san: moveResult.san, // Send algebraic notation
          moveHistory: [...moveHistory, moveResult.san],
          gameStates: [...gameStates, g.fen()],
          white_time: whiteTime,
          black_time: blackTime,
        });
      }
      const status = getGameStatus(g);
      if (status) {
        setGameOver(status);
        setActiveTimer(null);
      } else {
        setActiveTimer(g.turn());
      }
      return moveResult;
    });
  };

  const onSquareClick = (square) => {
    if (promotionDialog || historyIndex !== gameStates.length - 1) return;
    if (game.turn() !== playerColor[0]) return;
    const piece = game.get(square);
    if (piece && piece.color === game.turn()) {
      if (square === selectedSquare) {
        setSelectedSquare(null);
        setMoveSquares({});
      } else {
        setSelectedSquare(square);
        showValidMoves(square);
      }
      return;
    }

    if (selectedSquare) {
      const moves = game.moves({ square: selectedSquare, verbose: true });
      const move = moves.find((m) => m.to === square);
      if (move) {
        if (move.promotion) {
          setPendingPromotion({ from: selectedSquare, to: square });
          setPromotionDialog(true);
        } else {
          makeMove({ from: selectedSquare, to: square });
        }
      }
      setSelectedSquare(null);
      setMoveSquares({});
    }
  };

  const onDragStart = (sourceSquare) => {
    const piece = game.get(sourceSquare);
    if (piece && piece.color === game.turn()) {
      setSelectedSquare(sourceSquare);
      showValidMoves(sourceSquare);
    }
  };

  const onDragEnd = () => {
    setMoveSquares({});
    setSelectedSquare(null);
  };

  const onDrop = (sourceSquare, targetSquare) => {
    if (historyIndex !== gameStates.length - 1) return false;

    const moves = game.moves({ square: sourceSquare, verbose: true });
    const move = moves.find((m) => m.to === targetSquare);
    if (move) {
      if (move.promotion) {
        setPendingPromotion({ from: sourceSquare, to: targetSquare });
        setPromotionDialog(true);
        return false;
      } else {
        makeMove({ from: sourceSquare, to: targetSquare });
        return true;
      }
    }
    return false;
  };

  const handlePromotionSelect = (piece) => {
    if (pendingPromotion) {
      makeMove({ ...pendingPromotion, promotion: piece });
      setPendingPromotion(null);
      setPromotionDialog(false);
    }
  };

  const restartGame = () => {
    setGame(new Chess());
    setGameOver(false);
    setSelectedSquare(null);
    setMoveSquares({});
    setPendingPromotion(null);
    setPromotionDialog(false);
    setMoveHistory([]);
    setGameStates([new Chess().fen()]);
    setHistoryIndex(0);
    setWhiteTime(initialTime);
    setBlackTime(initialTime);
    setActiveTimer("w");
    setGameMetadata({
      event: "Casual Game",
      site: "React Chess",
      date: new Date().toISOString().split("T")[0].replace(/-/g, "."),
      round: "1",
      white: "White Player",
      black: "Black Player",
      result: "*",
    });
  };

  // Save game to localStorage
  const saveGame = () => {
    const gameData = {
      gameStates,
      moveHistory,
      historyIndex,
      whiteTime,
      blackTime,
      activeTimer,
      gameOver,
      gameMetadata,
      timestamp: new Date().toISOString(),
    };

    const savedGames = JSON.parse(localStorage.getItem("chessGames") || "[]");
    const gameName = `Game_${new Date().toLocaleDateString()}_${new Date().toLocaleTimeString()}`;
    savedGames.push({ name: gameName, data: gameData });
    localStorage.setItem("chessGames", JSON.stringify(savedGames));

    alert(`Game saved as: ${gameName}`);
  };

  // Load game from localStorage
  const loadGame = (gameData) => {
    setGameStates(gameData.gameStates);
    setMoveHistory(gameData.moveHistory);
    setHistoryIndex(gameData.historyIndex);
    setGame(new Chess(gameData.gameStates[gameData.historyIndex]));
    setWhiteTime(gameData.whiteTime);
    setBlackTime(gameData.blackTime);
    setActiveTimer(gameData.activeTimer);
    setGameOver(gameData.gameOver || "");
    setGameMetadata(gameData.gameMetadata || gameMetadata);
  };

  // Get saved games
  const getSavedGames = () => {
    return JSON.parse(localStorage.getItem("chessGames") || "[]");
  };

  // Delete saved game
  const deleteSavedGame = (index) => {
    const savedGames = getSavedGames();
    savedGames.splice(index, 1);
    localStorage.setItem("chessGames", JSON.stringify(savedGames));
  };

  // Export to PGN
  const exportToPGN = () => {
    let pgn = "";

    // Add headers
    Object.entries(gameMetadata).forEach(([key, value]) => {
      pgn += `[${key.charAt(0).toUpperCase() + key.slice(1)} "${value}"]\n`;
    });

    pgn += "\n";

    // Add moves
    const moves = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      const moveNumber = Math.floor(i / 2) + 1;
      const whiteMove = moveHistory[i];
      const blackMove = moveHistory[i + 1];

      if (blackMove) {
        moves.push(`${moveNumber}. ${whiteMove} ${blackMove}`);
      } else {
        moves.push(`${moveNumber}. ${whiteMove}`);
      }
    }

    pgn += moves.join(" ");
    pgn += ` ${gameMetadata.result}`;

    // Download PGN file
    const blob = new Blob([pgn], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chess_game_${new Date().toISOString().split("T")[0]}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import from PGN
  const importFromPGN = (pgnText) => {
    try {
      const newGame = new Chess();
      const success = newGame.loadPgn(pgnText);

      if (success) {
        const history = newGame.history();
        const states = [new Chess().fen()];
        const tempGame = new Chess();

        history.forEach((move) => {
          tempGame.move(move);
          states.push(tempGame.fen());
        });

        setGame(newGame);
        setMoveHistory(history);
        setGameStates(states);
        setHistoryIndex(states.length - 1);
        setGameOver(false);

        // Extract metadata from PGN headers
        const headerRegex = /\[(\w+)\s+"([^"]+)"\]/g;
        let match;
        const metadata = { ...gameMetadata };

        while ((match = headerRegex.exec(pgnText)) !== null) {
          const key = match[1].toLowerCase();
          const value = match[2];
          if (metadata.hasOwnProperty(key)) {
            metadata[key] = value;
          }
        }

        setGameMetadata(metadata);
        alert("PGN imported successfully!");
      } else {
        alert("Invalid PGN format!");
      }
    } catch (error) {
      alert("Error importing PGN: " + error.message);
    }
  };

  const jumpToMove = (moveIndex) => {
    const targetIndex = moveIndex + 1;
    if (targetIndex >= 0 && targetIndex < gameStates.length) {
      setGame(new Chess(gameStates[targetIndex]));
      setHistoryIndex(targetIndex);
    }
  };

  const isBlackPromoting = (square) => parseInt(square[1], 10) === 1;

  const getSquarePosition = (square) => {
    const file = square.charCodeAt(0) - "a".charCodeAt(0);
    const rank = 8 - parseInt(square[1], 10);
    return {
      left: `${file * 62.5}px`,
      top: `${rank * 62.5}px`,
    };
  };

  const getSquareColorFromCoords = (square) => {
    const file = square.charCodeAt(0) - "a".charCodeAt(0);
    const rank = parseInt(square[1], 10);
    const isDark = (file + rank) % 2 === 1;
    return isDark ? "#b58863" : "#f0d9b5";
  };

  return (
    <div className="chess-game-container">
      {/* Main game area */}
      {/* {console.log(currentUser)} */}
      {/* {console.log(currentPlayer.current)} */}
      {/* {console.log("Opponent: ", opponent)} */}
      {/* {console.log("Player color: ", playerColor)} */}
      {console.log(tp)}
      <div className="main-game-section">
        <h2 className="game-title">React Chess Game</h2>

        {/* Game controls */}
        <div className="control-bar">
          <button onClick={saveGame} className="control-btn save-btn">
            💾 Save Game
          </button>
          <button onClick={exportToPGN} className="control-btn export-btn">
            📄 Export PGN
          </button>
          <label className="sound-toggle">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
            />
            🔊 Sound
          </label>
          <input
            type="file"
            accept=".pgn"
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (event) => importFromPGN(event.target.result);
                reader.readAsText(file);
              }
            }}
            style={{ display: "none" }}
            id="pgn-import"
          />
          <label htmlFor="pgn-import" className="control-btn import-btn">
            📁 Import PGN
          </label>
        </div>

        <div className="chessboard-container">
          <Chessboard
            position={game.fen()}
            onSquareClick={onSquareClick}
            onPieceDrop={onDrop}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            customSquareStyles={{
              ...moveSquares,
              ...(selectedSquare && {
                [selectedSquare]: { backgroundColor: "rgba(255, 255, 0, 0.4)" },
              }),
            }}
            boardWidth={500}
          />
        </div>
        <div>
          <div className="timer-display">
            <div
              className={`timer-white ${
                activeTimer === "w" ? "timer-active" : ""
              }`}
            >
              ♔ White: {formatTime(whiteTime)}
            </div>
            <div
              className={`timer-black ${
                activeTimer === "b" ? "timer-active" : ""
              }`}
            >
              ♚ Black: {formatTime(blackTime)}
            </div>
          </div>

          {/* Captured Pieces Display */}
          {(() => {
            const captureInfo = getCapturedPieces(game);
            const pieceSymbols = {
              w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕" },
              b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" },
            };

            return (
              <div className="captured-pieces">
                {/* White's captured pieces (Black pieces) */}
                <div className="captured-side">
                  {["q", "r", "b", "n", "p"].map((piece) => {
                    const count = captureInfo.whiteCaptured[piece];
                    return (
                      count > 0 && (
                        <span
                          key={piece}
                          style={{ display: "flex", alignItems: "center" }}
                        >
                          {pieceSymbols.b[piece]}
                          {count > 1 && (
                            <span
                              style={{ fontSize: "12px", marginLeft: "1px" }}
                            >
                              {count}
                            </span>
                          )}
                        </span>
                      )
                    );
                  })}
                  {captureInfo.whiteAdvantage > 0 && (
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#4CAF50",
                        marginLeft: "5px",
                      }}
                    >
                      +{captureInfo.whiteAdvantage}
                    </span>
                  )}
                </div>

                {/* Black's captured pieces (White pieces) */}
                <div className="captured-side">
                  {captureInfo.blackAdvantage > 0 && (
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#4CAF50",
                        marginRight: "5px",
                      }}
                    >
                      +{captureInfo.blackAdvantage}
                    </span>
                  )}
                  {["q", "r", "b", "n", "p"].map((piece) => {
                    const count = captureInfo.blackCaptured[piece];
                    return (
                      count > 0 && (
                        <span
                          key={piece}
                          style={{ display: "flex", alignItems: "center" }}
                        >
                          {pieceSymbols.w[piece]}
                          {count > 1 && (
                            <span
                              style={{ fontSize: "12px", marginLeft: "1px" }}
                            >
                              {count}
                            </span>
                          )}
                        </span>
                      )
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Promotion UI */}
          {promotionDialog && pendingPromotion && (
            <div
              style={{
                position: "absolute",
                width: "125px",
                height: "125px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gridTemplateRows: "1fr 1fr",
                zIndex: 1000,
                ...getSquarePosition(pendingPromotion.to),
                transform: isBlackPromoting(pendingPromotion.to)
                  ? "translateY(-125%)"
                  : "translateY(-75%) translateX(-20%)",
                boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
                border: "1px solid #444",
              }}
            >
              {["q", "r", "b", "n"].map((p, index) => {
                const file = pendingPromotion.to[0].charCodeAt(0);
                const rank = parseInt(pendingPromotion.to[1]);
                const fileOffset = index % 2;
                const rankOffset = Math.floor(index / 2);
                const squareFile = String.fromCharCode(file + fileOffset);
                const squareRank = rank + rankOffset;
                const square = `${squareFile}${squareRank}`;
                const bgColor = getSquareColorFromCoords(square);
                const color = game.turn();
                const pieceKey = `${color}${p}`;
                const imgUrl = `https://www.chess.com/chess-themes/pieces/neo/150/${pieceKey}.png`;

                return (
                  <button
                    key={p}
                    onClick={() => handlePromotionSelect(p)}
                    style={{
                      backgroundColor: bgColor,
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <img
                      src={imgUrl}
                      alt={p}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Game Over Message */}
        {gameOver && (
          <div style={{ marginTop: "20px" }}>
            <h3>{gameOver}</h3>
            <button onClick={restartGame}>Restart Game</button>
          </div>
        )}

        <div className="nav-buttons">
          <button
            onClick={undoMove}
            disabled={historyIndex === 0}
            className="nav-btn"
          >
            Undo
          </button>
          <button
            onClick={redoMove}
            disabled={historyIndex === gameStates.length - 1}
            className="nav-btn"
          >
            Redo
          </button>
        </div>

        {historyIndex !== gameStates.length - 1 && (
          <p style={{ color: "gray", marginTop: "10px" }}>
            Viewing past move – undo/redo available. To continue playing, redo
            to the latest move.
          </p>
        )}
      </div>

      {/* Right panel with Move History and Saved Games */}
      <div className="right-panel">
        {/* Move History Panel */}
        <div className="panel move-history-panel">
          <h3
            style={{ marginTop: 0, marginBottom: "15px", textAlign: "center" }}
          >
            Move History
          </h3>

          {moveHistory.length === 0 ? (
            <p
              style={{
                color: "#666",
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              No moves yet
            </p>
          ) : (
            <div>
              {renderMoveHistory().map((moveText, pairIndex) => {
                const moves = moveText.split(/\d+\.\s+/)[1]?.split(" ") || [];
                const whiteMove = moves[0];
                const blackMove = moves[1];
                const moveNumber = pairIndex + 1;

                return (
                  <div
                    key={pairIndex}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "5px",
                      padding: "5px",
                      borderRadius: "4px",
                      backgroundColor: "#fff",
                      border: "1px solid #e0e0e0",
                    }}
                  >
                    <span
                      style={{
                        minWidth: "30px",
                        fontWeight: "bold",
                        color: "#666",
                        fontSize: "14px",
                      }}
                    >
                      {moveNumber}.
                    </span>

                    {whiteMove && (
                      <button
                        onClick={() => jumpToMove(pairIndex * 2)}
                        style={{
                          margin: "0 5px",
                          padding: "3px 8px",
                          border: "1px solid #ddd",
                          borderRadius: "3px",
                          backgroundColor:
                            historyIndex === pairIndex * 2 + 1
                              ? "#e3f2fd"
                              : "#fff",
                          cursor: "pointer",
                          fontSize: "14px",
                          fontFamily: "monospace",
                        }}
                      >
                        {whiteMove}
                      </button>
                    )}

                    {blackMove && (
                      <button
                        onClick={() => jumpToMove(pairIndex * 2 + 1)}
                        style={{
                          margin: "0 5px",
                          padding: "3px 8px",
                          border: "1px solid #ddd",
                          borderRadius: "3px",
                          backgroundColor:
                            historyIndex === pairIndex * 2 + 2
                              ? "#e3f2fd"
                              : "#fff",
                          cursor: "pointer",
                          fontSize: "14px",
                          fontFamily: "monospace",
                        }}
                      >
                        {blackMove}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: "15px", textAlign: "center" }}>
            <button
              onClick={() => {
                setGame(new Chess(gameStates[0]));
                setHistoryIndex(0);
              }}
              disabled={historyIndex === 0}
              style={{
                padding: "5px 10px",
                margin: "0 5px",
                border: "1px solid #ccc",
                borderRadius: "3px",
                backgroundColor: "#fff",
                cursor: historyIndex === 0 ? "not-allowed" : "pointer",
                fontSize: "12px",
              }}
            >
              ⏮ Start
            </button>
            <button
              onClick={() => {
                setGame(new Chess(gameStates[gameStates.length - 1]));
                setHistoryIndex(gameStates.length - 1);
              }}
              disabled={historyIndex === gameStates.length - 1}
              style={{
                padding: "5px 10px",
                margin: "0 5px",
                border: "1px solid #ccc",
                borderRadius: "3px",
                backgroundColor: "#fff",
                cursor:
                  historyIndex === gameStates.length - 1
                    ? "not-allowed"
                    : "pointer",
                fontSize: "12px",
              }}
            >
              ⏭ End
            </button>
          </div>
        </div>

        {/* Saved Games Panel */}
        <div className="panel saved-games-panel">
          <h3
            style={{ marginTop: 0, marginBottom: "15px", textAlign: "center" }}
          >
            Saved Games
          </h3>

          {getSavedGames().length === 0 ? (
            <p
              style={{
                color: "#666",
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              No saved games
            </p>
          ) : (
            <div>
              {getSavedGames().map((savedGame, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "10px",
                    padding: "8px",
                    backgroundColor: "#fff",
                    border: "1px solid #e0e0e0",
                    borderRadius: "4px",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                      {savedGame.name}
                    </div>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      {savedGame.data.moveHistory.length} moves
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "5px" }}>
                    <button
                      onClick={() => loadGame(savedGame.data)}
                      style={{
                        padding: "3px 6px",
                        backgroundColor: "#4CAF50",
                        color: "white",
                        border: "none",
                        borderRadius: "2px",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      Load
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Delete this saved game?")) {
                          deleteSavedGame(index);
                        }
                      }}
                      style={{
                        padding: "3px 6px",
                        backgroundColor: "#f44336",
                        color: "white",
                        border: "none",
                        borderRadius: "2px",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      ❌
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Game ID */}
        <div>
          <input
            type="text"
            onChange={(e) => {
              setHandleInputGameId(e.target.value);
            }}
          />
          <button onClick={() => setGameId(handleInputGameId)}>Submit</button>
        </div>
        <div>
          <button onClick={() => setGameOver(true)}>resign</button>
        </div>
      </div>
    </div>
  );
};

export default ChessGame;
