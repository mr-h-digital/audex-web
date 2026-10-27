import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { auditTemplate, BASELINE_TEMPLATE, defaultTemplateCode, facilityAreas, facilityTemplates, requiredAreaCodes, resolveTemplate, templateItemCount, type FacilityTemplate } from "./catalog";
import { comparisonGroups, comparisonKey } from "./comparison";
import { FacilitySelection, initialFacilitySelection, selectionForFacility } from "./FacilitySelection";
import { finalise, newAudit, scoreOf, summarise } from "../audits/store";
import { sections } from "../scoring/catalog";
import { addSite, updateSite } from "../sites/store";

const original = structuredClone(facilityTemplates);
afterEach(() => { facilityTemplates.splice(0, facilityTemplates.length, ...structuredClone(original)); });
const site = { id: "site", name: "Clinic", address: "", unitManager: "Manager", supervisor: "Supervisor", facilityType: "CLINIC" };
const count = sections.reduce((sum, section) => sum + section.items.length, 0);

describe("facility-specific audit templates", () => {
  it("keeps all baseline checks and blocks every unpublished standard", () => {
    for (const facilityType of ["HOSPITAL", "CLINIC", "RETIREMENT_VILLAGE", "OTHER"]) {
      expect(templateItemCount(resolveTemplate(BASELINE_TEMPLATE, facilityType, ["KITCHEN"]))).toBe(count);
    }
    expect(count).toBe(264);
    for (const code of ["HOSPITAL_V1", "CLINIC_V1", "RETIREMENT_VILLAGE_V1", "unknown"]) expect(() => resolveTemplate(code, "CLINIC")).toThrow(/published/);
    expect(() => resolveTemplate(BASELINE_TEMPLATE, "unknown")).toThrow(/facility type/);
    expect(() => resolveTemplate(BASELINE_TEMPLATE, "CLINIC", ["unknown"])).toThrow(/areas/);
    expect(() => resolveTemplate(BASELINE_TEMPLATE, "CLINIC", ["KITCHEN", "KITCHEN"])).toThrow(/areas/);
  });

  it("shows a clear baseline notice, preview and unpublished draft descriptions, not selectable drafts", () => {
    const html = renderToStaticMarkup(<FacilitySelection value={{ ...initialFacilitySelection, facilityType: "CLINIC" }} onChange={() => {}} />);
    expect(html).toContain("264 checks");
    expect(html).toContain("do not remove checks");
    expect(html).toContain("Clinic-specific checklist");
    expect(html).toContain("Draft templates cannot be used");
    expect(html).not.toContain('value="CLINIC_V1"');
  });

  it("preserves facility classification when adding/editing sites", () => {
    const list = addSite([], site, "site");
    expect(list[0].facilityType).toBe("CLINIC");
    expect(updateSite(list, "site", { ...site, facilityType: "HOSPITAL" })[0].facilityType).toBe("HOSPITAL");
  });

  it.each([
    ["CLINIC", "CLINIC_OPERATIONAL_V1", "CONSULTING", 74],
    ["HOSPITAL", "HOSPITAL_OPERATIONAL_V1", "WARDS", 116],
    ["RETIREMENT_VILLAGE", "RETIREMENT_OPERATIONAL_V1", "RESIDENTIAL", 81],
  ] as const)("defaults %s to a genuinely shorter operational checklist with mandatory care areas", (type, code, area, expected) => {
    const selection = selectionForFacility(type);
    expect(selection).toEqual({ facilityType: type, templateCode: code, areas: [area] });
    expect(requiredAreaCodes(String(code))).toEqual([area]);
    const snapshot = resolveTemplate(selection.templateCode, selection.facilityType, selection.areas);
    expect(templateItemCount(snapshot)).toBe(expected);
    expect(templateItemCount(resolveTemplate(String(code), String(type), []))).toBe(expected);
    expect(snapshot.purpose).toBe("OPERATIONAL");
    const html = renderToStaticMarkup(<FacilitySelection value={selection} onChange={() => {}} />);
    expect(html).toContain(`${expected} checks`);
    expect(html).toContain(`${264 - Number(expected)} fewer`);
    expect(html).toContain("(required)");
    expect(html).toContain("disabled");
    expect(html).toContain("not an independently reviewed or certified compliance standard");
  });

  it("adds only selected service modules, deduplicates overlaps and retains every critical check when all services apply", () => {
    const selection = selectionForFacility("CLINIC");
    const base = resolveTemplate(selection.templateCode, selection.facilityType, selection.areas);
    const kitchen = resolveTemplate(selection.templateCode, selection.facilityType, [...selection.areas, "KITCHEN"]);
    expect(templateItemCount(kitchen)).toBe(83);
    expect(base.sections.some((section) => section.code === "ward-hygiene")).toBe(false);
    const baseKeys = base.sections.flatMap((section) => section.items.map((item) => item.key));
    for (const key of ["chemicals-chemical-storage-02", "cleaning-equipment-trolley-11", "bathroom-toilet-cleaning-procedure-05", "waste-disposal-05"]) expect(baseKeys).toContain(key);
    for (const type of ["HOSPITAL", "CLINIC", "RETIREMENT_VILLAGE"]) {
      const code = defaultTemplateCode(type);
      const mandatory = resolveTemplate(code, type).sections.flatMap((section) => section.items.map((item) => item.key));
      for (const area of facilityAreas) {
        const selected = resolveTemplate(code, type, [area.code]);
        const selectedKeys = selected.sections.flatMap((section) => section.items.map((item) => item.key));
        expect(new Set(selectedKeys).size).toBe(selectedKeys.length);
        for (const key of mandatory) expect(selectedKeys).toContain(key);
      }
      const all = resolveTemplate(code, type, facilityAreas.map((area) => area.code));
      expect(templateItemCount(all)).toBe(200);
      const included = new Set(all.sections.flatMap((section) => section.items.map((item) => item.key)));
      for (const section of sections) for (const item of section.items) if (item.severity === "CRITICAL") expect(included.has(item.key)).toBe(true);
    }
    expect(selectionForFacility("OTHER").templateCode).toBe(BASELINE_TEMPLATE);
    expect(selectionForFacility("unknown")).toEqual(initialFacilitySelection);
    const unspecified = renderToStaticMarkup(<FacilitySelection value={initialFacilitySelection} onChange={() => {}} />);
    expect(unspecified).not.toContain('value="CLINIC_OPERATIONAL_V1"');
    expect(unspecified).not.toContain('value="HOSPITAL_OPERATIONAL_V1"');
    expect(unspecified).not.toContain('value="RETIREMENT_OPERATIONAL_V1"');
  });

  it("scores and freezes the real reduced checklist without rewriting historical baseline audits", () => {
    const selection = selectionForFacility("CLINIC");
    const audit = newAudit("short", site, "2026-10-27", "WPC_V1", undefined, selection);
    expect(scoreOf(audit).unanswered).toBe(74);
    for (const section of auditTemplate(audit).sections) for (const item of section.items) audit.answers[item.key] = "COMPLIANT";
    const done = finalise(audit, "2026-10-27T12:00:00Z");
    expect(done.state).toBe("final");
    expect(done.summary?.templateCode).toBe("CLINIC_OPERATIONAL_V1");
    expect(scoreOf(done).percent).toBe(100);
    const failed = { ...audit, answers: { ...audit.answers, "waste-disposal-05": "NON_COMPLIANT" as const } };
    expect(scoreOf(failed).status).toBe("NON_COMPLIANT");
    const definition = facilityTemplates.find((template) => template.code === selection.templateCode)!;
    definition.coreItemKeys = []; definition.modules = []; definition.status = "DRAFT";
    expect(templateItemCount(auditTemplate(done))).toBe(74);
    expect(scoreOf(done).status).toBe("COMPLIANT");
    expect(scoreOf(newAudit("baseline", site, "2026-10-27", "WPC_V1")).unanswered).toBe(264);
    expect(comparisonKey(summarise(done))).not.toBe(comparisonKey(summarise(newAudit("full", site, "2026-10-27", "WPC_V1"))));
  });

  it("freezes checklist and context at creation, with legacy audits using the original baseline", () => {
    const selection = { templateCode: BASELINE_TEMPLATE, facilityType: "CLINIC", areas: ["KITCHEN", "CONSULTING"] };
    const selectedSite = { ...site };
    const audit = newAudit("audit", selectedSite, "2026-10-27", "WPC_V1", undefined, selection);
    selection.areas.push("EMERGENCY");
    selectedSite.facilityType = "HOSPITAL";
    expect(audit.facilityType).toBe("CLINIC");
    expect(audit.facilityAreas).toEqual(["CONSULTING", "KITCHEN"]);
    expect(scoreOf(audit).unanswered).toBe(count);
    expect(auditTemplate({}).code).toBe(BASELINE_TEMPLATE);
    expect(auditTemplate(audit).sections).not.toBe(sections);
  });

  function approveFixture(): FacilityTemplate {
    const draft = facilityTemplates.find((template) => template.code === "CLINIC_V1")!;
    const items = sections[0].items;
    Object.assign(draft, { status: "PUBLISHED", approvedBy: "Fixture approver", approvedAt: "2026-10-27", approvalReference: "test-only" });
    draft.coreItemKeys = [items[0].key];
    draft.modules = [
      { area: "CONSULTING", required: false, itemKeys: [items[1].key] },
      { area: "SHARED", required: true, itemKeys: [items[2].key] },
    ];
    return draft;
  }

  it("resolves approved core plus required modules and selected optional areas, and scores only those items", () => {
    approveFixture();
    expect(templateItemCount(resolveTemplate("CLINIC_V1", "CLINIC"))).toBe(2);
    const audit = newAudit("audit", site, "2026-10-27", "WPC_V1", undefined, { templateCode: "CLINIC_V1", facilityType: "CLINIC", areas: ["CONSULTING"] });
    expect(scoreOf(audit).unanswered).toBe(3);
    for (const section of auditTemplate(audit).sections) for (const item of section.items) audit.answers[item.key] = "COMPLIANT";
    expect(scoreOf(audit).status).toBe("COMPLIANT");
    const done = finalise(audit, "2026-10-27T12:00:00Z");
    expect(done.state).toBe("final");
    expect(summarise(done).templateCode).toBe("CLINIC_V1");
    const draft = facilityTemplates.find((template) => template.code === "CLINIC_V1")!;
    draft.status = "DRAFT"; draft.coreItemKeys = [];
    expect(scoreOf(done).status).toBe("COMPLIANT");
    expect(templateItemCount(auditTemplate(done))).toBe(3);
  });

  it("does not allow publishing missing approval or invalid mappings", () => {
    const draft = approveFixture();
    draft.approvedBy = "";
    expect(() => resolveTemplate("CLINIC_V1", "CLINIC")).toThrow(/approval/);
    draft.approvedBy = "Fixture approver";
    draft.coreItemKeys = ["unknown"];
    expect(() => resolveTemplate("CLINIC_V1", "CLINIC")).toThrow(/unknown checklist/);
    draft.coreItemKeys = [sections[0].items[0].key];
    draft.modules[0].itemKeys = ["unknown"];
    expect(() => resolveTemplate("CLINIC_V1", "CLINIC")).toThrow(/unknown checklist/);
    draft.modules[0].itemKeys = [sections[0].items[1].key];
    draft.modules[0].area = "unknown";
    expect(() => resolveTemplate("CLINIC_V1", "CLINIC")).toThrow(/unknown facility area/);
    draft.modules[0].area = "CONSULTING";
    draft.scope = "BASELINE";
    expect(() => resolveTemplate("CLINIC_V1", "CLINIC")).toThrow(/invalid scope/);
  });

  it("separates templates, area scopes and scoring rule sets while treating legacy audits as baseline", () => {
    const audit = newAudit("a", site, "2026-10-27", "WPC_V1");
    const summary = summarise(audit);
    const legacy = { ...summary, templateCode: undefined, scopeKey: undefined };
    expect(comparisonKey(legacy)).toBe(comparisonKey(summary));
    expect(comparisonGroups([summary, legacy])).toHaveLength(1);
    expect(comparisonGroups([summary, { ...summary, templateCode: "CLINIC_V1", scopeKey: "CONSULTING" }, { ...summary, ruleSetCode: "WPC_V2_PROPOSED" }])).toHaveLength(3);
  });
});
