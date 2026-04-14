import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi, ApiError } from "../api/client";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Label, TextArea, TextInput } from "../ui/Input";
import { Spinner } from "../ui/Spinner";

type Project = {
  id: string;
  name: string;
  description?: string | null;
  owner_id: string;
  created_at: string;
};

export function ProjectsPage() {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<{ projects: Project[] }>("/projects")
  });

  const projects = Array.isArray(q.data?.projects) ? q.data.projects : [];

  const create = useMutation({
    mutationFn: () =>
      api.post<Project>("/projects", {
        name: name.trim(),
        description: description.trim() ? description.trim() : null
      }),
    onSuccess: async () => {
      setName("");
      setDescription("");
      setFormError(null);
      await qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: unknown) => {
      const ae = e as ApiError;
      setFormError(ae.error ?? "Could not create project");
    }
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">Projects</h1>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted sm:text-base">
          Everything you can access—owned projects and any project where you create or are assigned a
          task.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <h2 className="text-base font-semibold text-fg">New project</h2>
          <p className="mt-1 text-sm text-fg-muted">Give it a clear name. Description is optional.</p>
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="proj-name">Name</Label>
              <TextInput
                id="proj-name"
                placeholder="e.g. Website redesign"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="proj-desc">Description</Label>
              <TextArea
                id="proj-desc"
                placeholder="Optional context for your team"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {formError ? <Alert>{formError}</Alert> : null}
            <Button
              className="w-full sm:w-auto"
              disabled={create.isPending || !name.trim()}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Creating…" : "Create project"}
            </Button>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-3">
          {q.isLoading ? (
            <Card className="flex items-center justify-center py-14">
              <Spinner label="Loading projects…" />
            </Card>
          ) : null}

          {q.isError ? (
            <Alert>We couldn’t load your projects. Check that the API is running and try again.</Alert>
          ) : null}

          {!q.isLoading && !q.isError && projects.length === 0 ? (
            <Card className="border-dashed text-center">
              <p className="text-sm font-medium text-fg">No projects yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">
                Create a project on the left to start adding tasks and tracking status.
              </p>
            </Card>
          ) : null}

          <ul className="grid gap-3 sm:grid-cols-1">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/projects/${p.id}`}
                  className="group block rounded-2xl border border-border bg-surface-elevated p-4 shadow-soft transition hover:border-accent/35 hover:shadow-md sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-fg group-hover:text-accent">
                          {p.name}
                        </h3>
                      </div>
                      {p.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{p.description}</p>
                      ) : (
                        <p className="mt-1 text-sm italic text-fg-subtle">No description</p>
                      )}
                      <p className="mt-3 text-xs text-fg-subtle">
                        Created{" "}
                        <time dateTime={p.created_at}>
                          {new Date(p.created_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric"
                          })}
                        </time>
                      </p>
                    </div>
                    <span className="hidden text-sm font-medium text-accent sm:inline">Open →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
