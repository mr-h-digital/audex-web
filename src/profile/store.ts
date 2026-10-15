import { useCallback, useEffect, useState } from "react";
import { REPORT_AUTHOR } from "../config";

export const EMPLOYER = "Western Province Caterers (Health Care Division)";

/** Who is doing the audits. Used as the author on every report. Stored on the phone until sign-in exists. */
export interface Profile { name: string; jobTitle: string; email: string; phone: string }

export const DEFAULT_PROFILE: Profile = { name: REPORT_AUTHOR, jobTitle: "Housekeeping Trainer", email: "", phone: "" };

export const roleLine = (p: Profile): string => [p.jobTitle.trim(), EMPLOYER].filter(Boolean).join(", ");

/** Returns a message for the first problem, or null when the profile can be saved. */
export function validateProfile(p: Profile): string | null {
  if (!p.name.trim()) return "Please enter your name. It appears on every report.";
  if (p.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) return "That email address does not look right.";
  return null;
}

const clean = (p: Profile): Profile => ({ name: p.name.trim(), jobTitle: p.jobTitle.trim(), email: p.email.trim(), phone: p.phone.trim() });

const KEY = "audex.profile.v1";
function read(): Profile {
  try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return DEFAULT_PROFILE; }
}

export function useProfile(): [Profile, (p: Profile) => void] {
  const [profile, setProfile] = useState<Profile>(read);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* storage unavailable */ } }, [profile]);
  const save = useCallback((p: Profile) => setProfile(clean(p)), []);
  return [profile, save];
}
