// package main

// import (
// 	"fmt"
// 	"net/http"
// )

// func main() {
// 	hub := NewHub()
// 	go hub.Run()

// 	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
// 		ServeWs(hub, w, r)
// 	})

// 	fmt.Println("Server started at :8080")
// 	http.ListenAndServe(":8080", nil)
// }

package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}
	// Initialize database
	db, err := initDB()
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	// Create tables
	if err := createTables(db); err != nil {
		log.Fatal("Failed to create tables:", err)
	}

	// Initialize services
	authService := NewAuthService(db)
	fmt.Println(authService.oauthConfig.ClientID)
	gameService := NewGameService(db)
	hub := NewHub(db, gameService)

	go hub.Run()

	// Setup routes
	r := mux.NewRouter()

	// Auth routes
	r.HandleFunc("/auth/google", authService.GoogleLogin).Methods("GET")
	r.HandleFunc("/auth/google/callback", authService.GoogleCallback).Methods("GET")
	r.HandleFunc("/auth/me", authService.GetUser).Methods("GET")
	r.HandleFunc("/auth/logout", authService.Logout).Methods("POST")
	r.HandleFunc("/auth/login", authService.Login).Methods("POST")
	r.HandleFunc("/auth/register", authService.Register).Methods("POST")

	// Game routes
	r.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ServeWs(hub, w, r, authService)
	}).Methods("GET")

	r.HandleFunc("/games", authService.RequireAuth(gameService.GetUserGames)).Methods("GET")
	r.HandleFunc("/games/{id}", authService.RequireAuth(gameService.GetGamebyID)).Methods("GET")

	// Enable CORS
	r.Use(corsMiddleware)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Server started at :%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, corsMiddleware(r)))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
