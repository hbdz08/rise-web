"use client";

import { useEffect, useMemo, useState } from "react";
import { Switch } from "@douyinfe/semi-ui-19";
import { IconMoon, IconSun } from "@douyinfe/semi-icons";

import {
  applyThemeModeToDocument,
  resolvePreferredTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from "@/lib/theme";

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    return resolvePreferredTheme(saved, prefersDark);
  });

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    applyThemeModeToDocument(mode, document);
  }, [mode]);

  const checked = useMemo(() => mode === "dark", [mode]);

  return (
    <Switch
      checked={checked}
      checkedText={<IconMoon />}
      uncheckedText={<IconSun />}
      onChange={(v) => setMode(v ? "dark" : "light")}
      aria-label="Toggle theme"
    />
  );
}
