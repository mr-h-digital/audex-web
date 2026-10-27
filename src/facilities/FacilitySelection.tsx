import { BASELINE_TEMPLATE, defaultTemplateCode, facilityAreas, facilityTemplates, facilityTypes, requiredAreaCodes, resolveTemplate, templateItemCount } from "./catalog";

export interface FacilitySelectionValue { templateCode: string; facilityType: string | null; areas: string[] }
export const initialFacilitySelection: FacilitySelectionValue = { templateCode: BASELINE_TEMPLATE, facilityType: null, areas: [] };
export function selectionForFacility(type: string | null | undefined): FacilitySelectionValue {
  const facilityType = facilityTypes.find((item) => item.code === type)?.code ?? null;
  const templateCode = defaultTemplateCode(facilityType);
  return { templateCode, facilityType, areas: requiredAreaCodes(templateCode) };
}

export function FacilitySelection({ value, onChange }: { value: FacilitySelectionValue; onChange: (selection: FacilitySelectionValue) => void }) {
  const applicable = facilityTemplates.filter((template) => value.facilityType ? template.facilityTypes.includes(value.facilityType) : template.code === BASELINE_TEMPLATE);
  const snapshot = resolveTemplate(value.templateCode, value.facilityType, value.areas);
  const required = requiredAreaCodes(value.templateCode);
  const operational = snapshot.purpose === "OPERATIONAL";
  const mapped = snapshot.code !== BASELINE_TEMPLATE;
  const count = templateItemCount(snapshot);
  const baselineCount = templateItemCount(resolveTemplate());
  return <section className="facility-selection" aria-labelledby="facility-selection-title">
    <h3 id="facility-selection-title">Choose your audit scope</h3>
    <label className="field">Facility type<select value={value.facilityType ?? ""} onChange={(e) => onChange(selectionForFacility(e.target.value))}>
      <option value="">Not specified — existing WPC checklist</option>
      {facilityTypes.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}
    </select></label>
    <label className="field">Checklist / audit standard<select value={value.templateCode} onChange={(e) => onChange({ ...value, templateCode: e.target.value, areas: [...new Set([...value.areas, ...requiredAreaCodes(e.target.value)])] })}>
      {applicable.filter((template) => template.status === "PUBLISHED").map((template) => <option key={template.code} value={template.code}>{template.name} · v{template.version}</option>)}
    </select></label>
    <p className="banner banner--ok" role="status"><strong>{count} checks</strong>{mapped ? ` — ${baselineCount - count} fewer than the full ${baselineCount}-check baseline.` : " — full baseline."}</p>
    <details open={mapped}>
      <summary>Record areas and services ({value.areas.length} selected)</summary>
      <p className="small">{mapped ? `Select every additional area/service present. Required areas and core safety checks cannot be removed. The count updates immediately; overlapping checks appear only once.${operational ? " This is a reduced operational review, not certification of the whole facility." : ""}` : "These selections record context only for the full baseline; they do not remove checks."}</p>
      <div className="facility-areas" role="group" aria-label="Facility areas and services">{facilityAreas.map((area) => <label key={area.code}>
        <input type="checkbox" checked={required.includes(area.code) || value.areas.includes(area.code)} disabled={required.includes(area.code)} onChange={(e) => onChange({ ...value, areas: e.target.checked ? [...value.areas, area.code] : value.areas.filter((code) => code !== area.code) })} />{area.name}{required.includes(area.code) ? " (required)" : ""}
      </label>)}</div>
    </details>
    <p className="banner" role="status">{snapshot.notice}</p>
    <details>
      <summary>Preview checklist — {templateItemCount(snapshot)} checks</summary>
      <p className="small">The selected template and facility context are frozen when you start. Changing the site later does not rewrite this audit.</p>
      {snapshot.sections.map((section) => <details key={section.code}><summary>{section.name} ({section.items.length})</summary>
        <ul>{section.items.map((item) => <li key={item.key}>{item.text}</li>)}</ul></details>)}
    </details>
    {applicable.some((template) => template.status === "DRAFT") && <details>
      <summary>Facility-specific standards awaiting approval</summary>
      {applicable.filter((template) => template.status === "DRAFT").map((template) => <p className="small" key={template.code}><strong>{template.name} · Draft</strong><br />{template.notice}</p>)}
      <p className="small">Draft templates cannot be used to start or upload an audit. The operational checklists above are available for shorter housekeeping reviews; the full baseline remains available. Neither substitutes for a separately approved facility compliance standard.</p>
    </details>}
  </section>;
}
