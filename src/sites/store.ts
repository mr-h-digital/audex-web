import { useAccountStore } from "../sync/accountStore";
import { useBilling } from "../billing/BillingProvider";

/** A site is the whole facility (WPC uses "site" and "unit" to mean the same thing). */
export interface AuditSite { id: string; name: string; address: string; unitManager: string; supervisor: string; archived: boolean; facilityType?: string; revision?: number; updatedAt?: string; dirty?: boolean }
export type SiteDraft = Pick<AuditSite, "name" | "address" | "unitManager" | "supervisor">;

export function addSite(list: AuditSite[], d: SiteDraft, id: string): AuditSite[] {
  const name = d.name.trim();
  if (!name) return list;
  if (list.some((s) => !s.archived && s.name.toLowerCase() === name.toLowerCase())) return list;
  return [...list, { id, name, address: d.address.trim(), unitManager: d.unitManager.trim(), supervisor: d.supervisor.trim(), archived: false, revision: 0, dirty: true }];
}
export const updateSite = (list: AuditSite[], id: string, d: SiteDraft): AuditSite[] =>
  d.name.trim() ? list.map((s) => (s.id === id ? { ...s, dirty: true, name: d.name.trim(), address: d.address.trim(), unitManager: d.unitManager.trim(), supervisor: d.supervisor.trim() } : s)) : list;
export const setArchived = (list: AuditSite[], id: string, archived: boolean): AuditSite[] =>
  list.map((s) => (s.id === id ? { ...s, archived, dirty: true } : s));

/** Local account records remain editable offline; sync acknowledges dirty changes by revision. */
export function useSites() {
  const { store, data } = useAccountStore();
  const billing = useBilling();
  const sites = data.sites;
  const capacity = () => {
    if (!billing.legacy && billing.access && store.data.sites.filter((s) => !s.archived).length >= billing.access.siteLimit) {
      window.alert("Your active-site limit has been reached. Archive an unused site or choose a different plan in Settings.");
      return false;
    }
    return true;
  };
  const add = (d: SiteDraft) => { if (billing.permit() && capacity()) store.change((l) => ({ ...l, sites: addSite(l.sites, d, crypto.randomUUID()) })); };
  const update = (id: string, d: SiteDraft) => { if (billing.permit()) store.change((l) => ({ ...l, sites: updateSite(l.sites, id, d) })); };
  const archive = (id: string, a: boolean) => { if (billing.permit() && (a || capacity())) store.change((l) => ({ ...l, sites: setArchived(l.sites, id, a) })); };
  return { sites, add, update, archive };
}
