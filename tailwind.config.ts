import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: "var(--surface)",
        "surface-elevated": "var(--surface-elevated)",
        border: "var(--border)",
        muted: "var(--muted)",
        cream: {
          DEFAULT: "var(--cream)",
          50: "#fffdf8",
          100: "#fdf6e3",
          200: "#f0ead8",
          300: "#e4dcc4",
          400: "#cfc4a8",
          500: "#b5a88a",
          600: "#958872",
          700: "#756a58",
          800: "#564e42",
          900: "#3a352c",
          950: "#221f1a",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          muted: "var(--accent-muted)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          foreground: "var(--danger-foreground)",
          border: "var(--danger-border)",
        },
        success: {
          DEFAULT: "var(--success)",
          foreground: "var(--success-foreground)",
          border: "var(--success-border)",
        },
        forest: {
          50: "#eef4ef",
          100: "#d5e4d8",
          200: "#adc9b4",
          300: "#7fa88a",
          400: "#568766",
          500: "#3d6b4f",
          600: "#2f5540",
          700: "#264435",
          800: "#1f362b",
          900: "#182b22",
          950: "#0a1410",
        },
        gold: {
          50: "#f8f3e8",
          100: "#f0e6d0",
          200: "#e2d0a8",
          300: "#d0b67a",
          400: "#c49a5a",
          500: "#b38b4d",
          600: "#a67c2d",
          700: "#8a6424",
          800: "#6b4e1c",
          900: "#3d2e10",
          950: "#241c0a",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "Georgia", "serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        storybook: ["var(--font-storybook)", "var(--font-display)", "Georgia", "serif"],
      },
      letterSpacing: {
        story: "0.04em",
        wide: "0.08em",
      },
      boxShadow: {
        glow: "0 0 24px var(--glow)",
        "glow-lg": "0 0 40px var(--glow-strong)",
        "glow-gold": "0 0 32px rgba(166, 124, 45, 0.25)",
        storybook:
          "0 4px 24px rgba(10, 20, 16, 0.12), 0 0 0 1px rgba(201, 185, 138, 0.2)",
        "storybook-dark":
          "0 4px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(212, 184, 74, 0.1)",
      },
      keyframes: {
        twinkle: {
          "0%, 100%": { opacity: "0.3", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.2)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        twinkle: "twinkle 3s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.45s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
