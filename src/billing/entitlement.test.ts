import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { canEdit, verifyLease, type Entitlement, type Lease } from "./entitlement";

const issued = Date.parse("2026-10-23T12:00:00Z");
const access: Entitlement = {
  accountId: "fixture", plan: "SOLO", writable: true, administrator: false, verified: true,
  issuedAt: new Date(issued).toISOString(), offlineUntil: new Date(issued + 7 * 86_400_000).toISOString(),
  accessUntil: new Date(issued + 20 * 86_400_000).toISOString(),
  siteLimit: 3, storageBytes: 1_000_000_000, activeSites: 1, usedBytes: 1000, usageKnown: true,
};
async function signed(claims: Entitlement) {
  const keys = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const bytes = new TextEncoder().encode(JSON.stringify(claims));
  const signature = await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, bytes);
  const publicKey = Buffer.from(await webcrypto.subtle.exportKey("spki", keys.publicKey)).toString("base64");
  const lease: Lease = { payload: Buffer.from(bytes).toString("base64url"), signature: Buffer.from(signature).toString("base64url") };
  return { lease, publicKey };
}
describe("signed account entitlements", () => {
  it("verifies the pinned signing key and rejects tampering, wrong accounts and wrong keys", async () => {
    const { lease, publicKey } = await signed(access);
    expect(await verifyLease(lease, "fixture", publicKey)).toEqual(access);
    await expect(verifyLease(lease, "different", publicKey)).rejects.toThrow(/another account/);
    const other = await signed(access);
    await expect(verifyLease(lease, "fixture", other.publicKey)).rejects.toThrow(/signature/);
    await expect(verifyLease({ ...lease, payload: Buffer.from(JSON.stringify({ ...access, plan: "COMPLIMENTARY" })).toString("base64url") }, "fixture", publicKey)).rejects.toThrow(/signature/);
    await expect(verifyLease(lease, "fixture", "")).rejects.toThrow(/not configured/);
  });
  it("rejects a validly signed lease extending beyond seven days or beyond paid expiry", async () => {
    const overlong = await signed({ ...access, offlineUntil: new Date(issued + 8 * 86_400_000).toISOString() });
    await expect(verifyLease(overlong.lease, "fixture", overlong.publicKey)).rejects.toThrow(/invalid/);
    const beyondPaid = await signed({ ...access, accessUntil: new Date(issued + 86_400_000).toISOString() });
    await expect(verifyLease(beyondPaid.lease, "fixture", beyondPaid.publicKey)).rejects.toThrow(/invalid/);
  });
  it("expires exactly at the offline/paid boundary and refuses clock rollback", () => {
    expect(canEdit(access, issued)).toBe(true);
    expect(canEdit(access, issued + 7 * 86_400_000 - 1)).toBe(true);
    expect(canEdit(access, issued + 7 * 86_400_000)).toBe(false);
    expect(canEdit({ ...access, accessUntil: new Date(issued + 1000).toISOString() }, issued + 1000)).toBe(false);
    expect(canEdit(access, issued, issued + 600_000)).toBe(false);
    expect(canEdit(access, issued - 600_000)).toBe(false);
    expect(canEdit({ ...access, verified: false }, issued)).toBe(false);
    expect(canEdit({ ...access, writable: false }, issued)).toBe(false);
  });
});
