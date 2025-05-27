// package main

// type Hub struct {
// 	Rooms      map[string]*Room
// 	Register   chan *Client
// 	Unregister chan *Client
// }

// func NewHub() *Hub {
// 	return &Hub{
// 		Rooms:      make(map[string]*Room),
// 		Register:   make(chan *Client),
// 		Unregister: make(chan *Client),
// 	}
// }

// func (h *Hub) Run() {
// 	for {
// 		select {
// 		case client := <-h.Register:
// 			room, ok := h.Rooms[client.RoomID]
// 			if !ok {
// 				room = NewRoom(client.RoomID)
// 				h.Rooms[client.RoomID] = room
// 				go room.Run()
// 			}

// 			// Enforce 2-player limit
// 			if len(room.Clients) >= 2 {
// 				client.Conn.WriteJSON(map[string]string{
// 					"type":    "error",
// 					"message": "Room is full",
// 				})
// 				client.Conn.Close()
// 				continue
// 			}

// 			// Assign color
// 			if len(room.Clients) == 0 {
// 				client.Color = "white"
// 			} else {
// 				client.Color = "black"
// 			}

// 			room.Clients[client] = true

// 			// Send initial message
// 			initMsg := map[string]string{
// 				"type":  "init",
// 				"name":  client.Name,
// 				"color": client.Color,
// 			}
// 			client.Conn.WriteJSON(initMsg)

// 			room.Register <- client

// 		case client := <-h.Unregister:
// 			if room, ok := h.Rooms[client.RoomID]; ok {
// 				room.Unregister <- client
// 				if len(room.Clients) == 0 {
// 					delete(h.Rooms, client.RoomID)
// 				}
// 			}
// 		}
// 	}
// }

package main

import (
	"database/sql"

	"github.com/google/uuid"
)

type Hub struct {
	db          *sql.DB
	gameService *GameService
	Rooms       map[string]*Room
	Register    chan *Client
	Unregister  chan *Client
}

func NewHub(db *sql.DB, gameService *GameService) *Hub {
	return &Hub{
		db:          db,
		gameService: gameService,
		Rooms:       make(map[string]*Room),
		Register:    make(chan *Client),
		Unregister:  make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			room, ok := h.Rooms[client.RoomID]
			if !ok {
				room = NewRoom(client.RoomID, h.db, h.gameService)
				h.Rooms[client.RoomID] = room
				go room.Run()
			}

			// Check if room is full
			if len(room.Clients) >= 2 {
				client.Conn.WriteJSON(map[string]string{
					"type":    "error",
					"message": "Room is full",
				})
				client.Conn.Close()
				continue
			}

			// Load or create game
			gameID, err := uuid.Parse(client.RoomID)
			if err != nil {
				// Create new game
				game, err := h.gameService.CreateGame(client.User.ID)
				if err != nil {
					client.Conn.WriteJSON(map[string]string{
						"type":    "error",
						"message": "Failed to create game",
					})
					client.Conn.Close()
					continue
				}
				gameID = game.ID
				client.RoomID = gameID.String()
			} else {
				// Try to join existing game
				if len(room.Clients) == 1 {
					if err := h.gameService.JoinGame(gameID, client.User.ID); err != nil {
						client.Conn.WriteJSON(map[string]string{
							"type":    "error",
							"message": "Failed to join game",
						})
						client.Conn.Close()
						continue
					}
				}
			}

			// Get updated game info
			game, err := h.gameService.GetGame(gameID)
			if err != nil {
				client.Conn.WriteJSON(map[string]string{
					"type":    "error",
					"message": "Game not found",
				})
				client.Conn.Close()
				continue
			}

			// Assign color based on database
			if game.WhitePlayerID != nil && *game.WhitePlayerID == client.User.ID {
				client.Color = "white"
			} else if game.BlackPlayerID != nil && *game.BlackPlayerID == client.User.ID {
				client.Color = "black"
			}

			room.Clients[client] = true

			// Send game state to client
			initMsg := map[string]interface{}{
				"type":  "init",
				"game":  game,
				"color": client.Color,
				"user":  client.User,
			}
			client.Conn.WriteJSON(initMsg)

			room.Register <- client

		case client := <-h.Unregister:
			if room, ok := h.Rooms[client.RoomID]; ok {
				room.Unregister <- client
				if len(room.Clients) == 0 {
					delete(h.Rooms, client.RoomID)
				}
			}
		}
	}
}
