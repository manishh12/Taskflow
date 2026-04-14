package httpapi

import (
	"net/http"
	"strconv"
	"strings"
)

type Pagination struct {
	Page   int `json:"page"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

// parsePagination returns (pagination, enabled, validationFields).
// Pagination is only enabled if either page or limit is provided.
func parsePagination(r *http.Request) (Pagination, bool, map[string]string) {
	q := r.URL.Query()
	pageRaw := strings.TrimSpace(q.Get("page"))
	limitRaw := strings.TrimSpace(q.Get("limit"))
	if pageRaw == "" && limitRaw == "" {
		return Pagination{}, false, nil
	}

	fields := map[string]string{}

	page := 1
	if pageRaw != "" {
		v, err := strconv.Atoi(pageRaw)
		if err != nil || v < 1 {
			fields["page"] = "must be a positive integer"
		} else {
			page = v
		}
	}

	limit := 20
	if limitRaw != "" {
		v, err := strconv.Atoi(limitRaw)
		if err != nil || v < 1 {
			fields["limit"] = "must be a positive integer"
		} else if v > 100 {
			fields["limit"] = "must be <= 100"
		} else {
			limit = v
		}
	}

	if len(fields) > 0 {
		return Pagination{}, true, fields
	}

	return Pagination{
		Page:   page,
		Limit: limit,
		Offset: (page - 1) * limit,
	}, true, nil
}

