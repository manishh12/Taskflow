package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"taskflow/backend/internal/config"
)

func NewRouter(cfg config.Config, db *sql.DB) http.Handler {
	r := chi.NewRouter()

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://127.0.0.1:3000"},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	}))
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5))
	r.Use(middleware.Timeout(30 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	h := NewHandlers(cfg, db)

	r.Route("/auth", func(r chi.Router) {
		r.Post("/register", h.Register)
		r.Post("/login", h.Login)
	})

	r.Group(func(r chi.Router) {
		r.Use(authMiddleware(cfg, db))

		r.Get("/me", h.Me)
		// NOTE: We intentionally do not expose a global user directory.
		// Assignee selection is scoped to project members: GET /projects/:id/members.

		r.Route("/projects", func(r chi.Router) {
			r.Get("/", h.ListProjects)
			r.Post("/", h.CreateProject)
			r.Route("/{projectID}", func(r chi.Router) {
				r.Get("/", h.GetProject)
				r.Get("/stats", h.GetProjectStats)
				r.Get("/members", h.ListProjectMembers)
				r.Post("/members", h.AddProjectMember)
				r.Delete("/members/{userID}", h.RemoveProjectMember)
				r.Patch("/", h.UpdateProject)
				r.Delete("/", h.DeleteProject)
				r.Get("/tasks", h.ListProjectTasks)
				r.Post("/tasks", h.CreateTask)
			})
		})

		r.Route("/tasks", func(r chi.Router) {
			r.Route("/{taskID}", func(r chi.Router) {
				r.Patch("/", h.UpdateTask)
				r.Delete("/", h.DeleteTask)
			})
		})
	})

	return r
}

type ctxKey string

const ctxUser ctxKey = "user"

type AuthedUser struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

func authMiddleware(cfg config.Config, db *sql.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authz := r.Header.Get("Authorization")
			if authz == "" || !strings.HasPrefix(authz, "Bearer ") {
				WriteError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			token := strings.TrimPrefix(authz, "Bearer ")
			claims, err := ParseToken(cfg.JWTSecret, token)
			if err != nil {
				WriteError(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			var u AuthedUser
			err = db.QueryRowContext(r.Context(),
				`SELECT id::text, name, email FROM users WHERE id = $1`,
				claims.UserID,
			).Scan(&u.ID, &u.Name, &u.Email)
			if err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					WriteError(w, http.StatusUnauthorized, "unauthorized")
					return
				}
				WriteError(w, http.StatusInternalServerError, "internal error")
				return
			}

			ctx := context.WithValue(r.Context(), ctxUser, u)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func CurrentUser(r *http.Request) (AuthedUser, bool) {
	u, ok := r.Context().Value(ctxUser).(AuthedUser)
	return u, ok
}

