import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Auth } from "../auth/useAuth";
import { loadSession } from "../auth/session";
import { API_URL } from "../sync/sync";
import { canEdit, verifyLease, type Entitlement, type Lease } from "./entitlement";
import { ApiError } from "../auth/client";

export const BILLING_REQUIRED = import.meta.env.VITE_BILLING_REQUIRED === "true";
const PUBLIC_KEY = import.meta.env.VITE_ENTITLEMENT_PUBLIC_KEY ?? "";
interface Status { enabled: boolean; lease?: Lease; testMode?: boolean; checkoutEnabled?: boolean; subscriptions?: { code: string; cancel_requested: boolean }[] }
interface Billing {
  legacy: boolean; writable: boolean; access: Entitlement | null; error: string; loading: boolean;
  testMode: boolean; checkoutEnabled: boolean; subscriptions: NonNullable<Status["subscriptions"]>;
  permit(): boolean; refresh(): Promise<void>; request<T>(path: string, body?: unknown): Promise<T>;
}
const Context = createContext<Billing | null>(null);
export function BillingProvider({ auth, children }: { auth: Auth; children: ReactNode }) {
  const account = auth.user?.id ?? "local-only";
  const key = `audex.entitlement.v1.${account}`;
  const [access, setAccess] = useState<Entitlement | null>(null);
  const [legacy, setLegacy] = useState(!auth.enabled && !BILLING_REQUIRED);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(auth.enabled);
  const [status, setStatus] = useState<Status>({ enabled: true });
  const [, tick] = useState(0);
  const lastSeen = useRef(0);
  const live = useRef(true);
  const returnedFromCheckout = useRef(new URLSearchParams(window.location.search).get("billing") === "return");
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  const request = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const token = loadSession()?.token;
    const response = await auth.authFetch(`${API_URL}/api/billing${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!live.current || loadSession()?.token !== token || loadSession()?.user.id !== account) throw new Error("Sign-in changed. Billing request was stopped.");
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      throw new ApiError(response.status, data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message : `Billing request failed (${response.status}). Please retry.`);
    }
    return response.json() as Promise<T>;
  }, [auth.authFetch, account]);
  const refresh = useCallback(async (): Promise<void> => {
    if (!auth.enabled) return;
    setLoading(true);
    try {
      const result = await request<Status>("");
      if (result.enabled && result.checkoutEnabled && returnedFromCheckout.current) {
        returnedFromCheckout.current = false;
        await request("/refresh", {});
        const nextUrl = new URL(window.location.href); nextUrl.searchParams.delete("billing");
        history.replaceState(null, "", nextUrl.pathname + nextUrl.search + nextUrl.hash);
        await refresh();
        return;
      }
      if (!result.enabled) {
        if (BILLING_REQUIRED) throw new Error("Subscriptions are not enabled on the server. Editing is paused until configuration is complete.");
        setLegacy(true); setAccess(null);
      } else {
        setLegacy(false);
        if (!result.lease) throw new Error("The server did not return an offline entitlement.");
        const verified = await verifyLease(result.lease, account, PUBLIC_KEY);
        if (!live.current) return;
        setAccess(verified);
        lastSeen.current = Math.max(Date.parse(verified.issuedAt), Date.now());
        localStorage.setItem(key, JSON.stringify({ lease: result.lease, lastSeen: lastSeen.current }));
      }
      if (live.current) { setStatus(result); setError(""); }
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : "Billing could not be refreshed. Connect and retry.");
    } finally { if (live.current) setLoading(false); }
  }, [request, account, key, auth.enabled]);
  useEffect(() => {
    let current = true;
    // Load and verify the cached lease before refreshing; never cache a free-access boolean.
    const start = async () => {
      try {
        const saved: { lease: Lease; lastSeen: number } | null = JSON.parse(localStorage.getItem(key) ?? "null");
        if (saved) {
          const a = await verifyLease(saved.lease, account, PUBLIC_KEY);
          if (current) { lastSeen.current = Number.isFinite(saved.lastSeen) ? saved.lastSeen : Date.now(); setAccess(a); }
        }
      } catch (e) { if (current) setError(e instanceof Error ? e.message : "Cached billing details could not be read."); }
      if (current) await refresh();
    };
    void start();
    const again = () => void refresh();
    const timer = window.setInterval(again, 300_000);
    window.addEventListener("online", again); window.addEventListener("focus", again);
    return () => { current = false; clearInterval(timer); window.removeEventListener("online", again); window.removeEventListener("focus", again); };
  }, [account, key, refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      lastSeen.current = Math.max(lastSeen.current, Date.now());
      try {
        const saved = localStorage.getItem(key);
        if (saved) localStorage.setItem(key, JSON.stringify({ ...JSON.parse(saved), lastSeen: lastSeen.current }));
      } catch { setError("Billing cache could not be saved. Keep the app open and reconnect before working offline."); }
      tick((n) => n + 1);
    }, 15_000);
    return () => clearInterval(timer);
  }, [key]);
  const writable = legacy || canEdit(access, Date.now(), lastSeen.current);
  const permit = () => {
    if (legacy || canEdit(access, Date.now(), lastSeen.current)) return true;
    setError("Editing is paused. Verify your email, renew your subscription or reconnect to refresh access. Existing records and drafts have been kept.");
    return false;
  };
  return <Context.Provider value={{ legacy, writable, access, error, loading, permit, refresh, request,
    testMode: !!status.testMode, checkoutEnabled: !!status.checkoutEnabled, subscriptions: status.subscriptions ?? [] }}>{children}</Context.Provider>;
}
export function useBilling(): Billing {
  const billing = useContext(Context);
  if (!billing) throw new Error("Billing provider is missing.");
  return billing;
}
