import catalog from "../../shared/facility-templates.json";
import { sections, type TemplateSection } from "../scoring/catalog";

export const BASELINE_TEMPLATE = "WPC_BASELINE_V1";
export const facilityTypes = catalog.facilityTypes;
export const facilityAreas = catalog.areas;
export interface FacilityTemplate {
  code: string; name: string; version: number; status: "PUBLISHED" | "DRAFT"; facilityTypes: string[];
  scope: "BASELINE" | "MAPPED"; coreItemKeys: string[];
  modules: { area: string; required: boolean; itemKeys: string[] }[]; notice: string;
  approvedBy?: string; approvedAt?: string; approvalReference?: string;
  purpose?: "OPERATIONAL";
}
export interface TemplateSnapshot {
  code: string; name: string; version: number; facilityType: string | null; facilityName: string;
  notice: string; areas: { code: string; name: string }[]; sections: TemplateSection[];
  purpose?: "OPERATIONAL";
}
export const facilityTemplates = catalog.templates as FacilityTemplate[];

export function defaultTemplateCode(facilityType: string | null): string {
  return facilityTemplates.find((template) => template.status === "PUBLISHED" && template.purpose === "OPERATIONAL" && facilityType !== null && template.facilityTypes.includes(facilityType))?.code ?? BASELINE_TEMPLATE;
}
export function requiredAreaCodes(code: string): string[] {
  return facilityTemplates.find((template) => template.code === code)?.modules.filter((module) => module.required).map((module) => module.area) ?? [];
}

export function resolveTemplate(code = BASELINE_TEMPLATE, facilityType: string | null = null, areas: string[] = []): TemplateSnapshot {
  const definition = facilityTemplates.find((template) => template.code === code);
  if (!definition || definition.status !== "PUBLISHED") throw new Error("Choose a published audit template. Facility-specific drafts are not approved for use.");
  if (definition.scope !== (code === BASELINE_TEMPLATE ? "BASELINE" : "MAPPED") || !Number.isInteger(definition.version) || definition.version < 1) throw new Error("This template has an invalid scope or version.");
  if (!definition.facilityTypes.length || definition.facilityTypes.some((type) => !facilityTypes.some((item) => item.code === type))) throw new Error("This template refers to an unknown facility type.");
  if (definition.modules.some((module) => !facilityAreas.some((area) => area.code === module.area))) throw new Error("This template refers to an unknown facility area.");
  if (facilityType !== null && !definition.facilityTypes.includes(facilityType)) throw new Error("This template is not approved for the selected facility type.");
  if (new Set(areas).size !== areas.length || areas.some((area) => !facilityAreas.some((item) => item.code === area))) throw new Error("Choose distinct areas from the facility area catalogue.");
  if (definition.purpose !== undefined && definition.purpose !== "OPERATIONAL") throw new Error("This template has an unknown purpose.");
  if (definition.purpose === "OPERATIONAL" && (definition.scope !== "MAPPED" || !definition.notice.trim())) throw new Error("Operational templates require a separate mapped checklist and a scope notice.");
  if (definition.scope === "MAPPED" && (!facilityType || !definition.coreItemKeys.length)) throw new Error("This template needs a facility type and mandatory core requirements.");
  if (definition.scope === "MAPPED" && definition.purpose !== "OPERATIONAL" && (!definition.approvedBy?.trim() || !definition.approvedAt?.trim() || !definition.approvalReference?.trim())) throw new Error("This compliance template needs approval metadata.");
  const keys = new Set([...definition.coreItemKeys, ...definition.modules.filter((module) => module.required || areas.includes(module.area)).flatMap((module) => module.itemKeys)]);
  const known = new Set(sections.flatMap((section) => section.items.map((item) => item.key)));
  if ([...definition.coreItemKeys, ...definition.modules.flatMap((module) => module.itemKeys)].some((key) => !known.has(key))) throw new Error("This template refers to an unknown checklist requirement.");
  const included = sections.map((section) => ({ ...section, items: section.items.filter((item) => definition.scope === "BASELINE" || keys.has(item.key)) })).filter((section) => section.items.length);
  if (!included.length) throw new Error("This template has no approved applicable requirements.");
  return {
    code: definition.code, name: definition.name, version: definition.version,
    facilityType, facilityName: facilityTypes.find((type) => type.code === facilityType)?.name ?? "Not recorded",
    notice: definition.notice, areas: facilityAreas.filter((area) => areas.includes(area.code)).sort((a, b) => a.code.localeCompare(b.code)).map((area) => ({ ...area })),
    sections: structuredClone(included),
    ...(definition.purpose === "OPERATIONAL" ? { purpose: "OPERATIONAL" as const } : {}),
  };
}

export function auditTemplate(audit: { templateSnapshot?: TemplateSnapshot; templateCode?: string; facilityType?: string | null; facilityAreas?: string[] }): TemplateSnapshot {
  return audit.templateSnapshot ?? resolveTemplate(audit.templateCode, audit.facilityType ?? null, audit.facilityAreas);
}
export const templateItemCount = (snapshot: TemplateSnapshot) => snapshot.sections.reduce((sum, section) => sum + section.items.length, 0);
