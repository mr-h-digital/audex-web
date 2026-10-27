import { describe, expect, it } from "vitest";
import { createAuthApi, type Fetch } from "../auth/client";
import { canChangeRole, canManage, type AccountRole, type AdminUser } from "./types";

const user = (role: AccountRole, id = "target", disabled = false): AdminUser => ({
  id, username: "auditor", displayName: "Auditor", email: "auditor@example.test",
  role, disabled, emailVerified: true, createdAt: "2026-10-27T00:00:00Z", revision: 3,
});

describe("account administration", () => {
  it("only lets the Owner manage Admins and change roles", () => {
    expect(canManage("actor", "ADMIN", user("AUDITOR"))).toBe(true);
    expect(canManage("actor", "ADMIN", user("AUDITOR", "target", true))).toBe(true);
    expect(canManage("actor", "ADMIN", user("ADMIN"))).toBe(false);
    expect(canChangeRole("actor", "ADMIN", user("AUDITOR"))).toBe(false);
    expect(canChangeRole("actor", "OWNER", user("AUDITOR"))).toBe(true);
    expect(canChangeRole("actor", "OWNER", user("ADMIN"))).toBe(true);
    expect(canChangeRole("actor", "OWNER", user("AUDITOR", "target", true))).toBe(false);
    expect(canChangeRole("actor", "OWNER", user("ADMIN", "target", true))).toBe(true);
  });

  it.each<AccountRole>(["AUDITOR", "ADMIN", "OWNER"])("prevents self-management and Owner modification for %s", (role) => {
    expect(canManage("actor", role, user(role, "actor"))).toBe(false);
    expect(canManage("actor", role, user("OWNER"))).toBe(false);
    expect(canChangeRole("actor", role, user("OWNER"))).toBe(false);
    if (role === "AUDITOR") expect(canManage("actor", role, user("AUDITOR"))).toBe(false);
  });

  it("uses authenticated directory/history requests and password-confirmed PATCH changes", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher: Fetch = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const api = createAuthApi("https://api.example.test", fetcher, () => "fake-admin-session");
    await api.adminAccess();
    await api.adminUsers("name+email@example.test", 25);
    await api.adminEvents(50);
    await api.adminChange("target", { disabled: true, revision: 3, reason: "Access withdrawn", currentPassword: "fake-confirmation" });
    expect(calls[0].url).toBe("https://api.example.test/api/admin/access");
    const query = new URL(calls[1].url).searchParams;
    expect(query.get("search")).toBe("name+email@example.test");
    expect(query.get("offset")).toBe("25");
    expect(query.get("limit")).toBe("25");
    expect(new URL(calls[2].url).searchParams.get("offset")).toBe("50");
    expect(calls[3].init?.method).toBe("PATCH");
    expect(JSON.parse(calls[3].init?.body as string)).toEqual({ disabled: true, revision: 3, reason: "Access withdrawn", currentPassword: "fake-confirmation" });
    expect(calls.every(({ init }) => "Authorization" in (init?.headers ?? {}))).toBe(true);
    expect(calls.every(({ url }) => !url.includes("fake-confirmation"))).toBe(true);
  });
});
