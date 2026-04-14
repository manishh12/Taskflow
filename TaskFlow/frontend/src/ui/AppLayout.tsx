import React from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth";
import { useTheme } from "../state/theme";
import { Button } from "./Button";

function SunIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 2v2m0 16v2M4 12H2m20 0h-2M5 5 3.6 3.6M20.4 20.4 19 19M19 5l1.4-1.4M3.6 20.4 5 19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M21 13.2A8.5 8.5 0 0 1 10.8 3a7 7 0 1 0 10.2 10.2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();

  return (
    <div className="flex min-h-dvh flex-col overflow-hidden">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-surface-elevated/90 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            to="/projects"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-fg no-underline"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-foreground shadow-sm">
              TF
            </span>
            <span className="hidden sm:inline">TaskFlow</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden max-w-[160px] truncate text-right text-sm text-fg-muted sm:block sm:max-w-[240px]">
              <div className="truncate font-medium text-fg">{user?.name}</div>
              <div className="truncate text-xs text-fg-subtle">{user?.email}</div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={toggle}
            >
              {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
              <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => {
                logout();
                nav("/login");
              }}
            >
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
