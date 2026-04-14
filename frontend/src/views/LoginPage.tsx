import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch, ApiError } from "../api/client";
import { useAuth, User } from "../state/auth";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { FieldError, Label, TextInput } from "../ui/Input";

export function LoginPage() {
  const { setAuth } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length > 0;
  }, [email, password]);

  return (
    <div className="min-h-dvh bg-[radial-gradient(1200px_circle_at_50%_-10%,hsl(var(--accent)/0.12),transparent_55%),radial-gradient(800px_circle_at_100%_0%,hsl(280_70%_60%/0.08),transparent_45%)]">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-accent-foreground shadow-soft">
            TF
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Welcome back</h1>
          <p className="mt-2 text-sm text-fg-muted">Sign in to manage your projects and tasks.</p>
        </div>

        <Card>
          <div className="mb-5">
            <h2 className="text-base font-semibold text-fg">Login</h2>
            <p className="mt-1 text-sm text-fg-muted">Use your email and password.</p>
          </div>

          {error ? (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          ) : null}

          <div className="space-y-4">
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
                autoComplete="current-password"
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
              const e = email.trim().toLowerCase();
              if (!e) fe.email = "Email is required";
              else if (!e.includes("@")) fe.email = "Enter a valid email";
              if (!password) fe.password = "Password is required";
              setFieldErrors(fe);
              if (Object.keys(fe).length) return;

              setLoading(true);
              try {
                const resp = await apiFetch<{ token: string; user: User }>("/auth/login", {
                  method: "POST",
                  body: JSON.stringify({ email: e, password })
                });
                setAuth(resp.token, resp.user);
                nav(loc.state?.from ?? "/projects");
              } catch (err) {
                const ae = err as ApiError;
                setError(ae.error ?? "Login failed");
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>

          <p className="mt-5 text-center text-sm text-fg-muted">
            No account?{" "}
            <Link to="/register" className="font-medium text-accent underline-offset-2 hover:underline">
              Create one
            </Link>
          </p>
        </Card>

        <p className="mt-6 text-center text-xs text-fg-subtle">
          Tip: seed user is <span className="font-mono text-fg-muted">test@example.com</span>
        </p>
      </div>
    </div>
  );
}
