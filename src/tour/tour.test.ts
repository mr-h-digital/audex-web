import { describe, expect, it } from "vitest";
import { createAuthApi, type Fetch } from "../auth/client";
import { TOURS, isTourStatus } from "./catalog";
import { parsePreference } from "./useTourPreference";

describe("guided tours", () => {
  it("covers the core workspace without modifying records", () => {
    expect(new Set(TOURS.intro.steps.map((step) => step.page))).toEqual(new Set(["sites", "audit", "dashboard", "settings"]));
    for (const tour of Object.values(TOURS)) {
      expect(tour.steps.length).toBeGreaterThan(0);
      for (const step of tour.steps) {
        expect(step.target).toBeTruthy();
        expect(step.description).toBeTruthy();
        expect(step.tip).toBeTruthy();
      }
    }
    expect(TOURS.audit.steps[0].description).toContain("N/A");
    expect(TOURS.audit.steps[0].tip).toContain("cannot be changed");
    expect(TOURS.intro.steps.find((step) => step.target === "sync")?.tip).toContain("drafts stay on this device");
  });

  it("keeps focused guides available for every workspace page", () => {
    for (const id of ["sites", "audit", "dashboard", "settings"] as const) {
      expect(TOURS[id].steps.every((step) => step.page === id)).toBe(true);
    }
  });

  it("reads account preference caches and rejects invalid or impossible states", () => {
    expect(parsePreference(null)).toBeNull();
    for (const status of ["NEW", "SKIPPED", "COMPLETED"]) {
      expect(parsePreference(JSON.stringify({ status, pending: false }))).toEqual({ status, pending: false });
    }
    expect(parsePreference('{"status":"SKIPPED","pending":true}')?.pending).toBe(true);
    for (const invalid of ["{oops", "null", "[]", "{}", '{"status":"NEW","pending":true}', '{"status":"UNKNOWN","pending":false}', '{"status":"SKIPPED","pending":"yes"}']) {
      expect(() => parsePreference(invalid)).toThrow();
    }
    expect(isTourStatus("COMPLETED")).toBe(true);
    expect(isTourStatus(undefined)).toBe(false);
  });

  it("loads and updates only the current authenticated user's preference", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher: Fetch = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ status: init?.method === "PUT" ? "SKIPPED" : "NEW" }) };
    };
    const api = createAuthApi("https://api.example.test", fetcher, () => "tour-test-session");
    expect(await api.tour()).toEqual({ status: "NEW" });
    expect(await api.saveTour("SKIPPED")).toEqual({ status: "SKIPPED" });
    expect(calls.map((call) => call.url)).toEqual(["https://api.example.test/api/me/tour", "https://api.example.test/api/me/tour"]);
    expect(calls[0].init?.method).toBe("GET");
    expect(calls[1].init?.method).toBe("PUT");
    expect(JSON.parse(calls[1].init?.body as string)).toEqual({ status: "SKIPPED" });
    expect(calls.every((call) => "Authorization" in (call.init?.headers ?? {}))).toBe(true);
  });
});
