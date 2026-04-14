package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"taskflow/backend/internal/config"
	"taskflow/backend/internal/httpapi"
	"taskflow/backend/internal/seed"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg, err := config.FromEnv()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	db, err := openDB(cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to db", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := runMigrations(db, cfg.MigrationsDir); err != nil {
		logger.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}

	if cfg.SeedOnStart {
		if err := seed.Run(context.Background(), db); err != nil {
			logger.Error("failed to run seed", "error", err)
			os.Exit(1)
		}
	}

	router := httpapi.NewRouter(cfg, db)
	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		logger.Info("api listening", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("http server error", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	logger.Info("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
	}
}

func openDB(databaseURL string) (*sql.DB, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func runMigrations(db *sql.DB, migrationsDir string) error {
	goose.SetDialect("postgres")
	if err := goose.Up(db, migrationsDir); err != nil {
		return err
	}
	return nil
}

