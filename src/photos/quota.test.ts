import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { getAccountPhoto, putAccountPhoto, putAccountPhotoWithinQuota } from "./blobStore";

describe("pending device photo quota", () => {
  it("accepts the exact boundary and rejects one byte over without replacing saved data", async () => {
    const account = crypto.randomUUID();
    await putAccountPhotoWithinQuota(account, "first", new Blob(["1234"]), 4, new Set());
    await expect(putAccountPhotoWithinQuota(account, "second", new Blob(["1"]), 4, new Set())).rejects.toThrow(/allowance/);
    expect((await getAccountPhoto(account, "first"))?.size).toBe(4);
    expect(await getAccountPhoto(account, "second")).toBeUndefined();
  });
  it("does not double count already-uploaded cached photos", async () => {
    const account = crypto.randomUUID();
    await putAccountPhoto(account, "uploaded", new Blob(["12345"]));
    await putAccountPhotoWithinQuota(account, "new", new Blob(["12"]), 2, new Set(["uploaded"]));
    expect((await getAccountPhoto(account, "new"))?.size).toBe(2);
  });
  it("serialises concurrent captures against one remaining allowance", async () => {
    const account = crypto.randomUUID();
    const results = await Promise.allSettled([
      putAccountPhotoWithinQuota(account, "a", new Blob(["123"]), 4, new Set()),
      putAccountPhotoWithinQuota(account, "b", new Blob(["123"]), 4, new Set()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
});
