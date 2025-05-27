// package main

// import (
// 	"encoding/json"
// 	"fmt"
// 	"net/http"

// 	"github.com/gorilla/websocket"
// )

// type Client struct {
// 	Conn   *websocket.Conn
// 	RoomID string
// 	Send   chan []byte
// 	Name   string // NEW
// 	Color  string // NEW
// }

// type Room struct {
// 	ID         string
// 	Clients    map[*Client]bool
// 	Broadcast  chan []byte
// 	Register   chan *Client
// 	Unregister chan *Client
// }

// func NewRoom(id string) *Room {
// 	return &Room{
// 		ID:         id,
// 		Clients:    make(map[*Client]bool),
// 		Broadcast:  make(chan []byte),
// 		Register:   make(chan *Client),
// 		Unregister: make(chan *Client),
// 	}
// }

// type Message struct {
// 	Type    string `json:"type"` // "move" or "chat"
// 	From    string `json:"from,omitempty"`
// 	To      string `json:"to,omitempty"`
// 	FEN     string `json:"fen,omitempty"`
// 	Sender  string `json:"sender,omitempty"`
// 	Message string `json:"message,omitempty"`
// }

// func (r *Room) Run() {
// 	for {
// 		select {
// 		case client := <-r.Register:
// 			r.Clients[client] = true

// 			// Send init message to client
// 			initMsg := map[string]string{
// 				"type":  "init",
// 				"name":  client.Name,
// 				"color": client.Color,
// 			}
// 			client.Conn.WriteJSON(initMsg)

// 		case client := <-r.Unregister:
// 			if _, ok := r.Clients[client]; ok {
// 				delete(r.Clients, client)
// 				close(client.Send)
// 			}

// 		case msg := <-r.Broadcast:
// 			var payload map[string]interface{}
// 			if err := json.Unmarshal(msg, &payload); err != nil {
// 				continue
// 			}

// 			msgType, _ := payload["type"].(string)

// 			switch msgType {
// 			case "move":
// 				sender, _ := payload["sender"].(string)
// 				for client := range r.Clients {
// 					if client.Name != sender {
// 						client.Send <- msg
// 					}
// 				}

// 			case "chat":
// 				for client := range r.Clients {
// 					client.Send <- msg // send chat to both players
// 				}
// 			}
// 		}
// 	}
// }

// var upgrader = websocket.Upgrader{
// 	CheckOrigin: func(r *http.Request) bool { return true },
// }

// //new WebSocket("ws://localhost:8080/ws?room=game123&name=Alice")

// func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
// 	conn, err := upgrader.Upgrade(w, r, nil)
// 	if err != nil {
// 		fmt.Println("WebSocket upgrade error:", err)
// 		return
// 	}

// 	roomID := r.URL.Query().Get("room")
// 	name := r.URL.Query().Get("name")
// 	if roomID == "" || name == "" {
// 		conn.WriteJSON(map[string]string{
// 			"type":    "error",
// 			"message": "Missing room or name",
// 		})
// 		conn.Close()
// 		return
// 	}

// 	client := &Client{
// 		Conn:   conn,
// 		RoomID: roomID,
// 		Name:   name,
// 		Send:   make(chan []byte, 256),
// 	}

// 	hub.Register <- client

// 	go client.writePump()
// 	go client.readPump(hub)
// }

// func (c *Client) readPump(hub *Hub) {
// 	defer func() {
// 		hub.Unregister <- c
// 		c.Conn.Close()
// 	}()
// 	for {
// 		_, message, err := c.Conn.ReadMessage()
// 		if err != nil {
// 			break
// 		}
// 		if room, ok := hub.Rooms[c.RoomID]; ok {
// 			room.Broadcast <- message
// 		}
// 	}
// }

// func (c *Client) writePump() {
// 	for msg := range c.Send {
// 		err := c.Conn.WriteMessage(websocket.TextMessage, msg)
// 		if err != nil {
// 			break
// 		}
// 	}
// }

package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type Client struct {
	Conn   *websocket.Conn
	RoomID string
	Send   chan []byte
	User   *User
	Color  string
}

type Room struct {
	ID          string
	db          *sql.DB
	gameService *GameService
	Clients     map[*Client]bool
	Broadcast   chan []byte
	Register    chan *Client
	Unregister  chan *Client
}

func NewRoom(id string, db *sql.DB, gameService *GameService) *Room {
	return &Room{
		ID:          id,
		db:          db,
		gameService: gameService,
		Clients:     make(map[*Client]bool),
		Broadcast:   make(chan []byte),
		Register:    make(chan *Client),
		Unregister:  make(chan *Client),
	}
}

type Message struct {
	Type       string `json:"type"`
	From       string `json:"from,omitempty"`
	To         string `json:"to,omitempty"`
	FEN        string `json:"fen,omitempty"`
	Sender     string `json:"sender,omitempty"`
	Message    string `json:"message,omitempty"`
	MoveNumber int    `json:"move_number,omitempty"`
	GameStatus string `json:"game_status,omitempty"`
	Winner     string `json:"winner,omitempty"`
}

func (r *Room) Run() {
	for {
		select {
		case client := <-r.Register:
			r.Clients[client] = true

		case client := <-r.Unregister:
			if _, ok := r.Clients[client]; ok {
				delete(r.Clients, client)
				close(client.Send)
			}

		case msg := <-r.Broadcast:
			var payload Message
			if err := json.Unmarshal(msg, &payload); err != nil {
				continue
			}

			switch payload.Type {
			case "move":
				// Save move to database
				gameID, _ := uuid.Parse(r.ID)
				var playerID int
				var piece string = "unknown" // You'd parse this from the move

				for client := range r.Clients {
					if client.User.Name == payload.Sender {
						playerID = client.User.ID
						break
					}
				}

				if playerID != 0 {
					r.gameService.SaveMove(gameID, playerID, payload.From, payload.To, piece, payload.FEN, payload.MoveNumber)

					// Update game status if needed
					if payload.GameStatus != "" {
						var winner *string
						if payload.Winner != "" {
							winner = &payload.Winner
						}
						r.gameService.UpdateGame(gameID, payload.FEN, payload.GameStatus, winner)
					}
				}

				// Broadcast to other players
				for client := range r.Clients {
					if client.User.Name != payload.Sender {
						client.Send <- msg
					}
				}

			case "chat":
				// Broadcast chat to all players
				for client := range r.Clients {
					client.Send <- msg
				}
			}
		}
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request, authService *AuthService) {
	// Authenticate user
	user := authService.getUserFromContext(r)
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println("WebSocket upgrade error:", err)
		return
	}

	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		conn.WriteJSON(map[string]string{
			"type":    "error",
			"message": "Missing room ID",
		})
		conn.Close()
		return
	}

	client := &Client{
		Conn:   conn,
		RoomID: roomID,
		User:   user,
		Send:   make(chan []byte, 256),
	}

	hub.Register <- client

	go client.writePump()
	go client.readPump(hub)
}

func (c *Client) readPump(hub *Hub) {
	defer func() {
		hub.Unregister <- c
		c.Conn.Close()
	}()
	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}
		if room, ok := hub.Rooms[c.RoomID]; ok {
			room.Broadcast <- message
		}
	}
}

func (c *Client) writePump() {
	for msg := range c.Send {
		err := c.Conn.WriteMessage(websocket.TextMessage, msg)
		if err != nil {
			break
		}
	}
}
