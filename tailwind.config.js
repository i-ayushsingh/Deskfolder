/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // Fluent Dark palette — Windows 11 Mica/Acrylic inspired.
      // Backgrounds use deep translucent slate, accents use fluent blue/violet.
      colors: {
        fluent: {
          // Surface tokens
          bg: "#1f1f1f",            // App background (Mica base)
          "bg-alt": "#292929",      // Alt surface (cards)
          "bg-elevated": "#323232", // Elevated surface (dialogs)
          stroke: "#404040",        // Hairline borders
          "stroke-subtle": "#2e2e2e",
          // Text
          "text-primary": "#ffffff",
          "text-secondary": "#e6e6e6",
          "text-tertiary": "#a0a0a0",
          "text-disabled": "#5f5f5f",
          // Accent (Fluent System Blue)
          accent: "#60cdff",
          "accent-hover": "#78d6ff",
          "accent-pressed": "#4cc4ff",
          "accent-bg": "rgba(96, 205, 255, 0.12)",
          // Status
          success: "#6ccb5f",
          warning: "#fce100",
          danger: "#ff99a4",
        },
      },
      fontFamily: {
        // Windows 11 uses "Segoe UI Variable" on modern installs; fall back gracefully.
        fluent: ['"Segoe UI Variable"', '"Segoe UI"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        fluent: "7px",         // Default WinUI3 control radius
        "fluent-lg": "14px",   // Card radius
        "fluent-xl": "28px",   // Overlay radius
      },
      boxShadow: {
        fluent: "0 2px 8px rgba(0, 0, 0, 0.34)",
        "fluent-lg": "0 16px 48px rgba(0, 0, 0, 0.55)",
        "fluent-overlay": "0 24px 64px rgba(0, 0, 0, 0.65), 0 2px 8px rgba(0, 0, 0, 0.4)",
      },
      backdropBlur: {
        fluent: "30px",
      },
      transitionTimingFunction: {
        fluent: "cubic-bezier(0.1, 0.9, 0.2, 1)", // WinUI3 "decelerate" easing
      },
    },
  },
  plugins: [],
};
