import type { Page } from "../components/Navigation";

export interface TourStep { page: Page; target: string; title: string; description: string; tip: string }
export type TourId = "intro" | "sites" | "audit" | "dashboard" | "settings";

const sites: TourStep[] = [
  { page: "sites", target: "site-form", title: "Start with your sites", description: "Add the clinic, hospital or facility you will audit. Save its address, unit manager and housekeeping supervisor so you can reuse these details.", tip: "No practice records are created during this tour." },
  { page: "sites", target: "site-list", title: "Keep your site list organised", description: "Edit a site's details or archive a site you no longer audit. Show archived lets you find and restore it later.", tip: "Archiving a site does not delete its audit history." },
  { page: "sites", target: "training", title: "Record training sessions", description: "Choose a site, date and topic to log training. The dashboard compares audit results around these sessions when enough data is available.", tip: "Record real sessions only; the tour will not submit this form." },
];
const audit: TourStep[] = [
  { page: "audit", target: "audit-start", title: "Complete an audit at your own pace", description: "Choose a site and date to start, or continue an existing draft. Answer each checklist item and add supporting notes or photos where needed. Every N/A answer needs a reason.", tip: "Drafts are saved on this device. Review your answers before finalising: finalised answers cannot be changed." },
  { page: "audit", target: "nav-audit", title: "Return to your audit history", description: "Audit is your home for starting work, continuing drafts and viewing completed audits. Your score reflects the selected rules and any critical failures, not just an average.", tip: "If an audit is open, Back to audits returns to the list without discarding its saved draft." },
];
const dashboard: TourStep[] = [
  { page: "dashboard", target: "dashboard-filters", title: "Turn results into action", description: "Review compliance, trends, weaker sections and recurring failures. Filter by site and reporting period, then download a report for the selected view.", tip: "A Demo data banner means you are viewing made-up examples, not your actual results." },
];
const settings: TourStep[] = [
  { page: "settings", target: "settings-profile", title: "Make AudEx your own", description: "Choose a light or dark appearance, update the profile used on reports and manage your signed-in account.", tip: "You can replay this tour or open a focused guide from Help at any time." },
];

export const TOURS: Record<TourId, { title: string; summary: string; steps: TourStep[] }> = {
  intro: { title: "Welcome to AudEx", summary: "A quick introduction to your workspace, from your first site to useful reports.", steps: [...sites.slice(0, 1), ...audit.slice(0, 1), ...dashboard, { page: "audit", target: "sync", title: "Work offline, sync when connected", description: "Records are saved on this device for your account. When connected, Sync now exchanges supported records with the server and reports any problems.", tip: "Unfinished audit drafts stay on this device. Finalised audits, sites and training can sync across signed-in devices." }, ...settings] },
  sites: { title: "Sites and training", summary: "Organise facilities and record the training that supports them.", steps: sites },
  audit: { title: "Audits explained", summary: "Understand drafts, checklist answers, scoring and finalisation.", steps: audit },
  dashboard: { title: "Dashboard and reports", summary: "Find trends, follow up on failures and share results.", steps: dashboard },
  settings: { title: "Profile and preferences", summary: "Personalise your appearance and report details.", steps: settings },
};

export function isTourStatus(value: unknown): value is "NEW" | "SKIPPED" | "COMPLETED" {
  return value === "NEW" || value === "SKIPPED" || value === "COMPLETED";
}
