package httpapi

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type taskListResponse struct {
	Tasks []Task `json:"tasks"`
	Page  *int   `json:"page,omitempty"`
	Limit *int   `json:"limit,omitempty"`
}

func (h *Handlers) ListProjectTasks(w http.ResponseWriter, r *http.Request) {
	u, _ := CurrentUser(r)
	projectID := chi.URLParam(r, "projectID")

	if !h.userCanAccessProject(r, u.ID, projectID) {
		WriteError(w, http.StatusNotFound, "not found")
		return
	}

	status := strings.TrimSpace(r.URL.Query().Get("status"))
	assignee := strings.TrimSpace(r.URL.Query().Get("assignee"))

	pg, enabled, fields := parsePagination(r)
	if enabled && len(fields) > 0 {
		WriteValidationError(w, fields)
		return
	}

	tasks, err := h.fetchTasksForProject(r, projectID, status, assignee, enabled, pg)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp := taskListResponse{Tasks: tasks}
	if enabled {
		resp.Page = &pg.Page
		resp.Limit = &pg.Limit
	}
	WriteJSON(w, http.StatusOK, resp)
}

type createTaskRequest struct {
	Title       string  `json:"title"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
	Priority    *string `json:"priority"`
	AssigneeID  *string `json:"assignee_id"`
	DueDate     *string `json:"due_date"` // YYYY-MM-DD
}

func (h *Handlers) CreateTask(w http.ResponseWriter, r *http.Request) {
	u, _ := CurrentUser(r)
	projectID := chi.URLParam(r, "projectID")

	if !h.userCanAccessProject(r, u.ID, projectID) {
		// project doesn't exist or not accessible
		WriteError(w, http.StatusNotFound, "not found")
		return
	}

	var req createTaskRequest
	if err := DecodeJSON(r, &req); err != nil {
		WriteValidationError(w, map[string]string{"body": "invalid json"})
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	if req.Description != nil {
		d := strings.TrimSpace(*req.Description)
		req.Description = &d
	}

	fields := map[string]string{}
	if req.Title == "" {
		fields["title"] = "is required"
	}
	if req.Status != nil && !isValidStatus(*req.Status) {
		fields["status"] = "is invalid"
	}
	if req.Priority != nil && !isValidPriority(*req.Priority) {
		fields["priority"] = "is invalid"
	}

	var dueDate *time.Time
	if req.DueDate != nil && strings.TrimSpace(*req.DueDate) != "" {
		t, err := time.Parse("2006-01-02", strings.TrimSpace(*req.DueDate))
		if err != nil {
			fields["due_date"] = "must be YYYY-MM-DD"
		} else {
			today := time.Now().In(time.Local)
			todayDate := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.Local)
			due := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.Local)
			if due.Before(todayDate) {
				fields["due_date"] = "cannot be in the past"
			} else {
			dueDate = &t
			}
		}
	}

	// Validate assignee_id (UUID + user exists) to avoid 500s and FK violations.
	if req.AssigneeID != nil {
		v := strings.TrimSpace(*req.AssigneeID)
		if v == "" {
			req.AssigneeID = nil
		} else {
			if _, err := uuid.Parse(v); err != nil {
				fields["assignee_id"] = "must be a valid uuid"
			} else {
				var ok bool
				if err := h.db.QueryRowContext(r.Context(), `
					SELECT EXISTS(
						SELECT 1
						FROM project_members pm
						WHERE pm.project_id = $1 AND pm.user_id = $2
					)
				`, projectID, v).Scan(&ok); err != nil {
					WriteError(w, http.StatusInternalServerError, "internal error")
					return
				}
				if !ok {
					fields["assignee_id"] = "must be a project member"
				}
			}
		}
	}

	if len(fields) > 0 {
		WriteValidationError(w, fields)
		return
	}

	status := "todo"
	if req.Status != nil {
		status = *req.Status
	}
	priority := "medium"
	if req.Priority != nil {
		priority = *req.Priority
	}

	var t Task
	err := h.db.QueryRowContext(r.Context(), `
		INSERT INTO tasks (title, description, status, priority, project_id, creator_id, assignee_id, due_date)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id::text, title, description, status::text, priority::text, project_id::text,
		          assignee_id::text, due_date, created_at, updated_at, creator_id::text
	`, req.Title, req.Description, status, priority, projectID, u.ID, req.AssigneeID, dueDate).Scan(
		&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.ProjectID,
		&t.AssigneeID, &t.DueDate, &t.CreatedAt, &t.UpdatedAt, &t.CreatorID,
	)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	WriteJSON(w, http.StatusCreated, t)
}

type updateTaskRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
	Priority    *string `json:"priority"`
	AssigneeID  *string `json:"assignee_id"`
	DueDate     *string `json:"due_date"` // YYYY-MM-DD or null
}

func (h *Handlers) UpdateTask(w http.ResponseWriter, r *http.Request) {
	u, _ := CurrentUser(r)
	taskID := chi.URLParam(r, "taskID")

	access, projectOwner, creatorID, err := h.taskAccessInfo(r, taskID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			WriteError(w, http.StatusNotFound, "not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if !access(u.ID, projectOwner, creatorID) {
		WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req updateTaskRequest
	if err := DecodeJSON(r, &req); err != nil {
		WriteValidationError(w, map[string]string{"body": "invalid json"})
		return
	}

	fields := map[string]string{}
	if req.Title != nil {
		v := strings.TrimSpace(*req.Title)
		req.Title = &v
		if v == "" {
			fields["title"] = "cannot be empty"
		}
	}
	if req.Description != nil {
		v := strings.TrimSpace(*req.Description)
		req.Description = &v
	}
	if req.Status != nil && !isValidStatus(*req.Status) {
		fields["status"] = "is invalid"
	}
	if req.Priority != nil && !isValidPriority(*req.Priority) {
		fields["priority"] = "is invalid"
	}

	assigneeProvided := false
	var assigneeID *string
	if req.AssigneeID != nil {
		assigneeProvided = true
		v := strings.TrimSpace(*req.AssigneeID)
		if v == "" {
			assigneeID = nil // explicit unassign
		} else {
			if _, err := uuid.Parse(v); err != nil {
				fields["assignee_id"] = "must be a valid uuid"
			} else {
				var ok bool
				if err := h.db.QueryRowContext(r.Context(), `
					SELECT EXISTS(
						SELECT 1
						FROM project_members pm
						JOIN tasks t ON t.project_id = pm.project_id
						WHERE t.id = $1 AND pm.user_id = $2
					)
				`, taskID, v).Scan(&ok); err != nil {
					WriteError(w, http.StatusInternalServerError, "internal error")
					return
				}
				if !ok {
					fields["assignee_id"] = "must be a project member"
				} else {
					assigneeID = &v
				}
			}
		}
	}

	var dueDate *time.Time
	dueDateProvided := false
	if req.DueDate != nil {
		dueDateProvided = true
		if strings.TrimSpace(*req.DueDate) == "" {
			dueDate = nil
		} else {
			t, err := time.Parse("2006-01-02", strings.TrimSpace(*req.DueDate))
			if err != nil {
				fields["due_date"] = "must be YYYY-MM-DD"
			} else {
				today := time.Now().In(time.Local)
				todayDate := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.Local)
				due := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.Local)
				if due.Before(todayDate) {
					fields["due_date"] = "cannot be in the past"
				} else {
					dueDate = &t
				}
			}
		}
	}

	if len(fields) > 0 {
		WriteValidationError(w, fields)
		return
	}

	// Build update with COALESCE for simple fields; due_date + assignee_id handled with CASE to allow nulling.
	var t Task
	err = h.db.QueryRowContext(r.Context(), `
		UPDATE tasks
		SET
			title = COALESCE($2, title),
			description = COALESCE($3, description),
			status = COALESCE($4::task_status, status),
			priority = COALESCE($5::task_priority, priority),
			assignee_id = CASE
				WHEN $6::boolean = true THEN $7::uuid
				ELSE assignee_id
			END,
			due_date = CASE
				WHEN $8::boolean = true THEN $9::date
				ELSE due_date
			END
		WHERE id = $1
		RETURNING id::text, title, description, status::text, priority::text, project_id::text,
		          assignee_id::text, due_date, created_at, updated_at, creator_id::text
	`,
		taskID,
		req.Title,
		req.Description,
		req.Status,
		req.Priority,
		assigneeProvided,
		assigneeID,
		dueDateProvided,
		dueDate,
	).Scan(
		&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.ProjectID,
		&t.AssigneeID, &t.DueDate, &t.CreatedAt, &t.UpdatedAt, &t.CreatorID,
	)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	WriteJSON(w, http.StatusOK, t)
}

func (h *Handlers) DeleteTask(w http.ResponseWriter, r *http.Request) {
	u, _ := CurrentUser(r)
	taskID := chi.URLParam(r, "taskID")

	projectOwner, creatorID, err := h.taskDeleteAuth(r, taskID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			WriteError(w, http.StatusNotFound, "not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if u.ID != projectOwner && u.ID != creatorID {
		WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	res, err := h.db.ExecContext(r.Context(), `DELETE FROM tasks WHERE id = $1`, taskID)
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

func (h *Handlers) fetchTasksForProject(r *http.Request, projectID string, status string, assignee string, paged bool, pg Pagination) ([]Task, error) {
	q := `
		SELECT id::text, title, description, status::text, priority::text, project_id::text,
		       assignee_id::text, due_date, created_at, updated_at, creator_id::text
		FROM tasks
		WHERE project_id = $1
	`
	args := []any{projectID}
	argPos := 2
	if status != "" {
		q += " AND status = $" + itoa(argPos) + "::task_status"
		args = append(args, status)
		argPos++
	}
	if assignee != "" {
		q += " AND assignee_id = $" + itoa(argPos) + "::uuid"
		args = append(args, assignee)
		argPos++
	}
	q += " ORDER BY created_at DESC"
	if paged {
		q += " LIMIT $" + itoa(argPos) + " OFFSET $" + itoa(argPos+1)
		args = append(args, pg.Limit, pg.Offset)
	}

	rows, err := h.db.QueryContext(r.Context(), q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Task
	for rows.Next() {
		var t Task
		if err := rows.Scan(
			&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.ProjectID,
			&t.AssigneeID, &t.DueDate, &t.CreatedAt, &t.UpdatedAt, &t.CreatorID,
		); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func isValidStatus(v string) bool {
	switch v {
	case "todo", "in_progress", "done":
		return true
	default:
		return false
	}
}

func isValidPriority(v string) bool {
	switch v {
	case "low", "medium", "high":
		return true
	default:
		return false
	}
}

// Minimal integer -> string without fmt for query building.
func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var buf [20]byte
	pos := len(buf)
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	return string(buf[pos:])
}

func (h *Handlers) taskDeleteAuth(r *http.Request, taskID string) (projectOwner string, creatorID string, err error) {
	err = h.db.QueryRowContext(r.Context(), `
		SELECT p.owner_id::text, t.creator_id::text
		FROM tasks t
		JOIN projects p ON p.id = t.project_id
		WHERE t.id = $1
	`, taskID).Scan(&projectOwner, &creatorID)
	return
}

func (h *Handlers) taskAccessInfo(r *http.Request, taskID string) (access func(userID, ownerID, creatorID string) bool, ownerID string, creatorID string, err error) {
	var assigneeID sql.NullString
	err = h.db.QueryRowContext(r.Context(), `
		SELECT p.owner_id::text, t.creator_id::text, t.assignee_id::text
		FROM tasks t
		JOIN projects p ON p.id = t.project_id
		WHERE t.id = $1
	`, taskID).Scan(&ownerID, &creatorID, &assigneeID)
	if err != nil {
		return nil, "", "", err
	}
	return func(userID, ownerID, creatorID string) bool {
		if userID == ownerID || userID == creatorID {
			return true
		}
		if assigneeID.Valid && userID == assigneeID.String {
			return true
		}
		return false
	}, ownerID, creatorID, nil
}

