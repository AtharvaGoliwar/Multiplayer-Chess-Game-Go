package main

import (
	"encoding/json"
	"time"
)

type User struct {
	ID             int       `json:"id"`
	GoogleID       string    `json:"google_id"`
	Email          string    `json:"email"`
	Name           string    `json:"name"`
	Password       string    `json:"-"`
	AvatarURL      string    `json:"avatar_url"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	ActiveGame     *string   `json:"active_game"`
	DisconnectedAt time.Time `json:"disconnected_at"`
}

type Game struct {
	ID            string           `json:"id"`
	WhitePlayerID *int             `json:"white_player_id"`
	BlackPlayerID *int             `json:"black_player_id"`
	WhitePlayer   *User            `json:"white_player,omitempty"`
	BlackPlayer   *User            `json:"black_player,omitempty"`
	MetaData      *json.RawMessage `json:"metadata"`
	Status        string           `json:"status"`
	Winner        *string          `json:"winner"`
	CreatedAt     time.Time        `json:"created_at"`
	UpdatedAt     time.Time        `json:"updated_at"`
}

type GameMove struct {
	ID         int       `json:"id"`
	GameID     string    `json:"game_id"`
	PlayerID   int       `json:"player_id"`
	MoveFrom   string    `json:"move_from"`
	MoveTo     string    `json:"move_to"`
	Piece      string    `json:"piece"`
	FENAfter   string    `json:"fen_after"`
	MoveNumber int       `json:"move_number"`
	CreatedAt  time.Time `json:"created_at"`
}
