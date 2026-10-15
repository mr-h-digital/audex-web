import { describe, expect, it, beforeEach, vi } from "vitest";
import { ApiError, createAuthApi, type Fetch } from "./client";
import { newPasswordProblem, passwordChecks } from "./password";
import { clearSession, loadSession, resetTokenFromUrl, saveSession } from "./session";
import { syncPending } from "../sync/sync";
import type { SavedAudit } from "../audits/store";

const reply = (status: number, body?: unknown) => ({ ok: status < 400, status, json: async () => { if (body === undefined) throw new Error("no body"); return body; } });
const me = { id: "u1", username: "chernay", displayName: "Chernay", email: "c@x.co.za", phone: null };

describe("auth client", () => {
  it("sends credentials as JSON and returns the session", async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const f: Fetch = async (url, init) => { seen = { url, init }; return reply(200, { token: "t", expiresAt: "x", user: me }); };
    const s = await createAuthApi("https://api", f).login("chernay", "pw");
    expect(s.token).toBe("t");
    expect(seen!.url).toBe("https://api/api/auth/login");
    expect(JSON.parse(seen!.init!.body as string)).toEqual({ username: "chernay", password: "pw" });
  });
  it("attaches the bearer token only on calls that need it", async () => {
    const heads: Record<string, string>[] = [];
    const f: Fetch = async (_u, init) => { heads.push(init!.headers as Record<string, string>); return reply(200, me); };
    const api = createAuthApi("", f, () => "abc");
    await api.me(); await api.login("a", "b");
    expect(heads[0].Authorization).toBe("Bearer abc");
    expect(heads[1].Authorization).toBeUndefined();
  });
  it("uses the server's plain message for errors", async () => {
    const api = createAuthApi("", async () => reply(401, { message: "Username or password is incorrect." }));
    await expect(api.login("a", "b")).rejects.toMatchObject({ status: 401, message: "Username or password is incorrect." });
  });
  it("falls back to a friendly message when the server sends none", async () => {
    const api = createAuthApi("", async () => reply(429));
    await expect(api.login("a", "b")).rejects.toThrow(/Too many attempts/);
    const api2 = createAuthApi("", async () => reply(500));
    await expect(api2.login("a", "b")).rejects.toThrow(/Something went wrong/);
  });
  it("reports an unreachable server as offline, not as a wrong password", async () => {
    const api = createAuthApi("", async () => { throw new TypeError("Failed to fetch"); });
    const e = (await api.login("a", "b").catch((x) => x)) as ApiError;
    expect(e.offline).toBe(true);
    expect(e.message).toMatch(/internet connection/);
  });
  it("handles 204 responses", async () => {
    await expect(createAuthApi("", async () => reply(204), () => "t").logout()).resolves.toBeNull();
  });
});

describe("password hints", () => {
  it("requires 10 characters and matching entries", () => {
    expect(newPasswordProblem("short", "short")).toMatch(/at least 10/);
    expect(newPasswordProblem("a long enough one", "a long enough two")).toMatch(/not the same/);
    expect(newPasswordProblem("a long enough one", "a long enough one")).toBeNull();
    expect(newPasswordProblem("x".repeat(129), "x".repeat(129))).toMatch(/too long/);
  });
  it("live checks update as you type", () => {
    expect(passwordChecks("").every((c) => !c.ok)).toBe(true);
    expect(passwordChecks("blue kettle morning").every((c) => c.ok)).toBe(true);
    expect(passwordChecks("aaaaaaaaaaaa")[1].ok).toBe(false);
  });
});

describe("saved session", () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
  });
  it("round-trips and clears", () => {
    expect(loadSession()).toBeNull();
    saveSession({ token: "t", expiresAt: "x", user: me });
    expect(loadSession()?.user.username).toBe("chernay");
    clearSession();
    expect(loadSession()).toBeNull();
  });
  it("ignores damaged data", () => {
    localStorage.setItem("audex.session.v1", "{nope");
    expect(loadSession()).toBeNull();
    localStorage.setItem("audex.session.v1", JSON.stringify({ token: "", user: me }));
    expect(loadSession()).toBeNull();
  });
});

describe("reset link", () => {
  it("reads the token from /reset-password", () => {
    expect(resetTokenFromUrl({ pathname: "/reset-password", search: "?token=abc123" })).toBe("abc123");
    expect(resetTokenFromUrl({ pathname: "/reset-password/", search: "?token=abc123" })).toBe("abc123");
  });
  it("ignores other pages and empty tokens", () => {
    expect(resetTokenFromUrl({ pathname: "/", search: "?token=abc" })).toBeNull();
    expect(resetTokenFromUrl({ pathname: "/reset-password", search: "" })).toBeNull();
    expect(resetTokenFromUrl({ pathname: "/reset-password", search: "?token=  " })).toBeNull();
  });
});

describe("sync stops when signed out", () => {
  const audit = (id: string) => ({ id, state: "final", synced: false } as unknown as SavedAudit);
  it("does not keep hammering the server after a 401", async () => {
    let calls = 0;
    const done = await syncPending([audit("a"), audit("b")], "https://api", async () => { calls++; return { ok: false, status: 401 }; });
    expect(done).toEqual([]);
    expect(calls).toBe(1);
  });
});
