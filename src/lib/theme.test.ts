import { applyThemeModeToDocument, normalizeThemeMode, resolvePreferredTheme } from "@/lib/theme";

describe("theme", () => {
  it("normalizes theme mode", () => {
    expect(normalizeThemeMode("light")).toBe("light");
    expect(normalizeThemeMode("dark")).toBe("dark");
    expect(normalizeThemeMode("nope")).toBeNull();
  });

  it("resolves preferred theme", () => {
    expect(resolvePreferredTheme("dark", false)).toBe("dark");
    expect(resolvePreferredTheme("light", true)).toBe("light");
    expect(resolvePreferredTheme(null, true)).toBe("dark");
  });

  it("applies theme mode to body attribute", () => {
    document.body.removeAttribute("theme-mode");
    applyThemeModeToDocument("dark", document);
    expect(document.body.getAttribute("theme-mode")).toBe("dark");
  });
});

