/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          muted: "hsl(var(--surface-muted) / <alpha-value>)",
          elevated: "hsl(var(--surface-elevated) / <alpha-value>)"
        },
        border: {
          DEFAULT: "hsl(var(--border) / <alpha-value>)"
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-fg) / <alpha-value>)"
        },
        danger: {
          DEFAULT: "hsl(var(--danger) / <alpha-value>)",
          foreground: "hsl(var(--danger-fg) / <alpha-value>)"
        },
        fg: {
          DEFAULT: "hsl(var(--fg) / <alpha-value>)",
          muted: "hsl(var(--fg-muted) / <alpha-value>)",
          subtle: "hsl(var(--fg-subtle) / <alpha-value>)"
        }
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 1px 2px hsl(220 15% 8% / 0.06), 0 8px 24px hsl(220 15% 8% / 0.08)"
      }
    }
  },
  plugins: []
};
