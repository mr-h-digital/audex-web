import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "./accountStore";
import { hasLegacyRecords, importLegacy } from "./legacy";

describe("legacy ownership migration", () => {
  beforeEach(() => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    });
  });
  it("never loads unassigned records automatically and imports only on explicit action", async () => {
    localStorage.setItem("audex.sites.v1", JSON.stringify([{ id: "legacy", name: "Old clinic", archived: false }]));
    const s = new AccountStore("legacy-test-owner"); await s.load();
    expect(hasLegacyRecords()).toBe(true);
    expect(s.data.sites).toEqual([]);
    await importLegacy(s);
    expect(s.data.sites[0]).toMatchObject({ id: "legacy", revision: 0, dirty: true });
    expect(localStorage.getItem("audex.sites.v1")).toContain("Old clinic");
    expect(hasLegacyRecords()).toBe(false);
    const other = new AccountStore("legacy-test-other"); await other.load();
    await importLegacy(other);
    expect(other.data.sites).toEqual([]);
  });
});
