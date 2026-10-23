import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PROGRESS, readProgress, WorkspaceSetup } from "./WorkspaceSetup";

describe("account-scoped workspace setup", () => {
  const values = new Map<string, string>();
  beforeEach(() => {
    values.clear();
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("starts new accounts expanded, but does not force established accounts through a tour", () => {
    expect(readProgress("new")).toEqual(EMPTY_PROGRESS);
    expect(readProgress("existing", true)).toEqual({ ...EMPTY_PROGRESS, skipped: true, celebrated: true });
  });
  it("remembers skip and profile confirmation without sharing another account's preferences", () => {
    values.set("audex.setup.v1.account%2Fone", JSON.stringify({ skipped: true, profileConfirmed: true, celebrated: false }));
    expect(readProgress("account/one")).toEqual({ skipped: true, profileConfirmed: true, celebrated: false });
    expect(readProgress("account/two")).toEqual(EMPTY_PROGRESS);
  });
  it("does not treat strings as confirmed or completed progress", () => {
    values.set("audex.setup.v1.one", JSON.stringify({ skipped: "true", profileConfirmed: 1, celebrated: null }));
    expect(readProgress("one")).toEqual(EMPTY_PROGRESS);
  });
  it("surfaces unreadable storage for the hook to report instead of resetting saved data", () => {
    values.set("audex.setup.v1.one", "invalid JSON");
    expect(() => readProgress("one")).toThrow();
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("Storage denied"); } });
    expect(() => readProgress("two")).toThrow("Storage denied");
  });
  const render = (progress = EMPTY_PROGRESS, hasSites = false, hasAudit = false, writable = true) =>
    renderToStaticMarkup(<WorkspaceSetup name="Auditor" progress={progress} hasSites={hasSites} hasAudit={hasAudit} writable={writable} onUpdate={() => {}} onNavigate={() => {}} />);
  it("offers skipping and real navigation instead of requiring a separate site form", () => {
    const html = render();
    expect(html).toContain("Explore first, finish later");
    expect(html).toContain("Review report details");
    expect(html).toContain("Add your first site");
    expect(html).toContain("Start your first audit");
    expect(html).toContain('value="0" max="3"');
  });
  it("keeps a compact resume control after skipping and counts actual records", () => {
    const html = render({ ...EMPTY_PROGRESS, skipped: true }, true, true);
    expect(html).toContain("Resume setup");
    expect(html).toContain("2 of 3 steps complete");
    expect(html).not.toContain("setup-steps");
  });
  it("does not show a completed checklist or permit writes through onboarding", () => {
    expect(render({ ...EMPTY_PROGRESS, profileConfirmed: true }, true, true)).toBe("");
    const html = render(EMPTY_PROGRESS, false, false, false);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("Verify your email or refresh access");
  });
});
