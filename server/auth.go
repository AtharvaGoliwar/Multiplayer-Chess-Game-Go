package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

type AuthService struct {
	db          *sql.DB
	oauthConfig *oauth2.Config
	jwtSecret   []byte
}

type GoogleUser struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

type Claims struct {
	UserID int `json:"user_id"`
	jwt.RegisteredClaims
}

type RegisterRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	User    *User  `json:"user"`
	Message string `json:"message"`
}

func NewAuthService(db *sql.DB) *AuthService {
	fmt.Println(os.Getenv("GOOGLE_CLIENT_ID"))
	return &AuthService{
		db: db,
		oauthConfig: &oauth2.Config{
			ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
			ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
			RedirectURL:  os.Getenv("GOOGLE_REDIRECT_URL"),
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		},
		jwtSecret: []byte(os.Getenv("JWT_SECRET")),
	}
}

// Manual Registration
func (a *AuthService) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate input
	if req.Name == "" || req.Email == "" || req.Password == "" {
		http.Error(w, "Name, email, and password are required", http.StatusBadRequest)
		return
	}

	if len(req.Password) < 6 {
		http.Error(w, "Password must be at least 6 characters", http.StatusBadRequest)
		return
	}

	// Check if user already exists
	var existingUserID int
	err := a.db.QueryRow("SELECT id FROM users WHERE email = $1", req.Email).Scan(&existingUserID)
	if err == nil {
		http.Error(w, "User with this email already exists", http.StatusConflict)
		return
	} else if err != sql.ErrNoRows {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}

	// Create user
	user := &User{}
	err = a.db.QueryRow(`
        INSERT INTO users (email, name, password_hash, updated_at, created_at, google_id, avatar_url)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'notgiven', 'noavatar' )
        RETURNING id, email, name, avatar_url, created_at, updated_at
    `, req.Email, req.Name, string(hashedPassword)).Scan(
		&user.ID, &user.Email, &user.Name, &user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		log.Fatal(err)
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	// Generate JWT
	jwtToken, err := a.generateJWT(user.ID)
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	// Set JWT as HTTP-only cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    jwtToken,
		HttpOnly: true,
		Secure:   os.Getenv("ENV") == "production",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400 * 7, // 7 days
		Path:     "/",
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		User:    user,
		Message: "Registration successful",
	})
}

// Manual Login
func (a *AuthService) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate input
	if req.Email == "" || req.Password == "" {
		http.Error(w, "Email and password are required", http.StatusBadRequest)
		return
	}

	// Get user from database
	user := &User{}
	var hashedPassword string
	err := a.db.QueryRow(`
        SELECT id, email, name, password_hash, created_at, updated_at
        FROM users WHERE email = $1 AND password_hash IS NOT NULL
    `, req.Email).Scan(
		&user.ID, &user.Email, &user.Name, &hashedPassword, &user.CreatedAt, &user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	} else if err != nil {
		log.Fatal(err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(req.Password)); err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Update last login time
	_, err = a.db.Exec("UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", user.ID)
	if err != nil {
		// Log error but don't fail the login
		fmt.Printf("Failed to update last login time: %v\n", err)
	}

	// Generate JWT
	jwtToken, err := a.generateJWT(user.ID)
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	// Set JWT as HTTP-only cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    jwtToken,
		HttpOnly: true,
		Secure:   os.Getenv("ENV") == "production",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400 * 7, // 7 days
		Path:     "/",
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		User:    user,
		Message: "Login successful",
	})
}

func (a *AuthService) GoogleLogin(w http.ResponseWriter, r *http.Request) {
	state := "random-state-string" // In production, use a secure random state
	url := a.oauthConfig.AuthCodeURL(state, oauth2.AccessTypeOffline)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func (a *AuthService) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "No code provided", http.StatusBadRequest)
		return
	}

	token, err := a.oauthConfig.Exchange(context.Background(), code)
	if err != nil {
		http.Error(w, "Failed to exchange token", http.StatusInternalServerError)
		return
	}

	client := a.oauthConfig.Client(context.Background(), token)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		http.Error(w, "Failed to get user info", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	var googleUser GoogleUser
	if err := json.NewDecoder(resp.Body).Decode(&googleUser); err != nil {
		http.Error(w, "Failed to decode user info", http.StatusInternalServerError)
		return
	}

	user, err := a.createOrUpdateUser(googleUser)
	if err != nil {
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	jwtToken, err := a.generateJWT(user.ID)
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	// Set JWT as HTTP-only cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    jwtToken,
		HttpOnly: true,
		Secure:   os.Getenv("ENV") == "production",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400 * 7, // 7 days
		Path:     "/",
	})

	// Redirect to frontend
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	http.Redirect(w, r, frontendURL, http.StatusTemporaryRedirect)
}

func (a *AuthService) createOrUpdateUser(googleUser GoogleUser) (*User, error) {
	user := &User{}

	err := a.db.QueryRow(`
        INSERT INTO users (google_id, email, name, avatar_url, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (google_id) 
        DO UPDATE SET 
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            avatar_url = EXCLUDED.avatar_url,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id, google_id, email, name, avatar_url, created_at, updated_at
    `, googleUser.ID, googleUser.Email, googleUser.Name, googleUser.Picture).Scan(
		&user.ID, &user.GoogleID, &user.Email, &user.Name,
		&user.AvatarURL, &user.CreatedAt, &user.UpdatedAt,
	)

	return user, err
}

func (a *AuthService) generateJWT(userID int) (string, error) {
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(a.jwtSecret)
}

func (a *AuthService) validateJWT(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return a.jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}

func (a *AuthService) GetUser(w http.ResponseWriter, r *http.Request) {
	user := a.getUserFromContext(r)
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (a *AuthService) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    "",
		HttpOnly: true,
		Secure:   os.Getenv("ENV") == "production",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Path:     "/",
	})

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Logged out successfully"})
}

func (a *AuthService) RequireAuth(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := a.getUserFromContext(r)
		if user == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		handler(w, r)
	}
}

func (a *AuthService) getUserFromContext(r *http.Request) *User {
	// Try to get token from cookie first
	cookie, err := r.Cookie("token")
	var tokenString string
	if err == nil {
		tokenString = cookie.Value
		// fmt.Println(tokenString)
	} else {
		// Try Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			return nil
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			return nil
		}
		tokenString = parts[1]
	}

	claims, err := a.validateJWT(tokenString)
	if err != nil {
		return nil
	}

	user := &User{}
	err = a.db.QueryRow(`
        SELECT id, google_id, email, name, avatar_url, created_at, updated_at, active_game
        FROM users WHERE id = $1
    `, claims.UserID).Scan(
		&user.ID, &user.GoogleID, &user.Email, &user.Name,
		&user.AvatarURL, &user.CreatedAt, &user.UpdatedAt, &user.ActiveGame,
	)

	if err != nil {
		log.Fatalln(err)
		return nil
	}

	return user
}
