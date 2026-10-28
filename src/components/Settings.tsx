import { useState } from "react";
import { roleLine, validateProfile, type Profile } from "../profile/store";
import type { Theme } from "../theme/theme";
import type { Auth } from "../auth/useAuth";
import { AccountSection } from "./auth/AccountSection";
import { PageHeading } from "./PageHeading";
import { BillingPanel } from "../billing/BillingPanel";
import { AdminPanel } from "../admin/AdminPanel";

const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: "light", label: "Light", icon: "☀" },
  { id: "dark", label: "Dark", icon: "☾" },
  { id: "system", label: "Match my phone", icon: "◐" },
];

interface Props { profile: Profile; onSaveProfile: (p: Profile) => boolean; theme: Theme; onTheme: (t: Theme) => void; auth: Auth; unsynced: number }

export function Settings({ profile, onSaveProfile, theme, onTheme, auth, unsynced }: Props) {
  const [draft, setDraft] = useState<Profile>(profile);
  const [saved, setSaved] = useState(false);
  const error = validateProfile(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  const field = (k: keyof Profile, label: string, type = "text", hint?: string) => (
    <label className="field">{label}
      <input type={type} value={draft[k] ?? ""} inputMode={k === "phone" ? "tel" : k === "email" ? "email" : undefined}
        autoComplete={k === "name" ? "name" : k === "email" ? "email" : k === "phone" ? "tel" : undefined}
        onChange={(e) => { setDraft({ ...draft, [k]: e.target.value }); setSaved(false); }} />
      {hint && <span className="small">{hint}</span>}</label>
  );

  return (
    <div className="dash settings-page">
      <PageHeading title="Settings" description="Manage your appearance, profile and account." />

      <section className="card">
        <h2>Appearance</h2>
        <p className="small">Dark mode is easier on the eyes in a dim room.</p>
        <div className="themes" role="group" aria-label="Appearance">
          {THEMES.map((t) => (
            <button key={t.id} type="button" className="theme" aria-pressed={theme === t.id} onClick={() => onTheme(t.id)}>
              <span aria-hidden>{t.icon}</span>{t.label}
            </button>))}
        </div>
      </section>

      <form className="card form" data-tour="settings-profile" onSubmit={(e) => { e.preventDefault(); if (!error) setSaved(onSaveProfile(draft)); }}>
        <h2>Your profile</h2>
        <p className="small">Your report details are copied into new audits. They do not change attribution already saved on existing audits.</p>
        {field("name", "Full name")}
        {field("jobTitle", "Job title")}
        {field("organisation", "Organisation / business (optional)", "text", "Use your own organisation, or leave this blank if you work independently. This is report text, not a shared team workspace.")}
        {field("email", "Email (optional)", "email")}
        {field("phone", "Phone (optional)", "tel")}
        <p className="small">Reports will say: Prepared by {draft.name.trim() || "…"}, {roleLine(draft)}</p>
        {dirty && error && <p className="warn" role="alert">{error}</p>}
        {saved && !dirty && <p className="saved" role="status">Profile saved.</p>}
        <button className="btn" type="submit" disabled={!!error}>Save profile</button>
      </form>

      <AccountSection auth={auth} unsynced={unsynced} />
      <BillingPanel />
      <AdminPanel auth={auth} />

      <section className="card">
        <h2>About</h2>
        <div className="setrow"><div>AudEx<small>Independent housekeeping audit software for healthcare and senior living</small></div></div>
        <p className="small">For facility operators, housekeeping managers, independent auditors and cleaning contractors. Individual accounts do not include shared team workspaces or cross-user reporting.</p>
        <p className="small">Checklist provenance is separate from product identity: WPC-labelled checklists and scoring rules retain their source names. Reduced operational checklists select from that existing material; they are not independently validated industry-wide standards or regulatory certification. Confirm suitability and your organisation's requirements before auditing.</p>
        <div className="setrow"><span>Version</span><strong>{__APP_INFO__.version}</strong></div>
        <div className="setrow"><span>Build</span><code>{__APP_INFO__.build}</code></div>
        <div className="setrow"><span>Built on</span><time dateTime={__APP_INFO__.builtAt}>{new Date(__APP_INFO__.builtAt).toLocaleString(undefined, {
          year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
        })}</time></div>
        <div className="setrow developer-credit">
          <a className="developer-credit__website" href="https://mrhdigital.co.za/" target="_blank" rel="noopener noreferrer">
            <img src="/logo/mrh-digital-badge.webp" alt="" width={64} height={64} loading="lazy" />
            <span>
              <small>Developed by</small>
              <strong>Mr. H Digital</strong>
              <span className="developer-credit__domain">mrhdigital.co.za</span>
              <span className="small">Opens in a new tab</span>
            </span>
          </a>
        </div>
        <div className="setrow">
          <span>Developer contact</span>
          <a className="developer-contact" href="mailto:info@mrhdigital.co.za">info@mrhdigital.co.za</a>
        </div>
      </section>
    </div>
  );
}
