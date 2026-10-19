import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { newAudit } from "../audits/store";
import { getAccountPhoto, putAccountPhoto } from "../photos/blobStore";
import { AccountStore } from "./accountStore";
import { loadRemotePhoto, mergeRecords, recordBody, syncAccount, type SyncFetch } from "./twoWay";

const site = { id: "s1", name: "Clinic", address: "", unitManager: "", supervisor: "", archived: false, revision: 0, dirty: true };
let n = 0;
async function store() { const s = new AccountStore(`test-${++n}`); await s.load(); return s; }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const empty = () => json({ items: [], hasMore: false });
describe("account two-way sync", () => {
  it("keeps pending local edits and tombstones when pulling remote records", () => {
    const local = [{ ...site, archived: true }];
    expect(mergeRecords(local, [{ ...site, name: "Remote", dirty: false }], [], "sites")).toEqual(local);
    expect(mergeRecords([{ ...site, dirty: false }], [{ ...site, name: "Remote" }], [{ kind: "sites", id: site.id, body: "{}" }], "sites")[0].name).toBe("Clinic");
    expect(mergeRecords([], [{ ...site, archived: true }], [], "sites")[0].archived).toBe(true);
  });
  it("persists exact request snapshots for retry after a lost response, then sends later edits at the returned revision", async () => {
    const s = await store();
    s.change((d) => ({ ...d, sites: [site] }));
    let original = "";
    await expect(syncAccount(s, "", async (_url, init) => {
      original = init!.body as string;
      s.change((d) => ({ ...d, sites: d.sites.map((x) => ({ ...x, name: "Edited while sending" })) }));
      throw new Error("response lost");
    }, () => true)).rejects.toThrow("response lost");
    await s.persisted();
    const reloaded = new AccountStore(s.account); await reloaded.load();
    const bodies: string[] = [];
    await syncAccount(reloaded, "", async (_url, init) => {
      if (init?.method === "PUT") {
        bodies.push(init.body as string);
        return json({ ...JSON.parse(init.body as string), revision: bodies.length });
      }
      return empty();
    }, () => true);
    expect(bodies[0]).toBe(original);
    expect(JSON.parse(bodies[1])).toMatchObject({ name: "Edited while sending", revision: 1 });
    expect(reloaded.data.sites[0]).toMatchObject({ name: "Edited while sending", revision: 2, dirty: false });
    expect(reloaded.data.queue).toEqual([]);
  });
  it("keeps conflicting changes queued and does not force overwrite or pull over them", async () => {
    const s = await store(); s.change((d) => ({ ...d, sites: [site] }));
    const send = vi.fn(async () => json({}, 409));
    await expect(syncAccount(s, "", send, () => true)).rejects.toThrow(/conflict.*sites\/s1/);
    expect(s.data.sites[0].dirty).toBe(true);
    expect(s.data.queue[0].body).toBe(recordBody(site));
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("does not run concurrent requests for the same store", async () => {
    const s = await store();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const send = vi.fn(async () => { await gate; return empty(); });
    const first = syncAccount(s, "", send, () => true);
    const second = syncAccount(s, "", send, () => true);
    expect(second).toBe(first);
    release(); await first;
    expect(send).toHaveBeenCalledTimes(3);
  });
  it("isolates account records and cached photos", async () => {
    const a = await store(), b = await store();
    a.change((d) => ({ ...d, sites: [site] })); await a.persisted();
    await putAccountPhoto(a.account, "same-id", new Blob(["private"]));
    const reloaded = new AccountStore(a.account); await reloaded.load();
    expect(reloaded.data.sites).toHaveLength(1);
    expect(b.data.sites).toEqual([]);
    expect(await getAccountPhoto(b.account, "same-id")).toBeUndefined();
  });
  it("stops applying responses when the account/sign-in changes in flight", async () => {
    const s = await store(); s.change((d) => ({ ...d, sites: [site] }));
    let current = true;
    await expect(syncAccount(s, "", async () => { current = false; return json({ ...site, revision: 1 }); }, () => current)).rejects.toThrow(/Sign-in changed/);
    expect(s.data.sites[0].revision).toBe(0);
    expect(s.data.queue).toHaveLength(1);
  });
  it("keeps a request queued on expired credentials and does not continue to other endpoints", async () => {
    const s = await store(); s.change((d) => ({ ...d, sites: [site], training: [{ id: "t1", siteId: site.id, date: "2026-10-19", topic: "Safety", dirty: true }] }));
    const send = vi.fn(async () => json({}, 401));
    await expect(syncAccount(s, "", send, () => true)).rejects.toThrow(/Sign in again/);
    expect(send).toHaveBeenCalledTimes(1);
    expect(s.data.queue).toHaveLength(1);
    expect(s.data.training[0].dirty).toBe(true);
  });
  it("uploads archive tombstones and preserves training notes and attendance", async () => {
    const s = await store();
    s.change((d) => ({ ...d, training: [{ id: "t1", siteId: site.id, date: "2026-10-19", topic: "Safety", attendees: 8, notes: "Refresh", revision: 3, archived: true, dirty: true }] }));
    let body: unknown;
    await syncAccount(s, "", async (_url, init) => {
      if (init?.method === "PUT") { body = JSON.parse(init.body as string); return json({ ...body as object, revision: 4 }); }
      return empty();
    }, () => true);
    expect(body).toMatchObject({ archived: true, revision: 3, attendees: 8, notes: "Refresh" });
    expect(s.data.training[0]).toMatchObject({ archived: true, revision: 4, dirty: false });
  });
  it("normalizes nullable optional backend fields for local forms", async () => {
    const s = await store();
    await syncAccount(s, "", async (url) => {
      if (url.startsWith("/api/sites?")) return json({ items: [{ ...site, address: null, unitManager: null, supervisor: null, facilityType: null }], hasMore: false });
      if (url.startsWith("/api/training-sessions?")) return json({ items: [{ id: "t1", siteId: "s1", date: "2026-10-19", topic: "Safety", notes: null, attendees: null }], hasMore: false });
      return empty();
    }, () => true);
    expect(s.data.sites[0]).toMatchObject({ address: "", unitManager: "", supervisor: "" });
    expect(s.data.training[0].notes).toBeUndefined();
    expect(s.data.training[0].attendees).toBeUndefined();
  });
  it("paginates remote lists and preserves edits made during a pull", async () => {
    const s = await store();
    s.change((d) => ({ ...d, sites: [{ ...site, dirty: false }] }));
    const urls: string[] = [];
    await syncAccount(s, "", async (url) => {
      urls.push(url);
      if (url === "/api/sites?offset=0&limit=100") {
        s.change((d) => ({ ...d, sites: [{ ...site, name: "Pending local", dirty: true }] }));
        return json({ items: [{ ...site, name: "Remote", dirty: false }], hasMore: true });
      }
      if (url === "/api/sites?offset=100&limit=100") return json({ items: [{ ...site, id: "s2", dirty: false }], hasMore: false });
      return empty();
    }, () => true);
    expect(urls).toContain("/api/sites?offset=100&limit=100");
    expect(s.data.sites).toHaveLength(2);
    expect(s.data.sites[0]).toMatchObject({ name: "Pending local", dirty: true });
  });
  it("discovers remote audits read-only with remote photo metadata, without uploading them", async () => {
    const s = await store();
    const a = { ...newAudit("a1", site, "2026-10-19", "WPC_V1"), photos: [{ id: "p1", caption: "Evidence", itemKey: null, takenAt: "2026-10-19T08:00:00Z" }] };
    const send = vi.fn<SyncFetch>(async (url, init) => {
      expect(init?.method).not.toBe("PUT");
      if (url === "/api/audits?offset=0&limit=100") return json({ items: [{ id: a.id }], hasMore: false });
      if (url === "/api/audits/a1") return json(a);
      return empty();
    });
    await syncAccount(s, "", send, () => true);
    expect(s.data.audits[0]).toMatchObject({ state: "final", synced: true, photos: [{ id: "p1", uploaded: true }] });
    expect(await getAccountPhoto(s.account, "p1")).toBeUndefined();
  });
  it("retries an immutable audit snapshot exactly before uploading its pending photo", async () => {
    const s = await store();
    const audit = { ...newAudit("a1", site, "2026-10-19", "WPC_V1", { name: "Auditor", role: "Trainer" }), state: "final" as const,
      finalisedAt: "2026-10-19T08:00:00Z", photos: [{ id: "p1", caption: "Sink", itemKey: null, takenAt: "2026-10-19T07:00:00Z", uploaded: false }] };
    s.change((d) => ({ ...d, audits: [audit] }));
    await putAccountPhoto(s.account, "p1", new Blob(["photo"], { type: "image/jpeg" }));
    let original = "";
    await expect(syncAccount(s, "", async (_url, init) => { original = init!.body as string; throw new Error("lost"); }, () => true)).rejects.toThrow("lost");
    const urls: string[] = [];
    await syncAccount(s, "", async (url, init) => {
      urls.push(url);
      if (url === "/api/audits/a1") { expect(init!.body).toBe(original); return json({}); }
      if (init?.method === "PUT") return json({});
      return empty();
    }, () => true);
    expect(JSON.parse(original)).toMatchObject({ auditorRole: "Trainer" });
    expect(urls[1]).toContain("/api/audits/a1/photos/p1?caption=Sink&takenAt=");
    expect(s.data.audits[0]).toMatchObject({ synced: true, photos: [{ uploaded: true }] });
  });
  it("preserves a draft with the same id instead of replacing it with a remote final", async () => {
    const s = await store();
    const draft = newAudit("a1", site, "2026-10-19", "WPC_V1");
    s.change((d) => ({ ...d, audits: [draft] }));
    await syncAccount(s, "", async (url) => url.startsWith("/api/audits?") ? json({ items: [{ id: "a1" }], hasMore: false }) : empty(), () => true);
    expect(s.data.audits).toEqual([draft]);
  });
  it("downloads photos through authenticated sender and serves cached photos offline", async () => {
    const s = await store();
    const send = vi.fn<SyncFetch>(async () => new Response(new Blob(["image"], { type: "image/jpeg" })));
    expect(await (await loadRemotePhoto(s.account, "a1", "p1", "https://api", send, () => true)).text()).toBe("image");
    expect(send).toHaveBeenCalledWith("https://api/api/audits/a1/photos/p1");
    expect(await (await loadRemotePhoto(s.account, "a1", "p1", "", async () => { throw new Error("offline"); }, () => true)).text()).toBe("image");
  });
  it("does not cache a download returned after an account transition and surfaces download errors", async () => {
    const s = await store(); let current = true;
    await expect(loadRemotePhoto(s.account, "a1", "p1", "", async () => { current = false; return new Response("private"); }, () => current)).rejects.toThrow(/Sign-in changed/);
    expect(await getAccountPhoto(s.account, "p1")).toBeUndefined();
    await expect(loadRemotePhoto(s.account, "a1", "p1", "", async () => json({}, 401), () => true)).rejects.toThrow(/401/);
  });
});
