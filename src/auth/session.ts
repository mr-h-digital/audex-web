import type { Session } from "./client";

const KEY = "audex.session.v1";

/** The sign-in is kept on the phone so the app opens straight away, even with no signal. */
export function loadSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null;
    return s && typeof s.token === "string" && s.token && s.user?.id ? s : null;
  } catch { return null; }
}
export function saveSession(s: Session): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }
export function clearSession(): void { try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } }

/** The reset link in the email is <app>/reset-password?token=... ; returns the token, or null when this is not a reset link. */
export function resetTokenFromUrl(loc: { pathname: string; search: string } = window.location): string | null {
  if (loc.pathname.replace(/\/+$/, "") !== "/reset-password") return null;
  const t = new URLSearchParams(loc.search).get("token");
  return t && t.trim() ? t.trim() : null;
}
