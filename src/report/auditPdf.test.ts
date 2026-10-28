import { describe, expect, it, vi } from "vitest";
import { finalise, newAudit } from "../audits/store";
import { sections } from "../scoring/catalog";
import { selectionForFacility } from "../facilities/FacilitySelection";
import { auditFilename, buildAuditReport, downloadAuditReport } from "./auditPdf";

describe("audit PDF", () => {
  const answers = Object.fromEntries(sections.flatMap((s) => s.items.map((i, n) => [i.key, n % 9 === 0 ? "PARTIALLY_COMPLIANT" : "COMPLIANT"])));
  const a = finalise({ ...newAudit("a1", { id: "s1", name: "Tygerberg Clinic", unitManager: "A. Smith", supervisor: "B. Jones" }, "2026-10-15", "WPC_V1"), answers: answers as never }, "t");
  it("is a PDF with neutral attribution when the original auditor was not recorded", async () => {
    const doc = await buildAuditReport(a);
    const out = String(doc.output());
    expect(out.startsWith("%PDF-")).toBe(true);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(out).toContain("Auditor not recorded");
    expect(out).not.toContain("Chernay Hildebrandt");
    expect(out).not.toContain("Western Province Caterers");
  });
  it("names the file by site and date", () => expect(auditFilename(a)).toBe("AudEx-audit_Tygerberg-Clinic_2026-10-15.pdf"));
  it("uses the frozen facility and area metadata in the report", async () => {
    const scoped = newAudit("scoped", { id: "s1", name: "Clinic", unitManager: "", supervisor: "" }, "2026-10-15", "WPC_V1", undefined,
      { templateCode: "WPC_BASELINE_V1", facilityType: "CLINIC", areas: ["CONSULTING"] });
    const out = String((await buildAuditReport({ ...scoped, answers: a.answers })).output());
    expect(out).toContain("WPC housekeeping baseline");
    expect(out).toContain("Facility: Clinic");
    expect(out).toContain("Consulting rooms");
  });
  it("labels the real reduced operational checklist and does not report omitted sections", async () => {
    const scoped = newAudit("short", { id: "s1", name: "Clinic", unitManager: "", supervisor: "" }, "2026-10-15", "WPC_V1", undefined, selectionForFacility("CLINIC"));
    const out = String((await buildAuditReport({ ...scoped, answers: a.answers })).output());
    expect(out).toContain("Clinic operational housekeeping");
    expect(out).toContain("not an independently");
    expect(out).toContain("compliance standard");
    expect(out).not.toContain("Laundry Equipment");
    expect(out).not.toContain("Ward Hygiene");
  });
  it("refuses to silently omit a photo that is unavailable offline", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("offline"); });
    try {
      await expect(downloadAuditReport({ ...a, photos: [{ id: "uncached", caption: "", itemKey: null, takenAt: "t", uploaded: true }] },
        async () => undefined)).rejects.toThrow(/not cached/);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe("audit PDF with photos", () => {
  const jpg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAB4AKADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCtRRRXnH0YUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/Z";
  const key = sections[0].items[0].key;
  const answers = Object.fromEntries(sections.flatMap((s) => s.items.map((i) => [i.key, i.key === key ? "NON_COMPLIANT" : "COMPLIANT"])));
  const base = finalise({ ...newAudit("a9", { id: "s1", name: "Clinic", unitManager: "", supervisor: "" }, "2026-10-15", "WPC_V1"), answers: answers as never }, "t");
  const a = { ...base, photos: [{ id: "p1", itemKey: key, caption: "", takenAt: "t", uploaded: false }, { id: "p2", itemKey: null, caption: "", takenAt: "t", uploaded: false }] };
  it("embeds item and site photos", async () => {
    const plain = String((await buildAuditReport(a)).output()).length;
    const withPhotos = String((await buildAuditReport(a, null, { p1: jpg, p2: jpg })).output());
    expect(withPhotos.length).toBeGreaterThan(plain);
    expect(withPhotos).toContain("/DCTDecode");
  });
});

describe("audit PDF author", () => {
  it("uses the auditor and role stored on the audit", async () => {
    const a = finalise({ ...newAudit("a7", { id: "s1", name: "Clinic", unitManager: "", supervisor: "" }, "2026-10-15", "WPC_V1", { name: "Test Auditor", role: "Senior Trainer, WPC" }),
      answers: Object.fromEntries(sections.flatMap((s) => s.items.map((i) => [i.key, "COMPLIANT"]))) as never }, "t");
    const out = String((await buildAuditReport(a)).output());
    expect(out).toContain("Test Auditor");
    expect(out).toContain("Senior Trainer, WPC");
    expect(out).not.toContain("Chernay Hildebrandt");
  });
});
