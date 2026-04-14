import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { ApiError, useApi } from "../api/client";
import { useAuth } from "../state/auth";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { FieldError, Label, Select, TextArea, TextInput } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";

type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  project_id: string;
  assignee_id?: string | null;
  due_date?: string | null;
  created_at: string;
  updated_at: string;
  creator_id: string;
};

type UserLite = { id: string; name: string; email: string };

type ProjectDetail = {
  id: string;
  name: string;
  description?: string | null;
  owner_id: string;
  created_at: string;
  tasks: Task[];
};

const STATUSES: Task["status"][] = ["todo", "in_progress", "done"];

const statusLabel: Record<Task["status"], string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done"
};

function DragHandleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DroppableColumn({
  status,
  children
}: {
  status: Task["status"];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <section
      ref={setNodeRef}
      className={`rounded-2xl border border-border bg-surface-muted/60 p-3 sm:p-4 ${
        isOver ? "ring-2 ring-accent/25" : ""
      }`}
    >
      {children}
    </section>
  );
}

function DraggableTaskCard({
  task,
  onOpen,
  children
}: {
  task: Task;
  onOpen: () => void;
  children: (opts: { dragHandle: React.ReactNode; isDragging: boolean }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { taskId: task.id, fromStatus: task.status }
  });

  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? "opacity-70" : ""}`}
      onClick={(e) => {
        if (isDragging) return;
        // Avoid opening when clicking drag handle
        const el = e.target as HTMLElement;
        if (el.closest("[data-drag-handle]")) return;
        onOpen();
      }}
    >
      {children({
        isDragging,
        dragHandle: (
          <button
            type="button"
            data-drag-handle
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-muted hover:text-fg"
            aria-label="Drag task"
            {...listeners}
            {...attributes}
          >
            <DragHandleIcon className="h-4 w-4" />
          </button>
        )
      })}
    </div>
  );
}

function dueInputValue(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw);
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return "";
}

function formatDueDisplay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isOverdue(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return due < today;
}

function TaskModal({
  open,
  mode,
  task,
  projectId,
  currentUserId,
  users,
  onClose,
  onSaved
}: {
  open: boolean;
  mode: "create" | "edit";
  task: Task | null;
  projectId: string;
  currentUserId: string;
  users: UserLite[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const api = useApi();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Task["status"]>("todo");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const overdueWarning = useMemo(() => {
    if (!dueDate) return false;
    // dueDate is date input YYYY-MM-DD
    return isOverdue(dueDate);
  }, [dueDate]);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setFieldErrors({});
    if (mode === "edit" && task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setStatus(task.status);
      setPriority(task.priority);
      setAssigneeId(task.assignee_id ?? "");
      setDueDate(dueInputValue(task.due_date));
    } else {
      setTitle("");
      setDescription("");
      setStatus("todo");
      setPriority("medium");
      setAssigneeId("");
      setDueDate("");
    }
  }, [open, mode, task]);

  const assigneeOptions = useMemo(() => {
    const uniq = new Map<string, UserLite>();
    for (const u of users) uniq.set(u.id, u);
    return Array.from(uniq.values());
  }, [users]);

  const save = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      const fe: Record<string, string> = {};
      if (!t) fe.title = "Title is required";
      if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) fe.due_date = "Use YYYY-MM-DD";
      if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && isOverdue(dueDate)) {
        fe.due_date = "Due date cannot be in the past";
      }
      setFieldErrors(fe);
      if (Object.keys(fe).length) throw new Error("validation");

      const desc = description.trim() ? description.trim() : null;
      if (mode === "create") {
        return api.post<Task>(`/projects/${projectId}/tasks`, {
          title: t,
          description: desc,
          status,
          priority,
          assignee_id: assigneeId.trim() || null,
          due_date: dueDate || null
        });
      }
      if (!task) throw new Error("missing task");
      return api.patch<Task>(`/tasks/${task.id}`, {
        title: t,
        description: desc,
        status,
        priority,
        assignee_id: assigneeId.trim() || null,
        due_date: dueDate || null
      });
    },
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message === "validation") return;
      const ae = e as ApiError;
      if (ae.fields) {
        setFieldErrors(Object.fromEntries(Object.entries(ae.fields)));
        setFormError("Fix the highlighted fields.");
        return;
      }
      setFormError(ae.error ?? "Save failed");
    }
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!task) return;
      return api.del(`/tasks/${task.id}`);
    },
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
    onError: (e: unknown) => {
      const ae = e as ApiError;
      setFormError(ae.error ?? "Delete failed");
    }
  });

  if (!open) return null;

  return (
    <Modal
      title={mode === "create" ? "New task" : "Edit task"}
      onClose={onClose}
      footer={
        <>
          {mode === "edit" && task ? (
            <Button
              variant="danger"
              size="sm"
              disabled={del.isPending || save.isPending}
              onClick={() => {
                if (window.confirm("Delete this task? This can’t be undone.")) del.mutate();
              }}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : mode === "create" ? "Create task" : "Save changes"}
          </Button>
        </>
      }
    >
      {formError ? (
        <div className="mb-4">
          <Alert>{formError}</Alert>
        </div>
      ) : null}
      <div className="space-y-4">
        <div>
          <Label htmlFor="task-title">Title</Label>
          <TextInput id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <FieldError>{fieldErrors.title}</FieldError>
        </div>
        <div>
          <Label htmlFor="task-desc">Description</Label>
          <TextArea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="task-status">Status</Label>
            <Select id="task-status" value={status} onChange={(e) => setStatus(e.target.value as Task["status"])}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="task-prio">Priority</Label>
            <Select
              id="task-prio"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Task["priority"])}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="task-assignee">Assignee</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              id="task-assignee"
              className="sm:flex-1"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {assigneeOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </Select>
            <Button type="button" variant="secondary" size="sm" onClick={() => setAssigneeId(currentUserId)}>
              Me
            </Button>
          </div>
          <FieldError>{fieldErrors.assignee_id}</FieldError>
        </div>
        <div>
          <Label htmlFor="task-due">Due date</Label>
          <TextInput
            id="task-due"
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <FieldError>{fieldErrors.due_date}</FieldError>
          {overdueWarning && status !== "done" ? (
            <p className="mt-1 text-xs text-danger">Due date cannot be in the past.</p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const api = useApi();
  const qc = useQueryClient();
  const [view, setView] = useState<"board" | "list">("board");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterAssignee, setFilterAssignee] = useState<"all" | "me" | "unassigned">("all");
  const [banner, setBanner] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberErr, setMemberErr] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.get<ProjectDetail>(`/projects/${id}`),
    enabled: !!id
  });

  const membersQ = useQuery({
    queryKey: ["project-members", id],
    queryFn: () => api.get<{ members: UserLite[] }>(`/projects/${id}/members`),
    enabled: !!id
  });

  const memberByID = useMemo(() => {
    const m = new Map<string, UserLite>();
    for (const u of membersQ.data?.members ?? []) m.set(u.id, u);
    return m;
  }, [membersQ.data]);

  const addMember = useMutation({
    mutationFn: async () => {
      setMemberErr(null);
      const email = memberEmail.trim().toLowerCase();
      if (!email) {
        setMemberErr("Email is required");
        throw new Error("validation");
      }
      return api.post<UserLite>(`/projects/${id}/members`, { email });
    },
    onSuccess: async () => {
      setMemberEmail("");
      await qc.invalidateQueries({ queryKey: ["project-members", id] });
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message === "validation") return;
      const ae = e as ApiError;
      if (ae.fields?.email) {
        setMemberErr(ae.fields.email);
        return;
      }
      setMemberErr(ae.error ?? "Could not add member");
    }
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => api.del(`/projects/${id}/members/${userId}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["project-members", id] });
    },
    onError: (e: unknown) => {
      const ae = e as ApiError;
      setBanner(ae.error ?? "Could not remove member");
    }
  });

  const updateStatus = useMutation({
    mutationFn: (vars: { taskId: string; status: Task["status"] }) =>
      api.patch<Task>(`/tasks/${vars.taskId}`, { status: vars.status }),
    onMutate: async (vars) => {
      setBanner(null);
      await qc.cancelQueries({ queryKey: ["project", id] });
      const prev = qc.getQueryData<ProjectDetail>(["project", id]);
      if (prev) {
        qc.setQueryData<ProjectDetail>(["project", id], {
          ...prev,
          tasks: (Array.isArray((prev as any).tasks) ? ((prev as any).tasks as Task[]) : []).map((t) =>
            t.id === vars.taskId ? { ...t, status: vars.status } : t
          )
        });
      }
      return { prev };
    },
    onError: (e: unknown, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["project", id], ctx.prev);
      const ae = e as ApiError;
      setBanner(ae.error ?? "Could not update status. Reverted.");
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["project", id] });
    }
  });

  const tasks = useMemo(() => {
    return Array.isArray((q.data as any)?.tasks) ? (((q.data as any).tasks as Task[]) ?? []) : [];
  }, [q.data]);

  const filteredTasks = useMemo(() => {
    const all = tasks;
    let out = all;
    if (filterStatus) out = out.filter((t) => t.status === filterStatus);
    if (filterAssignee === "me" && user?.id) out = out.filter((t) => t.assignee_id === user.id);
    if (filterAssignee === "unassigned") out = out.filter((t) => !t.assignee_id);
    return out;
  }, [tasks, filterStatus, filterAssignee, user?.id]);

  const columns = useMemo(() => {
    const map: Record<Task["status"], Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of filteredTasks) map[t.status].push(t);
    return map;
  }, [filteredTasks]);

  const visibleStatuses = useMemo(() => {
    if (filterStatus === "todo" || filterStatus === "in_progress" || filterStatus === "done") {
      return [filterStatus] as Task["status"][];
    }
    return STATUSES;
  }, [filterStatus]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor));
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  if (q.isLoading) {
    return (
      <Card className="flex items-center justify-center py-16">
        <Spinner label="Loading project…" />
      </Card>
    );
  }

  if (q.isError) {
    return <Alert>We couldn’t load this project. It may not exist or you may not have access.</Alert>;
  }

  if (!q.data || !id || !user) return null;

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link to="/projects" className="font-medium text-accent underline-offset-2 hover:underline">
          Projects
        </Link>
        <span className="mx-2 text-fg-subtle">/</span>
        <span className="text-fg-muted">{q.data.name}</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{q.data.name}</h1>
          {q.data.description ? (
            <p className="mt-2 max-w-2xl text-sm text-fg-muted sm:text-base">{q.data.description}</p>
          ) : (
            <p className="mt-2 text-sm italic text-fg-subtle">No description</p>
          )}
        </div>
        <Button
          className="shrink-0 self-start"
          onClick={() => {
            setModalMode("create");
            setEditingTask(null);
            setModalOpen(true);
          }}
        >
          New task
        </Button>
      </div>

      {banner ? (
        <Alert>
          {banner}
        </Alert>
      ) : null}

      <Card className="py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[160px] flex-1 sm:max-w-xs">
            <Label htmlFor="view">View</Label>
            <Select
              id="view"
              value={view}
              onChange={(e) => setView(e.target.value as "board" | "list")}
            >
              <option value="board">Board</option>
              <option value="list">List</option>
            </Select>
          </div>
          <div className="min-w-[160px] flex-1 sm:max-w-xs">
            <Label htmlFor="filter-status">Status</Label>
            <Select
              id="filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-[160px] flex-1 sm:max-w-xs">
            <Label htmlFor="filter-assignee">Assignee</Label>
            <Select
              id="filter-assignee"
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value as typeof filterAssignee)}
            >
              <option value="all">Everyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </Select>
          </div>
          {((filterStatus && filterStatus !== "") || filterAssignee !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="sm:ml-auto"
              onClick={() => {
                setFilterStatus("");
                setFilterAssignee("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {user.id === q.data.owner_id ? (
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-fg">Project members</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Only project members can be assigned tasks.
              </p>
            </div>
            <div className="w-full sm:max-w-md">
              <Label htmlFor="member-email">Add member by email</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <TextInput
                  id="member-email"
                  placeholder="jane@example.com"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                />
                <Button
                  className="shrink-0"
                  variant="secondary"
                  disabled={addMember.isPending}
                  onClick={() => addMember.mutate()}
                >
                  {addMember.isPending ? "Adding…" : "Add"}
                </Button>
              </div>
              {memberErr ? <p className="mt-1 text-sm text-danger">{memberErr}</p> : null}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {(membersQ.data?.members ?? []).length === 0 ? (
              <p className="text-sm text-fg-muted">No members found.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {(membersQ.data?.members ?? []).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{m.name}</p>
                      <p className="truncate text-xs text-fg-subtle">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.id === q.data.owner_id ? (
                        <Badge tone="done">Owner</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={removeMember.isPending}
                          onClick={() => removeMember.mutate(m.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : null}

      {tasks.length === 0 ? (
        <Card className="border-dashed text-center">
          <p className="text-sm font-medium text-fg">No tasks yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">
            Create your first task with “New task”. You can set priority, due date, and assignee in the
            editor.
          </p>
          <Button className="mt-4" onClick={() => { setModalMode("create"); setEditingTask(null); setModalOpen(true); }}>
            Create task
          </Button>
        </Card>
      ) : filteredTasks.length === 0 ? (
        <Card className="border-dashed text-center">
          <p className="text-sm font-medium text-fg">No tasks match these filters</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">
            Try clearing filters or create a new task to get started.
          </p>
        </Card>
      ) : null}

      {view === "board" ? (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) => {
            const id = String(e.active.id);
            if (id.startsWith("task:")) setActiveTaskId(id.slice("task:".length));
          }}
          onDragEnd={(e: DragEndEvent) => {
            setActiveTaskId(null);
            const active = String(e.active.id);
            const over = e.over?.id ? String(e.over.id) : null;
            if (!active.startsWith("task:") || !over || !over.startsWith("col:")) return;
            const taskId = active.slice("task:".length);
            const status = over.slice("col:".length) as Task["status"];
            const current = tasks.find((t) => t.id === taskId);
            if (!current) return;
            if (current.status === status) return;
            updateStatus.mutate({ taskId, status });
          }}
        >
          <div className={`grid gap-4 md:grid-cols-3 ${tasks.length === 0 ? "hidden" : ""}`}>
            {visibleStatuses.map((col) => (
              <DroppableColumn key={col} status={col}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-fg">{statusLabel[col]}</h2>
                  <span className="rounded-lg bg-surface-elevated px-2 py-0.5 text-xs font-medium text-fg-muted shadow-sm">
                    {columns[col].length}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {columns[col].map((t) => {
                    const due = formatDueDisplay(t.due_date);
                    const overdue = t.status !== "done" && isOverdue(t.due_date);
                    const assignedToMe = !!(t.assignee_id && t.assignee_id === user.id);
                    const isActive = activeTaskId === t.id;
                    return (
                      <li key={t.id}>
                        <DraggableTaskCard
                          task={t}
                          onOpen={() => {
                            setModalMode("edit");
                            setEditingTask(t);
                            setModalOpen(true);
                          }}
                        >
                          {({ dragHandle }) => (
                            <div
                              className={`rounded-xl border border-border bg-surface-elevated p-3 shadow-sm transition hover:shadow-md ${
                                isActive ? "ring-2 ring-accent/20" : ""
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-fg">{t.title}</p>
                                  {t.description ? (
                                    <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{t.description}</p>
                                  ) : null}
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <Badge tone={t.priority}>{t.priority}</Badge>
                                    {assignedToMe ? <Badge tone="done">Assigned to me</Badge> : null}
                                    {overdue ? <Badge tone="overdue">Overdue</Badge> : null}
                                    {due ? (
                                      <Badge tone="todo">Due {due}</Badge>
                                    ) : (
                                      <Badge tone="todo">No due date</Badge>
                                    )}
                                  </div>
                                </div>
                                {dragHandle}
                              </div>
                              <div className="mt-3 border-t border-border/80 pt-3">
                                <Label className="text-xs text-fg-subtle" htmlFor={`st-${t.id}`}>
                                  Quick status
                                </Label>
                                <Select
                                  id={`st-${t.id}`}
                                  value={t.status}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    updateStatus.mutate({
                                      taskId: t.id,
                                      status: e.target.value as Task["status"]
                                    })
                                  }
                                >
                                  {STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {statusLabel[s]}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                            </div>
                          )}
                        </DraggableTaskCard>
                      </li>
                    );
                  })}
                </ul>
              </DroppableColumn>
            ))}
          </div>
        </DndContext>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((t) => {
            const due = formatDueDisplay(t.due_date);
            const overdue = t.status !== "done" && isOverdue(t.due_date);
            const assignee =
              t.assignee_id && memberByID.get(t.assignee_id)
                ? memberByID.get(t.assignee_id)!
                : null;
            return (
              <div
                key={t.id}
                className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-soft sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-fg">{t.title}</p>
                      <Badge tone={t.status}>{statusLabel[t.status]}</Badge>
                      <Badge tone={t.priority}>{t.priority}</Badge>
                      {overdue ? <Badge tone="overdue">Overdue</Badge> : null}
                    </div>
                    {t.description ? <p className="mt-2 text-sm text-fg-muted">{t.description}</p> : null}
                    <p className="mt-2 text-xs text-fg-subtle">
                      {t.assignee_id
                        ? assignee
                          ? `Assignee: ${assignee.name} (${assignee.email})${assignee.id === user.id ? " (you)" : ""}`
                          : "Assignee: (left project)"
                        : "Unassigned"}
                      {due ? ` · Due ${due}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setModalMode("edit");
                        setEditingTask(t);
                        setModalOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Select
                      value={t.status}
                      onChange={(e) =>
                        updateStatus.mutate({ taskId: t.id, status: e.target.value as Task["status"] })
                      }
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel[s]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskModal
        open={modalOpen}
        mode={modalMode}
        task={editingTask}
        projectId={id}
        currentUserId={user.id}
        users={membersQ.data?.members ?? []}
        onClose={() => setModalOpen(false)}
        onSaved={async () => {
          await qc.invalidateQueries({ queryKey: ["project", id] });
          await qc.invalidateQueries({ queryKey: ["projects"] });
          await qc.invalidateQueries({ queryKey: ["project-members", id] });
        }}
      />
    </div>
  );
}
