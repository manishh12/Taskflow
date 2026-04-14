package httpapi

import (
	"database/sql"

	"taskflow/backend/internal/config"
)

type Handlers struct {
	cfg config.Config
	db  *sql.DB
}

func NewHandlers(cfg config.Config, db *sql.DB) *Handlers {
	return &Handlers{cfg: cfg, db: db}
}

