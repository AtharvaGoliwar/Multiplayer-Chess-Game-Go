package main

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID        int       `json:"id"`
	GoogleID  string    `json:"google_id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	AvatarURL string    `json:"avatar_url"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Game struct {
	ID            uuid.UUID `json:"id"`
	WhitePlayerID *int      `json:"white_player_id"`
	BlackPlayerID *int      `json:"black_player_id"`
	WhitePlayer   *User     `json:"white_player,omitempty"`
	BlackPlayer   *User     `json:"black_player,omitempty"`
	CurrentFEN    string    `json:"current_fen"`
	Status        string    `json:"status"`
	Winner        *string   `json:"winner"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type GameMove struct {
	ID         int       `json:"id"`
	GameID     uuid.UUID `json:"game_id"`
	PlayerID   int       `json:"player_id"`
	MoveFrom   string    `json:"move_from"`
	MoveTo     string    `json:"move_to"`
	Piece      string    `json:"piece"`
	FENAfter   string    `json:"fen_after"`
	MoveNumber int       `json:"move_number"`
	CreatedAt  time.Time `json:"created_at"`
}
