import type { Config } from "tailwindcss";

const rgb = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: rgb("bg"),
        panel: rgb("panel"),
        raised: rgb("raised"),
        line: rgb("line"),
        ink: rgb("ink"),
        muted: rgb("muted"),
        accent: rgb("accent"),
        "accent-ink": rgb("accent-ink"),
        ok: rgb("ok"),
        warn: rgb("warn"),
        danger: rgb("danger"),
        private: rgb("private"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
} satisfies Config;
