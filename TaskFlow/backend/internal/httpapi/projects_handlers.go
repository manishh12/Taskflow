package httpapi

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type Project struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	OwnerID     string    `json:"owner_id"`
	CreatedAt   time.Time `json:"created_at"`
}

type projectListResponse struct {
	Projects []Project `json:"projects"`
	Page     *int      `json:"page,omitempty"`
	Limit    *int      `json:"limit,omitempty"`
}

func (h *Handlers) ListProjects(w http.ResponseWriter, r *http.Request) {
	u, _ := CurrentUser(r)

	pg, enabled, fields := parsePagination(r)
	if enabled && len(fields) > 0 {
		WriteValidationError(w, fields)
		return
	}

	baseQuery := `
		SELECT DISTINCT p.id::text, p.name, p.description, p.owner_id::text, p.created_at
		FROM projects p
		LEFT JOIN tasks t ON t.project_id = p.id
		LEFT JOIN project_members pm ON pm.project_id = p.id
		WHERE p.owner_id = $1
		   OR pm.user_id = $1
		   OR t.creator_id = $1
		   OR t.assignee_id = $1
		ORDER BY p.created_at DESC
	`

	var (
		rows *sql.Rows
		err  error
	)
	if enabled {
		rows, err = h.db.QueryContext(r.Context(), baseQuery+` LIMIT $2 OFFSET $3`, u.ID, pg.Limit, pg.Offset)
	} else {
		rows, err = h.db.QueryContext(r.Context(), baseQuery, u.ID)
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	var out []Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt); err != nil {
			WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}
		out = append(out, p)
	}
	resp := projectListResponse{Projects: out}
	if enabled {
		resp.Page = &pg.Page
		resp.Limit = &pg.Limit
	}
	WriteJSON(w, http.StatusOK, resp)
}

type createProjectRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
}

func (h *Handlers) CreateProject(w http.ResponseWriter, r *http.Request) {
	u, _ := CurrentUser(r)

	var req createProjectRequest
	if err := DecodeJSON(r, &req); err != nil {
		WriteValidationError(w, map[string]string{"body": "invalid json"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Description != nil {
		d := strings.TrimSpace(*req.Description)
		req.Description = &d
	}

	fields := map[string]string{}
	if req.Name == "" {
		fields["name"] = "is required"
	}
	if len(fields) > 0 {
		WriteValidationError(w, fields)
		return
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer func() { _ = tx.Rollback() }()

	var p Project
	err = tx.QueryRowContext(r.Context(), `
			INSERT INTO projects (name, description, owner_id)
			VALUES ($1, $2, $3)
			RETURNING id::text, name, description, owner_id::text, created_at
		`, req.Name, req.Description, u.ID).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Owner is also a member (assignee dropdown & access scoping).
	if _, err := tx.ExecContext(r.Context(), `
			INSERT INTO project_members (project_id, user_id, role)
			VALUES ($1, $2, 'owner')
			ON CONFLICT (project_id, user_id) DO NOTHING
		`, p.ID, u.ID); err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := tx.Commit(); err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	WriteJSON(w, http.StatusCreated, p)
}

type Task struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description *string    `json:"description,omitempty"`
	Status      string     `json:"status"`
	Priority    string     `json:"priority"`
	ProjectID   string     `json:"project_id"`
	AssigneeID  *string    `json:"assignee_id,omitempty"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	CreatorID   string     `json:"creator_id"`
}

type projectDetailResponse struct {
	Project
	Tasks []Task `json:"tasks"`
}

func (h *Handlers) GetProject(w http.ResponseWriter, r *http.Request) {
	u, _ := CurrentUser(r)
	projectID := chi.URLParam(r, "projectID")

	if !h.userCanAccessProject(r, u.ID, projectID) {
		WriteError(w, http.StatusNotFound, "not found")
		return
	}

	var p Project
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id::text, name, description, owner_id::text, created_at
		FROM projects
		WHERE id = $1
	`, projectID).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			WriteError(w, http.StatusNotFound, "not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	tasks, err := h.fetchTasksForProject(r, projectID, "", "", false, Pagination{})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	WriteJSON(w, http.StatusOK, projectDetailResponse{Project: p, Tasks: tasks})
}

type updateProjectRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

func (h *Handlers) UpdateProject(w http.ResponseWriter, r *http.Request) {
	u, _ := CurrentUser(r)
	projectID := chi.URLParam(r, "projectID")

	owner, err := h.projectOwnerID(r, projectID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			WriteError(w, http.StatusNotFound, "not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if owner != u.ID {
		WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req updateProjectRequest
	if err := DecodeJSON(r, &req); err != nil {
		WriteValidationError(w, map[string]string{"body": "invalid json"})
		return
	}

	if req.Name != nil {
		n := strings.TrimSpace(*req.Name)
		req.Name = &n
	}
	if req.Description != nil {
		d := strings.TrimSpace(*req.Description)
		req.Description = &d
	}

	fields := map[string]string{}
	if req.Name != nil && *req.Name == "" {
		fields["name"] = "cannot be empty"
	}
	if len(fields) > 0 {
		WriteValidationError(w, fields)
		return
	}

	var p Project
	err = h.db.QueryRowContext(r.Context(), `
		UPDATE projects
		SET
			name = COALESCE($2, name),
			description = COALESCE($3, description)
		WHERE id = $1
		RETURNING id::text, name, description, owner_id::text, created_at
	`, projectID, req.Name, req.Description).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	WriteJSON(w, http.StatusOK, p)
}

func (h *Handlers) DeleteProject(w http.ResponseWriter, r *http.Request) {
	u, _ := CurrentUser(r)
	projectID := chi.URLParam(r, "projectID")

	owner, err := h.projectOwnerID(r, projectID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			WriteError(w, http.StatusNotFound, "not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if owner != u.ID {
		WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	res, err := h.db.ExecContext(r.Context(), `DELETE FROM projects WHERE id = $1`, projectID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		WriteError(w, http.StatusNotFound, "not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) projectOwnerID(r *http.Request, projectID string) (string, error) {
	var owner string
	err := h.db.QueryRowContext(r.Context(), `SELECT owner_id::text FROM projects WHERE id = $1`, projectID).Scan(&owner)
	return owner, err
}

func (h *Handlers) userCanAccessProject(r *http.Request, userID string, projectID string) bool {
	var ok bool
	err := h.db.QueryRowContext(r.Context(), `
		SELECT EXISTS(
			SELECT 1
			FROM projects p
			LEFT JOIN tasks t ON t.project_id = p.id
			LEFT JOIN project_members pm ON pm.project_id = p.id
			WHERE p.id = $2
			  AND (p.owner_id = $1 OR pm.user_id = $1 OR t.creator_id = $1 OR t.assignee_id = $1)
		)
	`, userID, projectID).Scan(&ok)
	return err == nil && ok
}

