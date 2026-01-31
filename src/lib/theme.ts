export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "rise.themeMode";

export function normalizeThemeMode(value: unknown): ThemeMode | null {
  if (value === "light" || value === "dark") return value;
  return null;
}

export function resolvePreferredTheme(saved: unknown, prefersDark: boolean): ThemeMode {
  return normalizeThemeMode(saved) ?? (prefersDark ? "dark" : "light");
}

export function applyThemeModeToDocument(mode: ThemeMode, doc: Document): void {
  doc.body?.setAttribute("theme-mode", mode);
}

