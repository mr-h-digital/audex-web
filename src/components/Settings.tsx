import { useState } from "react";
import { roleLine, validateProfile, type Profile } from "../profile/store";
import type { Theme } from "../theme/theme";
import type { Auth } from "../auth/useAuth";
import { AccountSection } from "./auth/AccountSection";
import { PageHeading } from "./PageHeading";

const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: "light", label: "Light", icon: "☀" },
  { id: "dark", label: "Dark", icon: "☾" },
  { id: "system", label: "Match my phone", icon: "◐" },
];

interface Props { profile: Profile; onSaveProfile: (p: Profile) => void; theme: Theme; onTheme: (t: Theme) => void; auth: Auth; unsynced: number }

export function Settings({ profile, onSaveProfile, theme, onTheme, auth, unsynced }: Props) {
  const [draft, setDraft] = useState<Profile>(profile);
  const [saved, setSaved] = useState(false);
  const error = validateProfile(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  const field = (k: keyof Profile, label: string, type = "text", hint?: string) => (
    <label className="field">{label}
      <input type={type} value={draft[k]} inputMode={k === "phone" ? "tel" : k === "email" ? "email" : undefined}
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

      <form className="card form" onSubmit={(e) => { e.preventDefault(); if (!error) { onSaveProfile(draft); setSaved(true); } }}>
        <h2>Your profile</h2>
        <p className="small">Your name and job title are printed on every report you download.</p>
        {field("name", "Full name")}
        {field("jobTitle", "Job title")}
        {field("email", "Email (optional)", "email")}
        {field("phone", "Phone (optional)", "tel")}
        <p className="small">Reports will say: Prepared by {draft.name.trim() || "…"}, {roleLine(draft)}</p>
        {dirty && error && <p className="warn" role="alert">{error}</p>}
        {saved && !dirty && <p className="saved" role="status">Profile saved.</p>}
        <button className="btn" type="submit" disabled={!dirty || !!error}>Save profile</button>
      </form>

      <AccountSection auth={auth} unsynced={unsynced} />

      <section className="card">
        <h2>About</h2>
        <div className="setrow"><div>AudEx<small>Housekeeping audits for WPC Health Care Division</small></div></div>
        <div className="setrow"><span>Version</span><strong>{__APP_INFO__.version}</strong></div>
        <div className="setrow"><span>Build</span><code>{__APP_INFO__.build}</code></div>
        <div className="setrow"><span>Built on</span><time dateTime={__APP_INFO__.builtAt}>{new Date(__APP_INFO__.builtAt).toLocaleString(undefined, {
          year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
        })}</time></div>
        <div className="setrow developer-credit">
          <img src="/logo/mrh-digital-badge.webp" alt="Mr. H Digital logo" width={64} height={64} loading="lazy" />
          <div><small>Developed by</small><strong>Mr. H Digital</strong></div>
        </div>
      </section>
    </div>
  );
}
