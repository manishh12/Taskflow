package seed

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// Run is idempotent: it checks for the existence of the test user before inserting.
func Run(ctx context.Context, db *sql.DB) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var exists bool
	err := db.QueryRowContext(ctx, `select exists(select 1 from users where email = $1)`, "test@example.com").Scan(&exists)
	if err != nil {
		// If tables don't exist, migrations likely failed.
		return err
	}
	if exists {
		return nil
	}

	pwHash, err := bcrypt.GenerateFromPassword([]byte("password123"), 12)
	if err != nil {
		return fmt.Errorf("bcrypt: %w", err)
	}

	testUserID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	projectID := uuid.MustParse("00000000-0000-0000-0000-000000000010")
	task1ID := uuid.MustParse("00000000-0000-0000-0000-000000000100")
	task2ID := uuid.MustParse("00000000-0000-0000-0000-000000000101")
	task3ID := uuid.MustParse("00000000-0000-0000-0000-000000000102")

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO users (id, name, email, password_hash)
		VALUES ($1, $2, $3, $4)
	`, testUserID, "Test User", "test@example.com", string(pwHash)); err != nil {
		return fmt.Errorf("seed insert user: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO projects (id, name, description, owner_id)
		VALUES ($1, $2, $3, $4)
	`, projectID, "Demo Project", "Seeded project for reviewers", testUserID); err != nil {
		return fmt.Errorf("seed insert project: %w", err)
	}

	// Owner is also a project member (used for assignee dropdown / access).
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO project_members (project_id, user_id, role)
		VALUES ($1, $2, 'owner')
	`, projectID, testUserID); err != nil {
		return fmt.Errorf("seed insert project member: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO tasks (id, title, description, status, priority, project_id, creator_id, assignee_id, due_date)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE + 7),
			($9, $10, $11, $12, $13, $14, $15, NULL, NULL),
			($16, $17, $18, $19, $20, $21, $22, NULL, CURRENT_DATE + 14)
	`,
		task1ID, "Design homepage", "Create initial homepage layout", "in_progress", "high", projectID, testUserID, testUserID,
		task2ID, "Set up CI", "Add lint/test workflow", "todo", "medium", projectID, testUserID,
		task3ID, "Write release notes", "Draft v1 release notes", "done", "low", projectID, testUserID,
	); err != nil {
		return fmt.Errorf("seed insert tasks: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return nil
}

