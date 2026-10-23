export interface Lease { payload: string; signature: string }
export interface Entitlement {
  accountId: string; plan: "TRIAL" | "SOLO" | "PROFESSIONAL" | "COMPLIMENTARY";
  writable: boolean; administrator: boolean; verified: boolean;
  issuedAt: string; offlineUntil: string; accessUntil: string | null;
  siteLimit: number; storageBytes: number; activeSites: number; usedBytes: number; usageKnown: boolean;
}
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
export async function verifyLease(lease: Lease, account: string, publicKey: string): Promise<Entitlement> {
  if (!publicKey) throw new Error("Offline entitlement verification is not configured. Contact support.");
  const key = await crypto.subtle.importKey("spki", decode(publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const payload = decode(lease.payload);
  if (!await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, decode(lease.signature), payload)) throw new Error("Your offline entitlement signature is invalid. Connect to refresh billing.");
  const c: unknown = JSON.parse(new TextDecoder().decode(payload));
  if (!c || typeof c !== "object") throw new Error("Invalid offline entitlement.");
  const a = c as Entitlement;
  const issued = Date.parse(a.issuedAt), offline = Date.parse(a.offlineUntil);
  if (a.accountId !== account || !["TRIAL", "SOLO", "PROFESSIONAL", "COMPLIMENTARY"].includes(a.plan)
      || typeof a.writable !== "boolean" || typeof a.verified !== "boolean" || typeof a.administrator !== "boolean"
      || !Number.isFinite(issued) || !Number.isFinite(offline) || offline > issued + 7 * 86_400_000
      || (a.accessUntil !== null && (!Number.isFinite(Date.parse(a.accessUntil)) || offline > Date.parse(a.accessUntil)))
      || !Number.isInteger(a.siteLimit) || a.siteLimit < 1 || !Number.isFinite(a.storageBytes) || a.storageBytes < 1
      || !Number.isFinite(a.usedBytes) || a.usedBytes < 0 || !Number.isInteger(a.activeSites) || a.activeSites < 0
      || typeof a.usageKnown !== "boolean") throw new Error("Your offline entitlement is invalid or belongs to another account.");
  return a;
}
export function canEdit(a: Entitlement | null, now = Date.now(), lastSeen = 0) {
  return !!a && a.writable && a.verified && now >= lastSeen - 300_000
    && now >= Date.parse(a.issuedAt) - 300_000 && now < Date.parse(a.offlineUntil)
    && (a.accessUntil === null || now < Date.parse(a.accessUntil));
}
