package config

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	Port          int
	DatabaseURL   string
	JWTSecret     string
	SeedOnStart   bool
	MigrationsDir string
}

func FromEnv() (Config, error) {
	var cfg Config

	port, err := envInt("API_PORT", 8080)
	if err != nil {
		return cfg, err
	}
	cfg.Port = port

	cfg.DatabaseURL = os.Getenv("DATABASE_URL")
	if cfg.DatabaseURL == "" {
		return cfg, errors.New("DATABASE_URL is required")
	}

	cfg.JWTSecret = os.Getenv("JWT_SECRET")
	if cfg.JWTSecret == "" {
		return cfg, errors.New("JWT_SECRET is required")
	}

	seedOnStart, err := envBool("SEED_ON_START", false)
	if err != nil {
		return cfg, err
	}
	cfg.SeedOnStart = seedOnStart

	// In container, working dir is /app and migrations are at /app/migrations.
	cfg.MigrationsDir = os.Getenv("MIGRATIONS_DIR")
	if cfg.MigrationsDir == "" {
		cfg.MigrationsDir = filepath.Join(".", "migrations")
	}


	return cfg, nil
}

func envInt(key string, def int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	return strconv.Atoi(v)
}

func envBool(key string, def bool) (bool, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	return strconv.ParseBool(v)
}

