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
	"encoding/json"
	"fmt"
	"log"
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

			playersBeforeJoin := len(room.Clients)

			// Load or create game
			// gameID, err := uuid.Parse(client.RoomID)
			// var gameID string
			gameID := client.RoomID
			fmt.Println(gameID)
			_, err := h.gameService.GetGame(gameID)
			if err != nil {
				// Create new game
				game, err := h.gameService.CreateGame(client.User.ID, gameID)
				if err != nil {
					client.Conn.WriteJSON(map[string]string{
						"type":    "error",
						"message": "Failed to create game",
					})
					log.Fatalln(err)
					client.Conn.Close()
					continue
				}
				gameID = game.ID
				client.RoomID = gameID
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

			// If this is the second player joining, send notifications
			if playersBeforeJoin == 1 && len(room.Clients) == 2 {
				// Send room status update to all clients
				roomStatusMsg := map[string]interface{}{
					"type":          "room_status",
					"players_count": 2,
					"message":       "Both players have joined the game!",
					"ready_to_play": true,
				}

				statusBytes, _ := json.Marshal(roomStatusMsg)
				room.Broadcast <- statusBytes

				// Send automatic "hello" message from the newly joined player
				helloMsg := Message{
					Type:   "chat",
					Sender: fmt.Sprintf("%d", client.User.ID),
					// Message: "Hello! I've joined the game. Ready to play?",
					Message: "Hello",
				}

				helloBytes, _ := json.Marshal(helloMsg)
				room.Broadcast <- helloBytes
			}

		case client := <-h.Unregister:
			if room, ok := h.Rooms[client.RoomID]; ok {
				room.Unregister <- client

				err1 := h.gameService.setDisconnectionTime(client.User.ID)
				if err1 != nil {
					fmt.Print(err1)
					client.Conn.WriteJSON(map[string]string{
						"type":    "error",
						"message": "Update disconnection time failed",
					})
				}
				// Send notification when a player leaves
				if len(room.Clients) > 0 {
					leaveMsg := map[string]interface{}{
						"type":          "room_status",
						"players_count": len(room.Clients) - 1, // -1 because client hasn't been removed yet
						"message":       fmt.Sprintf("%d has left the game", client.User.ID),
						"ready_to_play": false,
					}

					leaveBytes, _ := json.Marshal(leaveMsg)
					room.Broadcast <- leaveBytes
				}

				if len(room.Clients) == 0 {
					delete(h.Rooms, client.RoomID)
					err := h.gameService.DeleteGame(client.RoomID)
					if err != nil {
						fmt.Print(err)
						client.Conn.WriteJSON(map[string]string{
							"type":    "error",
							"message": "Game deletion failed",
						})
						client.Conn.Close()
						continue
					} else {
						fmt.Println("gg")
						client.Conn.WriteJSON(map[string]string{
							"type":    "game-destroy",
							"message": "Game room deleted successfully",
						})
						h.gameService.UpdateActiveGameState(client.User.ID, " ")
					}

				}
			}
		}
	}
}
