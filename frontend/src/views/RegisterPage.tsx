import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, ApiError } from "../api/client";
import { useAuth, User } from "../state/auth";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { FieldError, Label, TextInput } from "../ui/Input";

export function RegisterPage() {
  const { setAuth } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const canSubmit = useMemo(() => {
    return name.trim().length > 0 && email.trim().length > 0 && password.length > 0;
  }, [name, email, password]);

  return (
    <div className="min-h-dvh bg-[radial-gradient(1200px_circle_at_50%_-10%,hsl(var(--accent)/0.12),transparent_55%),radial-gradient(800px_circle_at_0%_0%,hsl(190_80%_45%/0.10),transparent_45%)]">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-accent-foreground shadow-soft">
            TF
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Create your account</h1>
          <p className="mt-2 text-sm text-fg-muted">Start organizing work in projects and tasks.</p>
        </div>

        <Card>
          <div className="mb-5">
            <h2 className="text-base font-semibold text-fg">Register</h2>
            <p className="mt-1 text-sm text-fg-muted">Password must be at least 8 characters.</p>
          </div>

          {error ? (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          ) : null}

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <TextInput
                id="name"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFieldErrors((f) => {
                    const n = { ...f };
                    delete n.name;
                    return n;
                  });
                }}
              />
              <FieldError>{fieldErrors.name}</FieldError>
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <TextInput
                id="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors((f) => {
                    const n = { ...f };
                    delete n.email;
                    return n;
                  });
                }}
              />
              <FieldError>{fieldErrors.email}</FieldError>
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <TextInput
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors((f) => {
                    const n = { ...f };
                    delete n.password;
                    return n;
                  });
                }}
              />
              <FieldError>{fieldErrors.password}</FieldError>
            </div>
          </div>

          <Button
            className="mt-6 w-full"
            disabled={loading || !canSubmit}
            onClick={async () => {
              setError(null);
              const fe: Record<string, string> = {};
              const n = name.trim();
              const e = email.trim().toLowerCase();
              if (!n) fe.name = "Name is required";
              if (!e) fe.email = "Email is required";
              else if (!e.includes("@")) fe.email = "Enter a valid email";
              if (!password) fe.password = "Password is required";
              else if (password.length < 8) fe.password = "Use at least 8 characters";
              setFieldErrors(fe);
              if (Object.keys(fe).length) return;

              setLoading(true);
              try {
                const resp = await apiFetch<{ token: string; user: User }>("/auth/register", {
                  method: "POST",
                  body: JSON.stringify({ name: n, email: e, password })
                });
                setAuth(resp.token, resp.user);
                nav("/projects");
              } catch (err) {
                const ae = err as ApiError;
                if (ae.fields) {
                  const mapped: Record<string, string> = {};
                  for (const [k, v] of Object.entries(ae.fields)) mapped[k] = v;
                  setFieldErrors((prev) => ({ ...prev, ...mapped }));
                  setError("Fix the highlighted fields and try again.");
                } else {
                  setError(ae.error ?? "Registration failed");
                }
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? "Creating account…" : "Create account"}
          </Button>

          <p className="mt-5 text-center text-sm text-fg-muted">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-accent underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
