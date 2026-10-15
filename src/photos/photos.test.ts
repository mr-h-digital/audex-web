import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { finalise, newAudit, type Answers } from "../audits/store";
import { sections } from "../scoring/catalog";
import { syncPhotos } from "../sync/sync";
import { deletePhoto, getPhoto, putPhoto } from "./blobStore";
import { addPhoto, markUploaded, photosFor, photosWaiting, pruneOrphans, removePhoto } from "./photos";

const site = { id: "s1", name: "Clinic", unitManager: "", supervisor: "" };
const k1 = sections[0].items[0].key, k2 = sections[0].items[1].key;
const draft = () => newAudit("a1", site, "2026-10-15", "WPC_V1");
const meta = (id: string, itemKey: string | null) => ({ id, itemKey, caption: "", takenAt: "t" });

describe("photo bookkeeping", () => {
  it("adds, filters and removes photos on a draft", () => {
    let a = addPhoto(addPhoto(draft(), meta("p1", k1)), meta("p2", null));
    expect(photosFor(a, k1)).toHaveLength(1);
    expect(photosFor(a, null)).toHaveLength(1);
    a = removePhoto(a, "p1");
    expect(photosFor(a, k1)).toHaveLength(0);
  });
  it("does not change a finalised audit", () => {
    const full: Answers = Object.fromEntries(sections.flatMap((s) => s.items.map((i) => [i.key, "COMPLIANT"])));
    const f = finalise({ ...draft(), answers: full }, "t");
    expect(addPhoto(f, meta("p1", k1))).toBe(f);
  });
  it("drops photos of items that are no longer failed", () => {
    const a = addPhoto(addPhoto(addPhoto({ ...draft(), answers: { [k1]: "NON_COMPLIANT", [k2]: "COMPLIANT" } }, meta("p1", k1)), meta("p2", k2)), meta("p3", null));
    const { audit, removed } = pruneOrphans(a);
    expect(removed).toEqual(["p2"]);
    expect(audit.photos?.map((p) => p.id)).toEqual(["p1", "p3"]);
  });
  it("counts photos waiting only for synced audits and marks them uploaded", () => {
    const a = { ...addPhoto(draft(), meta("p1", null)), state: "final" as const, synced: true };
    expect(photosWaiting([a])).toBe(1);
    expect(photosWaiting([{ ...a, synced: false }])).toBe(0);
    expect(photosWaiting(markUploaded([a], [{ auditId: "a1", photoId: "p1" }]))).toBe(0);
  });
});

describe("photo storage and upload", () => {
  it("round-trips a blob through IndexedDB", async () => {
    await putPhoto("x", new Blob(["hello"], { type: "image/jpeg" }));
    expect(await (await getPhoto("x"))!.text()).toBe("hello");
    await deletePhoto("x");
    expect(await getPhoto("x")).toBeUndefined();
  });
  const synced = { ...addPhoto(addPhoto(draft(), { ...meta("p1", k1), caption: "Dirty sink" }), meta("p2", null)), state: "final" as const, synced: true };
  it("uploads each waiting photo of a synced audit", async () => {
    const urls: string[] = [];
    const done = await syncPhotos([synced], "https://x", async () => new Blob(["img"], { type: "image/jpeg" }), async (u) => { urls.push(u); return { ok: true }; });
    expect(done.map((d) => d.photoId)).toEqual(["p1", "p2"]);
    expect(urls[0]).toBe(`https://x/api/audits/a1/photos/p1?caption=Dirty+sink&itemKey=${k1}`);
    expect(urls[1]).toBe("https://x/api/audits/a1/photos/p2?caption=");
  });
  it("waits for the audit to sync, and keeps photos queued on failure", async () => {
    const send = async () => ({ ok: false });
    expect(await syncPhotos([{ ...synced, synced: false }], "https://x", async () => new Blob(["i"]), async () => ({ ok: true }))).toEqual([]);
    expect(await syncPhotos([synced], "https://x", async () => new Blob(["i"]), send)).toEqual([]);
    expect(await syncPhotos([synced], "https://x", async () => new Blob(["i"]), async () => { throw new Error("offline"); })).toEqual([]);
  });
});
