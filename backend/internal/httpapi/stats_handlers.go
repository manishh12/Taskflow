package httpapi

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
)

type projectStatsResponse struct {
	ByStatus   map[string]int `json:"by_status"`
	ByAssignee map[string]int `json:"by_assignee"`
}

func (h *Handlers) GetProjectStats(w http.ResponseWriter, r *http.Request) {
	u, _ := CurrentUser(r)
	projectID := chi.URLParam(r, "projectID")

	if !h.userCanAccessProject(r, u.ID, projectID) {
		// Hide existence if user can't see it
		WriteError(w, http.StatusNotFound, "not found")
		return
	}

	// Ensure project exists (otherwise userCanAccessProject could be false-positive only if tasks exist; but
	// that can't happen due to FK. Still, be explicit about 404.)
	var exists bool
	if err := h.db.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1)`, projectID).Scan(&exists); err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if !exists {
		WriteError(w, http.StatusNotFound, "not found")
		return
	}

	byStatus := map[string]int{"todo": 0, "in_progress": 0, "done": 0}
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT status::text, COUNT(*)
		FROM tasks
		WHERE project_id = $1
		GROUP BY status
	`, projectID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	for rows.Next() {
		var status string
		var cnt int
		if err := rows.Scan(&status, &cnt); err != nil {
			_ = rows.Close()
			WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}
		byStatus[status] = cnt
	}
	if err := rows.Close(); err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Assignee counts (use "unassigned" bucket for NULL)
	byAssignee := map[string]int{}
	arows, err := h.db.QueryContext(r.Context(), `
		SELECT COALESCE(assignee_id::text, 'unassigned') AS assignee, COUNT(*)
		FROM tasks
		WHERE project_id = $1
		GROUP BY COALESCE(assignee_id::text, 'unassigned')
		ORDER BY assignee
	`, projectID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	for arows.Next() {
		var key string
		var cnt int
		if err := arows.Scan(&key, &cnt); err != nil {
			_ = arows.Close()
			WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}
		byAssignee[key] = cnt
	}
	if err := arows.Close(); err != nil {
		if errors.Is(err, sql.ErrConnDone) {
			WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	WriteJSON(w, http.StatusOK, projectStatsResponse{
		ByStatus:   byStatus,
		ByAssignee: byAssignee,
	})
}

