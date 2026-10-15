import { useState, type FormEvent } from "react";
import type { Auth } from "../../auth/useAuth";
import { newPasswordProblem } from "../../auth/password";
import { Hints, PasswordField, useAction } from "./AuthGate";

type Panel = null | "password" | "email" | "signout" | "signout-all";

/** The Account card in Settings. Without a server it just explains where data lives. */
export function AccountSection({ auth, unsynced }: { auth: Auth; unsynced: number }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [done, setDone] = useState("");
  const close = (msg = "") => { setPanel(null); setDone(msg); };

  if (!auth.enabled || !auth.user) {
    return (
      <section className="card">
        <h2>Account</h2>
        <div className="setrow"><div>Sign-in<small>Not needed yet. Sign-in switches on when the app is connected to its server.</small></div></div>
        <div className="setrow"><div>Where your data is kept<small>On this phone only.</small></div></div>
      </section>
    );
  }
  const u = auth.user;
  return (
    <section className="card">
      <h2>Account</h2>
      <div className="setrow"><div>Signed in as {u.displayName}<small>Username: {u.username} · {u.email}</small></div></div>
      <div className="setrow"><div>Where your data is kept<small>On this phone. Finished audits upload to the server whenever you have a connection.</small></div></div>
      {done && <p className="saved" role="status">{done}</p>}
      <div className="actions">
        <button type="button" className="btn btn--ghost" aria-expanded={panel === "password"} onClick={() => { setDone(""); setPanel(panel === "password" ? null : "password"); }}>Change password</button>
        <button type="button" className="btn btn--ghost" aria-expanded={panel === "email"} onClick={() => { setDone(""); setPanel(panel === "email" ? null : "email"); }}>Change email</button>
      </div>
      {panel === "password" && <ChangePassword auth={auth} onDone={close} />}
      {panel === "email" && <ChangeEmail auth={auth} onDone={close} />}
      <div className="actions">
        <button type="button" className="btn btn--ghost" onClick={() => { setDone(""); setPanel("signout"); }}>Sign out</button>
        <button type="button" className="btn btn--ghost" onClick={() => { setDone(""); setPanel("signout-all"); }}>Sign out everywhere</button>
      </div>
      {panel === "signout" && (
        <Confirm busyLabel="Signing out…" yes="Sign out" onCancel={() => close()} onYes={() => auth.signOut()}>
          {unsynced > 0
            ? <>{unsynced} finished audit{unsynced === 1 ? " has" : "s have"} not uploaded yet. {unsynced === 1 ? "It stays" : "They stay"} safe on this phone and will upload the next time you sign in. Sign out now?</>
            : <>Sign out of AudEx on this phone? Your audits stay on the phone.</>}
        </Confirm>)}
      {panel === "signout-all" && (
        <Confirm busyLabel="Signing out…" yes="Sign out everywhere" onCancel={() => close()} onYes={() => auth.signOutEverywhere()}>
          This signs you out on every phone and computer, including this one. Use it if a phone is lost. Audits stay on each phone and upload once you sign in again.
          {unsynced > 0 && <> {unsynced} audit{unsynced === 1 ? " has" : "s have"} not uploaded from this phone yet.</>}
        </Confirm>)}
    </section>
  );
}

function Confirm({ children, yes, busyLabel, onYes, onCancel }: { children: React.ReactNode; yes: string; busyLabel: string; onYes: () => Promise<void>; onCancel: () => void }) {
  const { busy, error, run } = useAction();
  return (
    <div className="confirm" role="alertdialog" aria-label="Please confirm">
      <p>{children}</p>
      {error && <p className="warn" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void run(onYes)}>{busy ? busyLabel : yes}</button>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ChangePassword({ auth, onDone }: { auth: Auth; onDone: (msg: string) => void }) {
  const [cur, setCur] = useState(""), [pw, setPw] = useState(""), [again, setAgain] = useState("");
  const { busy, error, setError, run } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = newPasswordProblem(pw, again);
    if (p) return setError(p);
    void run(async () => { await auth.api.changePassword(cur, pw); onDone("Password changed. Other phones and computers were signed out."); });
  };
  return (
    <form className="form subform" onSubmit={submit}>
      <PasswordField label="Current password" value={cur} onChange={setCur} autoComplete="current-password" />
      <PasswordField label="New password" value={pw} onChange={setPw} autoComplete="new-password" hint={<Hints pw={pw} />} />
      <PasswordField label="Type the new password again" value={again} onChange={setAgain} autoComplete="new-password" />
      {error && <p className="warn" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={busy || !cur || !pw}>{busy ? "Saving…" : "Save new password"}</button>
    </form>
  );
}

function ChangeEmail({ auth, onDone }: { auth: Auth; onDone: (msg: string) => void }) {
  const u = auth.user!;
  const [email, setEmail] = useState(u.email), [cur, setCur] = useState("");
  const { busy, error, run } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const me = await auth.api.updateMe({ displayName: u.displayName, email: email.trim(), phone: u.phone ?? "", currentPassword: cur });
      auth.setUser(me); onDone("Email address changed.");
    });
  };
  return (
    <form className="form subform" onSubmit={submit}>
      <p className="small">This is where username and password emails are sent, so make sure you can read it.</p>
      <label className="field">New email address
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" />
      </label>
      <PasswordField label="Current password (to confirm it is you)" value={cur} onChange={setCur} autoComplete="current-password" />
      {error && <p className="warn" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={busy || !cur || !email.trim() || email.trim().toLowerCase() === u.email.toLowerCase()}>{busy ? "Saving…" : "Save email"}</button>
    </form>
  );
}
