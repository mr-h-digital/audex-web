export const MIN_PASSWORD = 10;

export interface Check { ok: boolean; label: string }

/** Live hints while someone types a new password. The server makes the final decision (and rejects common passwords). */
export function passwordChecks(pw: string): Check[] {
  return [
    { ok: pw.length >= MIN_PASSWORD, label: `At least ${MIN_PASSWORD} characters` },
    { ok: pw.length > 0 && !/^(.)\1+$/.test(pw), label: "Not the same character repeated" },
  ];
}

/** First problem with a new-password pair, or null when it can be sent. */
export function newPasswordProblem(pw: string, again: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Your new password needs at least ${MIN_PASSWORD} characters. A few words joined together works well.`;
  if (pw.length > 128) return "That password is too long (128 characters at most).";
  if (pw !== again) return "The two passwords are not the same.";
  return null;
}
