package httpapi

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

type projectMembersResponse struct {
	Members []AuthedUser `json:"members"`
}

func (h *Handlers) ListProjectMembers(w http.ResponseWriter, r *http.Request) {
	u, _ := CurrentUser(r)
	projectID := chi.URLParam(r, "projectID")

	if !h.userCanAccessProject(r, u.ID, projectID) {
		WriteError(w, http.StatusNotFound, "not found")
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT u.id::text, u.name, u.email
		FROM project_members pm
		JOIN users u ON u.id = pm.user_id
		WHERE pm.project_id = $1
		ORDER BY u.created_at DESC
	`, projectID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	var out []AuthedUser
	for rows.Next() {
		var m AuthedUser
		if err := rows.Scan(&m.ID, &m.Name, &m.Email); err != nil {
			WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}
		out = append(out, m)
	}

	WriteJSON(w, http.StatusOK, projectMembersResponse{Members: out})
}

type addMemberRequest struct {
	Email string `json:"email"`
}

func (h *Handlers) AddProjectMember(w http.ResponseWriter, r *http.Request) {
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

	var req addMemberRequest
	if err := DecodeJSON(r, &req); err != nil {
		WriteValidationError(w, map[string]string{"body": "invalid json"})
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	fields := map[string]string{}
	if req.Email == "" {
		fields["email"] = "is required"
	} else if !strings.Contains(req.Email, "@") {
		fields["email"] = "is invalid"
	}
	if len(fields) > 0 {
		WriteValidationError(w, fields)
		return
	}

	var member AuthedUser
	err = h.db.QueryRowContext(r.Context(), `
		SELECT id::text, name, email
		FROM users
		WHERE email = $1
	`, req.Email).Scan(&member.ID, &member.Name, &member.Email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			WriteValidationError(w, map[string]string{"email": "user not found"})
			return
		}
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// idempotent add
	if _, err := h.db.ExecContext(r.Context(), `
		INSERT INTO project_members (project_id, user_id, role)
		VALUES ($1, $2, 'member')
		ON CONFLICT (project_id, user_id) DO NOTHING
	`, projectID, member.ID); err != nil {
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	WriteJSON(w, http.StatusCreated, member)
}

func (h *Handlers) RemoveProjectMember(w http.ResponseWriter, r *http.Request) {
	u, _ := CurrentUser(r)
	projectID := chi.URLParam(r, "projectID")
	userID := chi.URLParam(r, "userID")

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
	if userID == owner {
		WriteValidationError(w, map[string]string{"user_id": "owner cannot be removed"})
		return
	}

	res, err := h.db.ExecContext(r.Context(), `
		DELETE FROM project_members
		WHERE project_id = $1 AND user_id = $2
	`, projectID, userID)
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

