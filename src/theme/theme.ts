import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "audex.theme";

export const parseTheme = (v: unknown): Theme => (v === "light" || v === "dark" ? v : "system");

export function readTheme(): Theme {
  try { return parseTheme(localStorage.getItem(KEY)); } catch { return "system"; }
}

/** "system" removes the attribute, so the phone's own light/dark setting decides (see the CSS media query). */
export function applyTheme(t: Theme, root: HTMLElement = document.documentElement): void {
  if (t === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const set = useCallback((t: Theme) => {
    setTheme(t);
    try { localStorage.setItem(KEY, t); } catch { /* storage unavailable: the choice lasts until the app closes */ }
  }, []);
  return [theme, set];
}
