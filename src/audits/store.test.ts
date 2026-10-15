import { describe, expect, it } from "vitest";
import { sections } from "../scoring/catalog";
import { syncPending } from "../sync/sync";
import { addTraining } from "./training";
import { finalise, missingNaReasons, newAudit, scoreOf, summarise, upsert, type Answers } from "./store";

const site = { id: "s1", name: "Clinic", unitManager: "A", supervisor: "B" };
const all = (r: "COMPLIANT" | "NON_COMPLIANT"): Answers => Object.fromEntries(sections.flatMap((s) => s.items.map((i) => [i.key, r])));

describe("audits", () => {
  it("copies manager and supervisor from the site", () => {
    const a = newAudit("a1", site, "2026-10-15", "WPC_V1");
    expect([a.unitManager, a.supervisor, a.state]).toEqual(["A", "B", "draft"]);
  });
  it("will not finalise an incomplete audit", () => {
    const a = { ...newAudit("a1", site, "2026-10-15", "WPC_V1"), answers: { [sections[0].items[0].key]: "COMPLIANT" as const } };
    expect(finalise(a, "t").state).toBe("draft");
  });
  it("finalises a full audit with a frozen summary", () => {
    const a = finalise({ ...newAudit("a1", site, "2026-10-15", "WPC_V1"), answers: all("COMPLIANT") }, "2026-10-15T10:00:00Z");
    expect(a.state).toBe("final");
    expect(a.summary).toMatchObject({ percent: 100, status: "COMPLIANT", siteId: "s1" });
    expect(a.synced).toBe(false);
  });
  it("counts a critical non-compliance as non-compliant", () => {
    const a = { ...newAudit("a2", site, "2026-10-15", "WPC_V1"), answers: all("NON_COMPLIANT") };
    expect(scoreOf(a).status).toBe("NON_COMPLIANT");
    expect(summarise(a).failedItems.length).toBeGreaterThan(200);
  });
  it("upsert replaces by id", () => {
    const a = newAudit("a1", site, "2026-10-15", "WPC_V1");
    expect(upsert(upsert([], a), { ...a, unitManager: "Z" })).toHaveLength(1);
  });
});

describe("N/A reasons", () => {
  const key = sections[0].items[0].key;
  const full = { ...all("COMPLIANT"), [key]: "NA" as const };
  it("blocks finalising until each N/A has a reason", () => {
    const a = { ...newAudit("n1", site, "2026-10-15", "WPC_V1"), answers: full };
    expect(missingNaReasons(a)).toEqual([key]);
    expect(finalise(a, "t").state).toBe("draft");
    expect(finalise({ ...a, naReasons: { [key]: "  " } }, "t").state).toBe("draft");
    expect(finalise({ ...a, naReasons: { [key]: "No sluice on this site" } }, "t").state).toBe("final");
  });
});

describe("sync", () => {
  const fin = finalise({ ...newAudit("a1", site, "2026-10-15", "WPC_V1"), answers: all("COMPLIANT") }, "t");
  const draft = newAudit("a2", site, "2026-10-15", "WPC_V1");
  it("does nothing without an API url", async () => {
    expect(await syncPending([fin], "", async () => ({ ok: true }))).toEqual([]);
  });
  it("sends only finalised, unsynced audits, by id", async () => {
    const urls: string[] = [];
    const done = await syncPending([fin, draft, { ...fin, id: "a3", synced: true }], "https://x", async (u) => { urls.push(u); return { ok: true }; });
    expect(urls).toEqual(["https://x/api/audits/a1"]);
    expect(done).toEqual(["a1"]);
  });
  it("keeps audits queued when the server errors or the network drops", async () => {
    expect(await syncPending([fin], "https://x", async () => ({ ok: false }))).toEqual([]);
    expect(await syncPending([fin], "https://x", async () => { throw new Error("offline"); })).toEqual([]);
  });
});

describe("training", () => {
  it("needs site, date and topic", () => {
    expect(addTraining([], { siteId: "s1", date: "2026-10-01", topic: " Chemicals " }, "t1")[0].topic).toBe("Chemicals");
    expect(addTraining([], { siteId: "", date: "2026-10-01", topic: "x" }, "t1")).toEqual([]);
  });
});
