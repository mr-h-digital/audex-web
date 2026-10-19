import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_URL } from "../sync/sync";
import { createAuthApi, ApiError, type AuthApi, type Me, type Session } from "./client";
import { clearSession, loadSession, saveSession } from "./session";

export type Phase =
  | { name: "off" }                                  // no server configured: nothing to sign in to
  | { name: "loading" }                              // asking the server whether first-time setup is needed
  | { name: "setup" }
  | { name: "signedOut"; notice?: string; offline?: boolean }
  | { name: "in"; user: Me };

export interface Auth {
  enabled: boolean;
  phase: Phase;
  user: Me | null;
  api: AuthApi;
  signIn(s: Session): void;
  /** Ends this phone's sign-in. Audits on the phone are never deleted. */
  signOut(): Promise<void>;
  signOutEverywhere(): Promise<void>;
  setUser(u: Me): void;
  /** fetch with the sign-in attached; a 401 returns the person to the sign-in screen with their data intact. */
  authFetch(url: string, init?: RequestInit): Promise<Response>;
  goToSignIn(notice?: string): void;
}

export const SESSION_ENDED = "You have been signed out. Your audits are safe on this phone and will upload once you sign in again.";

export function useAuth(base: string = API_URL): Auth {
  const enabled = !!base;
  const [phase, setPhase] = useState<Phase>(() => {
    if (!enabled) return { name: "off" };
    const s = loadSession();
    return s ? { name: "in", user: s.user } : { name: "loading" };
  });
  const token = useRef<string | null>(enabled ? loadSession()?.token ?? null : null);
  const api = useMemo(() => createAuthApi(base, (u, i) => fetch(u, i), () => token.current), [base]);

  const expire = useCallback((notice?: string) => {
    token.current = null; clearSession();
    setPhase({ name: "signedOut", notice });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const changed = (event: StorageEvent) => {
      if (event.key !== "audex.session.v1" && event.key !== null) return;
      const session = loadSession();
      token.current = session?.token ?? null;
      setPhase(session ? { name: "in", user: session.user } : { name: "signedOut", notice: SESSION_ENDED });
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [enabled]);

  // No saved sign-in: find out whether this is a brand-new server (setup) or an ordinary one (sign in).
  useEffect(() => {
    if (phase.name !== "loading") return;
    let live = true;
    api.status().then((s) => { if (live) setPhase(s.setupRequired ? { name: "setup" } : { name: "signedOut" }); })
      .catch(() => { if (live) setPhase({ name: "signedOut", offline: true }); });
    return () => { live = false; };
  }, [phase.name, api]);

  // Already signed in: quietly check the sign-in is still good. Offline or a server hiccup changes nothing.
  const checked = useRef(false);
  useEffect(() => {
    if (phase.name !== "in" || checked.current) return;
    checked.current = true;
    const checkingToken = token.current;
    api.me().then((u) => {
      if (token.current !== checkingToken) return;
      const s = loadSession(); if (s) saveSession({ ...s, user: u });
      setPhase({ name: "in", user: u });
    }).catch((e) => { if (token.current === checkingToken && e instanceof ApiError && e.status === 401) expire(SESSION_ENDED); });
  }, [phase.name, api, expire]);

  const signIn = useCallback((s: Session) => {
    token.current = s.token; saveSession(s); checked.current = true;
    setPhase({ name: "in", user: s.user });
  }, []);
  const signOut = useCallback(async () => {
    const logout = api.logout().catch(() => undefined);
    expire(); checked.current = false;
    // Local access and in-flight sync stop immediately, even when logout cannot reach the server.
    await logout;
  }, [api, expire]);
  const signOutEverywhere = useCallback(async () => {
    const signingOutToken = token.current;
    await api.logoutAll(); // errors surface to the caller so the person knows it did not happen
    if (token.current === signingOutToken) { expire(); checked.current = false; }
  }, [api, expire]);
  const setUser = useCallback((u: Me) => {
    const s = loadSession(); if (!s || s.user.id !== u.id) return;
    saveSession({ ...s, user: u });
    setPhase((p) => (p.name === "in" && p.user.id === u.id ? { name: "in", user: u } : p));
  }, []);
  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const requestToken = token.current;
    const headers = { ...(init.headers as Record<string, string> | undefined), ...(token.current ? { Authorization: `Bearer ${token.current}` } : {}) };
    const res = await fetch(url, { ...init, headers });
    if (res.status === 401 && token.current === requestToken) { expire(SESSION_ENDED); checked.current = false; }
    return res;
  }, [expire]);
  const goToSignIn = useCallback((notice?: string) => { token.current = null; clearSession(); checked.current = false; setPhase({ name: "signedOut", notice }); }, []);

  return { enabled, phase, user: phase.name === "in" ? phase.user : null, api, signIn, signOut, signOutEverywhere, setUser, authFetch, goToSignIn };
}
