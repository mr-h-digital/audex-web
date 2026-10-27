import { BASELINE_TEMPLATE, facilityAreas, facilityTemplates, facilityTypes, resolveTemplate, templateItemCount } from "./catalog";

export interface FacilitySelectionValue { templateCode: string; facilityType: string | null; areas: string[] }
export const initialFacilitySelection: FacilitySelectionValue = { templateCode: BASELINE_TEMPLATE, facilityType: null, areas: [] };

export function FacilitySelection({ value, onChange }: { value: FacilitySelectionValue; onChange: (selection: FacilitySelectionValue) => void }) {
  const applicable = facilityTemplates.filter((template) => !value.facilityType || template.facilityTypes.includes(value.facilityType));
  const snapshot = resolveTemplate(value.templateCode, value.facilityType, value.areas);
  return <section className="facility-selection" aria-labelledby="facility-selection-title">
    <h3 id="facility-selection-title">Choose your audit scope</h3>
    <label className="field">Facility type<select value={value.facilityType ?? ""} onChange={(e) => onChange({ ...value, facilityType: e.target.value || null, templateCode: BASELINE_TEMPLATE })}>
      <option value="">Not specified — existing WPC checklist</option>
      {facilityTypes.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}
    </select></label>
    <label className="field">Audit standard<select value={value.templateCode} onChange={(e) => onChange({ ...value, templateCode: e.target.value })}>
      {applicable.filter((template) => template.status === "PUBLISHED").map((template) => <option key={template.code} value={template.code}>{template.name} · v{template.version}</option>)}
    </select></label>
    <details>
      <summary>Record areas and services ({value.areas.length} selected)</summary>
      <p className="small">Confirm what is present; do not assume areas from the facility type. These selections currently record context only.</p>
      <div className="facility-areas" role="group" aria-label="Facility areas and services">{facilityAreas.map((area) => <label key={area.code}>
        <input type="checkbox" checked={value.areas.includes(area.code)} onChange={(e) => onChange({ ...value, areas: e.target.checked ? [...value.areas, area.code] : value.areas.filter((code) => code !== area.code) })} />{area.name}
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
      <p className="small">Draft templates cannot be used to start or upload an audit. Continue using the authorised baseline and explain genuine N/A answers until a mapping is approved.</p>
    </details>}
  </section>;
}
