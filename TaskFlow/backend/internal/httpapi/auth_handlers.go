package httpapi

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

type authResponse struct {
	Token string     `json:"token"`
	User  AuthedUser `json:"user"`
}

type registerRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handlers) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := DecodeJSON(r, &req); err != nil {
		WriteValidationError(w, map[string]string{"body": "invalid json"})
		return
	}

	fields := map[string]string{}
	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Name == "" {
		fields["name"] = "is required"
	}
	if req.Email == "" {
		fields["email"] = "is required"
	} else if !strings.Contains(req.Email, "@") {
		fields["email"] = "is invalid"
	}
	if req.Password == "" {
		fields["password"] = "is required"
	} else if len(req.Password) < 8 {
		fields["password"] = "must be at least 8 characters"
	}
	if len(fields) > 0 {
		WriteValidationError(w, fields)
		return
	}

	pwHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	var u AuthedUser
	err = h.db.QueryRowContext(r.Context(), `
		INSERT INTO users (name, email, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id::text, name, email
	`, req.Name, req.Email, string(pwHash)).Scan(&u.ID, &u.Name, &u.Email)
	if err != nil {
		// unique violation
		if strings.Contains(err.Error(), "duplicate key") {
			WriteValidationError(w, map[string]string{"email": "is already taken"})
			return
		}
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	token, err := IssueToken(h.cfg.JWTSecret, u.ID, u.Email)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	WriteJSON(w, http.StatusCreated, authResponse{Token: token, User: u})
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := DecodeJSON(r, &req); err != nil {
		WriteValidationError(w, map[string]string{"body": "invalid json"})
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	fields := map[string]string{}
	if req.Email == "" {
		fields["email"] = "is required"
	}
	if req.Password == "" {
		fields["password"] = "is required"
	}
	if len(fields) > 0 {
		WriteValidationError(w, fields)
		return
	}

	var u AuthedUser
	var pwHash string
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id::text, name, email, password_hash
		FROM users
		WHERE email = $1
	`, req.Email).Scan(&u.ID, &u.Name, &u.Email, &pwHash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(pwHash), []byte(req.Password)); err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	token, err := IssueToken(h.cfg.JWTSecret, u.ID, u.Email)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	WriteJSON(w, http.StatusOK, authResponse{Token: token, User: u})
}

func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	u, ok := CurrentUser(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	WriteJSON(w, http.StatusOK, u)
}

