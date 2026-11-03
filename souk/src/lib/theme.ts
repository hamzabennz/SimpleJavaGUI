import type { Settings } from "./settings";

/** Compile theme tokens into CSS variables (no rebuild needed when a merchant changes them). */
export function themeToCss(theme: Settings["theme"]): string {
  const c = theme.colors;
  const vars: Record<string, string> = {
    "--c-primary": c.primary,
    "--c-primary-text": c.primaryText,
    "--c-accent": c.accent,
    "--c-bg": c.background,
    "--c-surface": c.surface,
    "--c-text": c.text,
    "--c-muted": c.muted,
    "--c-border": c.border,
    "--c-danger": c.danger,
    "--c-success": c.success,
    "--radius": `${theme.radius}px`,
    "--btn-radius": theme.buttonStyle === "pill" ? "999px" : `${theme.radius}px`,
    "--font": `"${theme.fontAr}", "${theme.fontLatin}", system-ui, sans-serif`,
    "--grid-cols": String(theme.gridColumns),
  };
  return `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")}}`;
}

export function googleFontsHref(theme: Settings["theme"]) {
  const fams = Array.from(new Set([theme.fontAr, theme.fontLatin]))
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${fams}&display=swap`;
}

export const themePresets: Record<string, Partial<Settings["theme"]["colors"]>> = {
  classic: { primary: "#0f766e", accent: "#f59e0b", background: "#f8fafc" },
  midnight: { primary: "#6366f1", accent: "#f472b6", background: "#0b1020", surface: "#141a2e", text: "#e5e7eb", muted: "#94a3b8", border: "#25304d" },
  sahara: { primary: "#b45309", accent: "#065f46", background: "#fffbeb", surface: "#ffffff", text: "#292524" },
  rose: { primary: "#be185d", accent: "#0ea5e9", background: "#fff1f2" },
};
