# TaskFlow

Minimal task management system with authentication, projects, and tasks.

## Overview

TaskFlow lets users register/login, create projects, and manage tasks inside projects (status, priority, due date, assignee). It includes a Go REST API, a React (TypeScript) frontend, and PostgreSQL with SQL migrations managed by Goose.

- Backend: Go, chi, JWT, bcrypt, slog, PostgreSQL, Goose migrations
- Frontend: React + TypeScript, React Router, TanStack Query, Tailwind CSS (utility styling) with small custom UI primitives (no heavy component library)
  - UI approach choice (per assignment): **built our own** small component set (`frontend/src/ui/*`) + Tailwind tokens (no shadcn/MUI/etc)
  - Bonus UI: **dark mode toggle** (persisted) and **drag & drop** task status changes (board view)
- Infra: Docker Compose for db/api/web

## Architecture Decisions

- REST API with JWT auth (`Authorization: Bearer <token>`).
- PostgreSQL schema managed via Goose SQL migrations (no ORM auto-migrate).
- Tasks include `creator_id` to enforce "task creator can delete" authorization.
- Frontend persists auth in `localStorage` and uses protected routes.
- Optimistic UI for task status updates (immediate UI update + revert on error).

Tradeoffs / intentionally left out:

- No complex org/project membership model; project access is via ownership or having tasks (creator or assignee) in the project.
- No real-time updates, drag-and-drop, or advanced audit logging (can be added later).

## Running Locally

```bash
git clone <your-repo-url>
cd taskflow
cp .env.example .env
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:8080

## Running Migrations

Migrations run automatically on API container start using Goose. To run manually:

```bash
docker compose run --rm api goose -dir ./migrations postgres "$DATABASE_URL" up
```

## Test Credentials

Seed runs on startup (controlled by `SEED_ON_START`).

```
Email:    test@example.com
Password: password123
```

## API Reference

### Auth
- `POST /auth/register`
- `POST /auth/login`

### Projects
- `GET /projects`
- `POST /projects`
- `GET /projects/:id`
- `PATCH /projects/:id`
- `DELETE /projects/:id`

### Tasks
- `GET /projects/:id/tasks?status=todo&assignee=<uuid>`
- `POST /projects/:id/tasks`
- `PATCH /tasks/:id`
- `DELETE /tasks/:id`

### Users
- (No global user directory exposed.)

### Project members
- `GET /projects/:id/members` (assignee dropdown source)
- `POST /projects/:id/members` (owner only; body `{ "email": "user@example.com" }`)
- `DELETE /projects/:id/members/:userId` (owner only)
All errors return JSON:

```json
{ "error": "validation failed", "fields": { "email": "is required" } }
```

## What I'd Do With More Time

- Add pagination on list endpoints and richer filtering/search.
- Add `GET /projects/:id/stats`.
- Add integration tests for auth + task update/delete flows.
- Improve permission model (explicit project membership, roles).
- Add drag-and-drop task status board and dark mode.
