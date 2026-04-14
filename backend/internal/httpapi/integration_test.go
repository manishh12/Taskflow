package httpapi

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"taskflow/backend/internal/config"
)

func testConfig(t *testing.T) config.Config {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping integration tests")
	}
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "test-secret"
	}
	return config.Config{
		Port:          0,
		DatabaseURL:   dbURL,
		JWTSecret:     secret,
		SeedOnStart:   false,
		MigrationsDir: filepath.Join(".", "migrations"),
	}
}

func openTestDB(t *testing.T, databaseURL string) *sql.DB {
	t.Helper()
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		t.Fatalf("ping db: %v", err)
	}
	return db
}

func migrateTestDB(t *testing.T, db *sql.DB, migrationsDir string) {
	t.Helper()
	goose.SetDialect("postgres")
	if err := goose.Up(db, migrationsDir); err != nil {
		t.Fatalf("goose up: %v", err)
	}
}

func cleanDB(t *testing.T, db *sql.DB) {
	t.Helper()
	_, err := db.Exec(`TRUNCATE TABLE tasks, project_members, projects, users RESTART IDENTITY CASCADE`)
	if err != nil {
		t.Fatalf("truncate: %v", err)
	}
}

func httpJSON(t *testing.T, srv *httptest.Server, method, path string, token string, body any) *http.Response {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode body: %v", err)
		}
	}
	req, err := http.NewRequest(method, srv.URL+path, &buf)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	return res
}

func decodeJSON[T any](t *testing.T, res *http.Response) T {
	t.Helper()
	defer res.Body.Close()
	var out T
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		t.Fatalf("decode json: %v", err)
	}
	return out
}

func TestIntegration_AuthRegisterLoginMe(t *testing.T) {
	cfg := testConfig(t)
	db := openTestDB(t, cfg.DatabaseURL)
	defer db.Close()

	migrateTestDB(t, db, cfg.MigrationsDir)
	cleanDB(t, db)

	srv := httptest.NewServer(NewRouter(cfg, db))
	defer srv.Close()

	// Register
	reg := httpJSON(t, srv, http.MethodPost, "/auth/register", "", map[string]any{
		"name":     "Alice",
		"email":    "alice@example.com",
		"password": "password123",
	})
	if reg.StatusCode != http.StatusCreated {
		t.Fatalf("register status=%d", reg.StatusCode)
	}
	type authResp struct {
		Token string     `json:"token"`
		User  AuthedUser `json:"user"`
	}
	ar := decodeJSON[authResp](t, reg)
	if ar.Token == "" || ar.User.Email != "alice@example.com" {
		t.Fatalf("unexpected register resp: %+v", ar)
	}

	// Login
	login := httpJSON(t, srv, http.MethodPost, "/auth/login", "", map[string]any{
		"email":    "alice@example.com",
		"password": "password123",
	})
	if login.StatusCode != http.StatusOK {
		t.Fatalf("login status=%d", login.StatusCode)
	}
	lr := decodeJSON[authResp](t, login)
	if lr.Token == "" {
		t.Fatal("expected token")
	}

	// /me
	me := httpJSON(t, srv, http.MethodGet, "/me", lr.Token, nil)
	if me.StatusCode != http.StatusOK {
		t.Fatalf("me status=%d", me.StatusCode)
	}
	u := decodeJSON[AuthedUser](t, me)
	if u.Email != "alice@example.com" {
		t.Fatalf("unexpected me: %+v", u)
	}
}

func TestIntegration_CreateProjectAndList(t *testing.T) {
	cfg := testConfig(t)
	db := openTestDB(t, cfg.DatabaseURL)
	defer db.Close()

	migrateTestDB(t, db, cfg.MigrationsDir)
	cleanDB(t, db)

	srv := httptest.NewServer(NewRouter(cfg, db))
	defer srv.Close()

	// register+login
	reg := httpJSON(t, srv, http.MethodPost, "/auth/register", "", map[string]any{
		"name":     "Bob",
		"email":    "bob@example.com",
		"password": "password123",
	})
	if reg.StatusCode != http.StatusCreated {
		t.Fatalf("register status=%d", reg.StatusCode)
	}
	type authResp struct {
		Token string `json:"token"`
	}
	token := decodeJSON[authResp](t, reg).Token

	// create project
	cp := httpJSON(t, srv, http.MethodPost, "/projects", token, map[string]any{
		"name":        "Demo",
		"description": "test",
	})
	if cp.StatusCode != http.StatusCreated {
		t.Fatalf("create project status=%d", cp.StatusCode)
	}
	p := decodeJSON[Project](t, cp)
	if p.ID == "" || p.Name != "Demo" {
		t.Fatalf("unexpected project: %+v", p)
	}

	// Owner should appear in members list.
	mem := httpJSON(t, srv, http.MethodGet, "/projects/"+p.ID+"/members", token, nil)
	if mem.StatusCode != http.StatusOK {
		t.Fatalf("members status=%d", mem.StatusCode)
	}
	type membersResp struct {
		Members []AuthedUser `json:"members"`
	}
	mr := decodeJSON[membersResp](t, mem)
	if len(mr.Members) != 1 {
		t.Fatalf("expected 1 member, got %d", len(mr.Members))
	}

	// list projects (with pagination params too)
	lp := httpJSON(t, srv, http.MethodGet, "/projects?page=1&limit=10", token, nil)
	if lp.StatusCode != http.StatusOK {
		t.Fatalf("list projects status=%d", lp.StatusCode)
	}
	type listResp struct {
		Projects []Project `json:"projects"`
		Page     *int      `json:"page"`
		Limit    *int      `json:"limit"`
	}
	out := decodeJSON[listResp](t, lp)
	if len(out.Projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(out.Projects))
	}
	if out.Page == nil || out.Limit == nil {
		t.Fatalf("expected pagination fields, got %+v", out)
	}
}

func TestIntegration_CreateTaskUpdateStatusAndStats(t *testing.T) {
	cfg := testConfig(t)
	db := openTestDB(t, cfg.DatabaseURL)
	defer db.Close()

	migrateTestDB(t, db, cfg.MigrationsDir)
	cleanDB(t, db)

	srv := httptest.NewServer(NewRouter(cfg, db))
	defer srv.Close()

	// register
	reg := httpJSON(t, srv, http.MethodPost, "/auth/register", "", map[string]any{
		"name":     "Cara",
		"email":    "cara@example.com",
		"password": "password123",
	})
	if reg.StatusCode != http.StatusCreated {
		t.Fatalf("register status=%d", reg.StatusCode)
	}
	type authResp struct {
		Token string     `json:"token"`
		User  AuthedUser `json:"user"`
	}
	ar := decodeJSON[authResp](t, reg)

	// create project
	cp := httpJSON(t, srv, http.MethodPost, "/projects", ar.Token, map[string]any{"name": "P"})
	if cp.StatusCode != http.StatusCreated {
		t.Fatalf("create project status=%d", cp.StatusCode)
	}
	p := decodeJSON[Project](t, cp)

	// create task (assigned to me)
	ct := httpJSON(t, srv, http.MethodPost, "/projects/"+p.ID+"/tasks", ar.Token, map[string]any{
		"title":       "T1",
		"priority":    "high",
		"assignee_id": ar.User.ID,
	})
	if ct.StatusCode != http.StatusCreated {
		t.Fatalf("create task status=%d", ct.StatusCode)
	}
	task := decodeJSON[Task](t, ct)

	// update task status
	ut := httpJSON(t, srv, http.MethodPatch, "/tasks/"+task.ID, ar.Token, map[string]any{
		"status": "done",
	})
	if ut.StatusCode != http.StatusOK {
		t.Fatalf("update task status=%d", ut.StatusCode)
	}
	updated := decodeJSON[Task](t, ut)
	if updated.Status != "done" {
		t.Fatalf("expected done, got %s", updated.Status)
	}

	// stats should show 1 done and assignee count 1
	st := httpJSON(t, srv, http.MethodGet, "/projects/"+p.ID+"/stats", ar.Token, nil)
	if st.StatusCode != http.StatusOK {
		t.Fatalf("stats status=%d", st.StatusCode)
	}
	type statsResp struct {
		ByStatus   map[string]int `json:"by_status"`
		ByAssignee map[string]int `json:"by_assignee"`
	}
	stats := decodeJSON[statsResp](t, st)
	if stats.ByStatus["done"] != 1 {
		t.Fatalf("expected by_status.done=1, got %+v", stats.ByStatus)
	}
	if stats.ByAssignee[ar.User.ID] != 1 {
		t.Fatalf("expected by_assignee[user]=1, got %+v", stats.ByAssignee)
	}
}

