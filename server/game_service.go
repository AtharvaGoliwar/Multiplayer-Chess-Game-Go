package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
)

type GameService struct {
	db *sql.DB
}

func NewGameService(db *sql.DB) *GameService {
	return &GameService{db: db}
}

func (gs *GameService) CreateGame(userID int, gameID string) (*Game, error) {
	// gameID := uuid.New()

	game := &Game{
		ID:            gameID,
		WhitePlayerID: &userID,
		// CurrentFEN:    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		Status:    "waiting",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	_, err := gs.db.Exec(`
        INSERT INTO games (id, white_player_id, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
    `, game.ID, game.WhitePlayerID, game.Status, game.CreatedAt, game.UpdatedAt)

	return game, err
}

func (gs *GameService) JoinGame(gameID string, userID int) error {
	result, err := gs.db.Exec(`
        UPDATE games 
        SET black_player_id = $1, status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND black_player_id IS NULL AND white_player_id != $1
    `, userID, gameID)
	rowsAffected, _ := result.RowsAffected()
	log.Printf("JoinGame: %d row(s) affected\n", rowsAffected)

	return err
}

func (gs *GameService) GetGame(gameID string) (*Game, error) {
	game := &Game{}
	whitePlayer := &User{}
	blackPlayer := &User{}

	fmt.Println("gameID", gameID)

	err := gs.db.QueryRow(`
		SELECT 
			g.id, g.white_player_id, g.black_player_id, g.metadata, 
			g.status, g.winner, g.created_at, g.updated_at,
			w.id, w.name, w.email, w.avatar_url,
			COALESCE(b.id, 0), COALESCE(b.name, ''), COALESCE(b.email, ''), COALESCE(b.avatar_url, '')
		FROM games g
		LEFT JOIN users w ON g.white_player_id = w.id
		LEFT JOIN users b ON g.black_player_id = b.id
		WHERE g.id = $1
	`, gameID).Scan(
		&game.ID, &game.WhitePlayerID, &game.BlackPlayerID, &game.MetaData,
		&game.Status, &game.Winner, &game.CreatedAt, &game.UpdatedAt,
		&whitePlayer.ID, &whitePlayer.Name, &whitePlayer.Email, &whitePlayer.AvatarURL,
		&blackPlayer.ID, &blackPlayer.Name, &blackPlayer.Email, &blackPlayer.AvatarURL,
	)

	if err != nil {
		log.Println("Error fetching game:", err)
		return nil, err
	}

	game.WhitePlayer = whitePlayer

	// Assign black player only if they exist
	if blackPlayer.ID != 0 {
		game.BlackPlayer = blackPlayer
	}

	return game, nil
}

func (gs *GameService) DeleteGame(gameID string) error {
	_, err := gs.db.Exec(`DELETE from games WHERE id = $1`, gameID)
	return err
}

func (gs *GameService) UpdateGame(gameID string, status string, winner string, moveData []byte) error {
	_, err := gs.db.Exec(`
        UPDATE games 
        SET status = $1, winner = $2, updated_at = CURRENT_TIMESTAMP, metadata = $3
        WHERE id = $4
    `, status, winner, moveData, gameID)

	return err
}

func (gs *GameService) setDisconnectionTime(userID int) error {
	disconnectionTime := time.Now()
	_, err := gs.db.Exec(`UPDATE users SET disconnected_at=$1 WHERE id=$2`, disconnectionTime, userID)
	return err
}

func (gs *GameService) UpdateActiveGameState(userID int, gameID string) error {
	_, err := gs.db.Exec(`
        UPDATE users 
        SET active_game = $1
        WHERE id = $2
    `, gameID, userID)

	return err
}

func (gs *GameService) SaveMove(gameID string, playerID int, moveFrom, moveTo, piece, fenAfter string, moveNumber int) error {
	_, err := gs.db.Exec(`
        INSERT INTO game_moves (game_id, player_id, move_from, move_to, piece, fen_after, move_number)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, gameID, playerID, moveFrom, moveTo, piece, fenAfter, moveNumber)

	return err
}

func (gs *GameService) GetUserGames(w http.ResponseWriter, r *http.Request) {
	// Implementation would get user from context and return their games
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode([]Game{})
}

func (gs *GameService) GetGamebyID(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	gameID := vars["id"]
	if gameID == "" {
		http.Error(w, "Invalid game ID", http.StatusBadRequest)
		return
	}
	// if err != nil {
	// 	http.Error(w, "Invalid game ID", http.StatusBadRequest)
	// 	return
	// }

	game, err := gs.GetGame(gameID)
	if err != nil {
		http.Error(w, "Game not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(game)
}
