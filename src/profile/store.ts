import { useCallback, useState } from "react";
import { useAccountStore } from "../sync/accountStore";

/** Who is doing the audits. Report preferences are stored separately for each local account. */
export interface Profile { name: string; jobTitle: string; email: string; phone: string; organisation?: string }

export const DEFAULT_PROFILE: Profile = { name: "", jobTitle: "", email: "", phone: "", organisation: "" };

export const roleLine = (p: Profile): string => [p.jobTitle.trim(), p.organisation?.trim()].filter(Boolean).join(", ");

/** Returns a message for the first problem, or null when the profile can be saved. */
export function validateProfile(p: Profile): string | null {
  if (!p.name.trim()) return "Please enter your name. It appears on every report.";
  if (p.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) return "That email address does not look right.";
  return null;
}

const clean = (p: Profile): Profile => ({ name: p.name.trim(), jobTitle: p.jobTitle.trim(), email: p.email.trim(), phone: p.phone.trim(), organisation: p.organisation?.trim() ?? "" });

function read(key: string): Profile {
  try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(key) ?? "{}") }; } catch { return DEFAULT_PROFILE; }
}

export function useProfile(): [Profile, (p: Profile) => boolean, string] {
  const { store } = useAccountStore();
  const key = `audex.profile.account.${encodeURIComponent(store.account)}`;
  const [profile, setProfile] = useState<Profile>(() => read(key));
  const [error, setError] = useState("");
  const save = useCallback((p: Profile) => {
    const next = clean(p);
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { setError("Your report profile could not be saved on this device. Keep these details and retry before closing the app."); return false; }
    setProfile(next); setError(""); return true;
  }, [key]);
  return [profile, save, error];
}
