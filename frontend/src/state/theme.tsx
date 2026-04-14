import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

type ThemeState = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeCtx = createContext<ThemeState | null>(null);

const LS_KEY = "taskflow_theme";

function applyThemeToDom(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY) as Theme | null;
      if (saved === "light" || saved === "dark") {
        setThemeState(saved);
        applyThemeToDom(saved);
      } else {
        const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
        const initial: Theme = prefersDark ? "dark" : "light";
        setThemeState(initial);
        applyThemeToDom(initial);
      }
    } finally {
      setHydrated(true);
    }
  }, []);

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      setTheme: (t) => {
        setThemeState(t);
        localStorage.setItem(LS_KEY, t);
        applyThemeToDom(t);
      },
      toggle: () => {
        const next: Theme = theme === "dark" ? "light" : "dark";
        setThemeState(next);
        localStorage.setItem(LS_KEY, next);
        applyThemeToDom(next);
      }
    }),
    [theme]
  );

  if (!hydrated) return <>{children}</>;

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("ThemeProvider missing");
  return v;
}

