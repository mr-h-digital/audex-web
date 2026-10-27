import { useCallback, useEffect, useRef, useState } from "react";
import type { TourStatus } from "../auth/client";
import type { Auth } from "../auth/useAuth";
import { isTourStatus } from "./catalog";

export interface CachedPreference { status: TourStatus; pending: boolean }
export function parsePreference(raw: string | null): CachedPreference | null {
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || !("status" in value) || !isTourStatus(value.status)
    || !("pending" in value) || typeof value.pending !== "boolean" || (value.status === "NEW" && value.pending)) {
    throw new Error("The saved tour preference is invalid. Retry to load it from your account.");
  }
  return { status: value.status, pending: value.pending };
}

export function useTourPreference(auth: Auth) {
  const key = `audex.tour.v1.${auth.user?.id ?? "local-only"}`;
  const [status, setStatus] = useState<TourStatus | null>(null);
  const [error, setError] = useState("");
  const pending = useRef<CachedPreference | null>(null);
  const alive = useRef(true);
  const request = useRef(0);
  const cache = useCallback((value: CachedPreference) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { setError("Your browser could not save the tour preference. It may ask again on this device."); return false; }
  }, [key]);

  const refresh = useCallback(async () => {
    if (!auth.user) return;
    const version = ++request.current;
    try {
      const queued = pending.current;
      const result = queued && queued.status !== "NEW"
        ? await auth.api.saveTour(queued.status) : await auth.api.tour();
      if (!alive.current || version !== request.current) return;
      if (!isTourStatus(result?.status)) throw new Error("The server returned an invalid tour preference.");
      pending.current = null;
      setStatus(result.status); setError("");
      cache({ status: result.status, pending: false });
    } catch (e) {
      if (alive.current && version === request.current) setError(`Tour preference could not sync. ${e instanceof Error ? e.message : "Please try again."}`);
    }
  }, [auth.api, auth.user?.id, cache]);

  useEffect(() => {
    alive.current = true;
    try {
      const saved = parsePreference(localStorage.getItem(key));
      pending.current = saved?.pending ? saved : null;
      setStatus(auth.user && saved?.status === "NEW" ? null : saved?.status ?? (auth.user ? null : "NEW"));
    } catch {
      setStatus(auth.user ? null : "NEW");
      setError("The saved tour preference could not be read. Take a guide from Help or retry to load it from your account.");
    }
    void refresh();
    const online = () => { void refresh(); };
    window.addEventListener("online", online);
    return () => { alive.current = false; request.current++; window.removeEventListener("online", online); };
  }, [key, refresh]);

  const save = (next: Exclude<TourStatus, "NEW">) => {
    const value: CachedPreference = { status: status === "COMPLETED" ? "COMPLETED" : next, pending: !!auth.user };
    request.current++;
    pending.current = value.pending ? value : null;
    setStatus(value.status); setError("");
    cache(value);
    void refresh();
  };
  return { status, error, save, retry: refresh };
}
