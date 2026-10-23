import { useState, type ReactNode } from "react";
import type { Auth } from "../../auth/useAuth";
import { useBilling } from "../../billing/BillingProvider";
import { Shell } from "../auth/AuthGate";

export function WorkspaceEntry({ auth, children }: { auth: Auth; children: ReactNode }) {
  const billing = useBilling();
  const [exploring, setExploring] = useState(false);
  if (auth.user && billing.access && !billing.access.verified && !exploring) {
    return <VerificationWelcome auth={auth} onExplore={() => setExploring(true)} />;
  }
  return <>{children}</>;
}

function VerificationWelcome({ auth, onExplore }: { auth: Auth; onExplore: () => void }) {
  const billing = useBilling();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [email, setEmail] = useState(auth.user?.email ?? ""), [password, setPassword] = useState("");
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : "We could not complete this request. Please retry."); }
    finally { setBusy(false); }
  };
  return <Shell title="Your workspace is almost ready">
    <div className="verification-symbol" aria-hidden="true">@</div>
    <p className="auth-intro">Check your inbox at <strong>{auth.user?.email}</strong> and follow the verification link to unlock your workspace.</p>
    <p className="small">Check your junk folder too. New trials begin when your email is verified; existing-account trial dates are shown in Settings.</p>
    <button className="btn" disabled={busy || billing.loading} onClick={() => void run(async () => {
      await billing.refresh();
    })}>I've verified my email</button>
    <button className="btn btn--ghost" disabled={busy} onClick={() => void run(async () => {
      setMessage((await billing.request<{ message: string }>("/verification", {})).message);
    })}>Resend verification email</button>
    <button className="linkbtn" onClick={() => setCorrecting(!correcting)} aria-expanded={correcting}>Need to correct your email address?</button>
    {correcting && <form className="form" onSubmit={(e) => {
      e.preventDefault();
      const user = auth.user;
      if (!user) return;
      void run(async () => {
        const updated = await auth.api.updateMe({ displayName: user.displayName, email: email.trim(), phone: user.phone ?? "", currentPassword: password });
        auth.setUser(updated); setPassword(""); setCorrecting(false);
        await billing.refresh();
        setMessage("Email updated. Use Resend verification email to send a link to your new address.");
      });
    }}>
      <label className="field">Correct email address<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field">Current password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button className="btn" disabled={busy}>Update email address</button>
    </form>}
    {(error || billing.error) && <p className="warn" role="alert">{error || billing.error}</p>}
    {message && <p className="saved" role="status">{message}</p>}
    <div className="onboarding-footer">
      <button className="linkbtn" onClick={onExplore}>Explore read-only for now</button>
      <button className="linkbtn" disabled={busy} onClick={() => void run(auth.signOut)}>Sign out</button>
    </div>
  </Shell>;
}
