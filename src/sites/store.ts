import { useCallback, useEffect, useState } from "react";

/** A site is the whole facility (WPC uses "site" and "unit" to mean the same thing). */
export interface AuditSite { id: string; name: string; address: string; unitManager: string; supervisor: string; archived: boolean }
export type SiteDraft = Pick<AuditSite, "name" | "address" | "unitManager" | "supervisor">;

const KEY = "audex.sites.v1";

export function addSite(list: AuditSite[], d: SiteDraft, id: string): AuditSite[] {
  const name = d.name.trim();
  if (!name) return list;
  if (list.some((s) => !s.archived && s.name.toLowerCase() === name.toLowerCase())) return list;
  return [...list, { id, name, address: d.address.trim(), unitManager: d.unitManager.trim(), supervisor: d.supervisor.trim(), archived: false }];
}
export const updateSite = (list: AuditSite[], id: string, d: SiteDraft): AuditSite[] =>
  d.name.trim() ? list.map((s) => (s.id === id ? { ...s, name: d.name.trim(), address: d.address.trim(), unitManager: d.unitManager.trim(), supervisor: d.supervisor.trim() } : s)) : list;
export const setArchived = (list: AuditSite[], id: string, archived: boolean): AuditSite[] =>
  list.map((s) => (s.id === id ? { ...s, archived } : s));

function read(): AuditSite[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.map((x) => ({ supervisor: "", unitManager: "", address: "", ...x })) : []; } catch { return []; }
}

/** Sites live on the device (so they work offline); they sync to the server once the sync endpoint exists. */
export function useSites() {
  const [sites, setSites] = useState<AuditSite[]>(read);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(sites)); } catch { /* storage unavailable */ } }, [sites]);
  const add = useCallback((d: SiteDraft) => setSites((l) => addSite(l, d, crypto.randomUUID())), []);
  const update = useCallback((id: string, d: SiteDraft) => setSites((l) => updateSite(l, id, d)), []);
  const archive = useCallback((id: string, a: boolean) => setSites((l) => setArchived(l, id, a)), []);
  return { sites, add, update, archive };
}
