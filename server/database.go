package main

import (
	"database/sql"
	"fmt"
	"os"
)

func initDB() (*sql.DB, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:Admin@123@localhost:5432/chess_db?sslmode=disable"
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		return nil, err
	}

	if err = db.Ping(); err != nil {
		return nil, err
	}

	return db, nil
}

func createTables(db *sql.DB) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            google_id VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(255) NOT NULL,
            avatar_url VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
		`CREATE TABLE IF NOT EXISTS games (
            id UUID PRIMARY KEY,
            white_player_id INTEGER REFERENCES users(id),
            black_player_id INTEGER REFERENCES users(id),
            current_fen VARCHAR(500) DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            status VARCHAR(20) DEFAULT 'waiting', -- waiting, active, completed, abandoned
            winner VARCHAR(10), -- white, black, draw
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
		`CREATE TABLE IF NOT EXISTS game_moves (
            id SERIAL PRIMARY KEY,
            game_id UUID REFERENCES games(id),
            player_id INTEGER REFERENCES users(id),
            move_from VARCHAR(2) NOT NULL,
            move_to VARCHAR(2) NOT NULL,
            piece VARCHAR(10) NOT NULL,
            fen_after VARCHAR(500) NOT NULL,
            move_number INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
		`CREATE INDEX IF NOT EXISTS idx_games_players ON games(white_player_id, black_player_id)`,
		`CREATE INDEX IF NOT EXISTS idx_game_moves_game_id ON game_moves(game_id)`,
	}

	for _, query := range queries {
		if _, err := db.Exec(query); err != nil {
			return fmt.Errorf("failed to execute query: %v", err)
		}
	}

	return nil
}
