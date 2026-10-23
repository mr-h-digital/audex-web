import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "../../auth/client";
import { newPasswordProblem, passwordChecks } from "../../auth/password";
import { resetTokenFromUrl } from "../../auth/session";
import { useAuth, type Auth } from "../../auth/useAuth";
import { useOnline } from "../../hooks/useOnline";
import { DEFAULT_PROFILE } from "../../profile/store";
import { BrandHeader } from "../BrandHeader";

type View = "signin" | "register" | "forgot-username" | "forgot-password";

/** Shows the app only to a signed-in person. When no server is configured the app opens as before. */
export function AuthGate({ children }: { children: (auth: Auth) => ReactNode }) {
  const auth = useAuth();
  const [view, setView] = useState<View>("signin");
  const [notice, setNotice] = useState<string | undefined>();
  const [resetToken, setResetToken] = useState<string | null>(() => (auth.enabled ? resetTokenFromUrl() : null));
  const [verificationToken, setVerificationToken] = useState<string | null>(() => {
    if (window.location.pathname !== "/verify-email") return null;
    return new URLSearchParams(window.location.hash.slice(1)).get("token");
  });
  useEffect(() => { if (verificationToken) history.replaceState(null, "", "/verify-email"); }, [verificationToken]);
  const [registration, setRegistration] = useState(false);
  useEffect(() => {
    if (!auth.enabled) return;
    let live = true;
    auth.api.status().then((s) => { if (live) setRegistration(!!s.registrationEnabled); }).catch(() => { /* Signup stays unavailable while status cannot be checked. */ });
    return () => { live = false; };
  }, [auth.enabled, auth.api]);

  if (!auth.enabled) return <>{children(auth)}</>;
  if (verificationToken) return <Shell title="Verify your email"><VerifyEmail auth={auth} token={verificationToken} onDone={() => {
    history.replaceState(null, "", "/"); setVerificationToken(null); setNotice("Email verified. Sign in to continue.");
  }} /></Shell>;

  if (resetToken) {
    return (
      <Shell title="Choose a new password">
        <ResetPassword auth={auth} token={resetToken}
          onNewLink={() => { history.replaceState(null, "", "/"); setResetToken(null); setView("forgot-password"); auth.goToSignIn(); }}
          onDone={(msg) => { history.replaceState(null, "", "/"); setResetToken(null); setView("signin"); setNotice(msg); auth.goToSignIn(msg); }} />
      </Shell>
    );
  }
  if (auth.phase.name === "in") return <>{children(auth)}</>;
  if (auth.phase.name === "loading") return <Shell title="One moment…"><p className="small" role="status">Getting ready…</p></Shell>;
  if (auth.phase.name === "setup") return <Shell title="Welcome to AudEx"><Setup auth={auth} /></Shell>;

  if (auth.phase.name !== "signedOut") return null;
  const shownNotice = notice ?? auth.phase.notice;
  const offline = auth.phase.offline;
  return (
    <Shell title={view === "signin" ? "Sign in" : view === "register" ? "Start your 14-day trial" : view === "forgot-username" ? "Find my username" : "Reset my password"}>
      {view === "signin" && <SignIn auth={auth} notice={shownNotice} offline={offline} onForgotUser={() => { setNotice(undefined); setView("forgot-username"); }} onForgotPass={() => { setNotice(undefined); setView("forgot-password"); }} />}
      {view === "signin" && registration && <button className="btn btn--ghost" type="button" onClick={() => setView("register")}>Create an account</button>}
      {view === "register" && <Register auth={auth} onBack={() => setView("signin")} />}
      {view === "forgot-username" && <ForgotUsername auth={auth} onBack={() => setView("signin")} />}
      {view === "forgot-password" && <ForgotPassword auth={auth} onBack={() => setView("signin")} />}
    </Shell>
  );
}

function VerifyEmail({ auth, token, onDone }: { auth: Auth; token: string; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [message, setMessage] = useState("");
  return <div className="form">
    <p>Confirm this request to verify the email address associated with this link. Verification does not grant administrator access.</p>
    {error && <p className="warn" role="alert">{error}</p>}
    {message ? <><p role="status">{message}</p><button className="btn" onClick={onDone}>Continue to AudEx</button></>
      : <button className="btn" disabled={busy} onClick={() => void run(async () => setMessage((await auth.api.verifyEmail(token)).message))}>Verify my email</button>}
  </div>;
}

function Register({ auth, onBack }: { auth: Auth; onBack: () => void }) {
  const [f, setF] = useState({ displayName: "", username: "", email: "", password: "", again: "" });
  const { busy, error, setError, run } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = newPasswordProblem(f.password, f.again);
    if (problem) { setError(problem); return; }
    void run(async () => auth.signIn(await auth.api.register({ username: f.username.trim(), displayName: f.displayName.trim(), email: f.email.trim(), password: f.password })));
  };
  return <form className="form" onSubmit={submit}>
    <p>No card required. Verify your email to begin: one active site, 100 MB of photos and all core audit and reporting tools for 14 days.</p>
    {(["displayName", "username", "email"] as const).map((key) => <label className="field" key={key}>
      {{ displayName: "Your full name", username: "Choose a username", email: "Email address" }[key]}
      <input required type={key === "email" ? "email" : "text"} autoComplete={key === "displayName" ? "name" : key}
        maxLength={key === "username" ? 32 : 200} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </label>)}
    <PasswordField label="Password" value={f.password} onChange={(password) => setF({ ...f, password })} autoComplete="new-password" hint={<Hints pw={f.password} />} />
    <PasswordField label="Repeat password" value={f.again} onChange={(again) => setF({ ...f, again })} autoComplete="new-password" />
    <p className="small">Individual accounts only. Team and organisation plans are available by enquiry. Prices are charged without VAT; Mr. H Digital is not VAT registered.</p>
    {error && <p className="warn" role="alert">{error}</p>}
    <button className="btn" type="submit" disabled={busy}>{busy ? "Creating account..." : "Create account and email verification link"}</button>
    <button className="linkbtn" type="button" onClick={onBack}>Back to sign in</button>
  </form>;
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="app authpage">
      <BrandHeader />
      <section className="card form authcard"><h1 className="pagetitle">{title}</h1>{children}</section>
    </main>
  );
}

export function PasswordField({ label, value, onChange, autoComplete, hint }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <label className="field">{label}
      <span className="pwrow">
        <input type={show ? "text" : "password"} value={value} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="pwtoggle" aria-pressed={show} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
      </span>
      {hint}
    </label>
  );
}

export function Hints({ pw }: { pw: string }) {
  return (
    <ul className="hints" aria-label="Password tips">
      {passwordChecks(pw).map((c) => <li key={c.label} className={c.ok ? "ok" : ""}><span aria-hidden>{c.ok ? "✓" : "○"}</span> {c.label}</li>)}
      <li className="plain">Tip: a few ordinary words together, like “blue kettle morning walk”, is easy to remember and hard to guess.</li>
    </ul>
  );
}

/** Runs a server call with a busy flag and a plain error message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };
  return { busy, error, setError, run };
}

function SignIn({ auth, notice, offline, onForgotUser, onForgotPass }: { auth: Auth; notice?: string; offline?: boolean; onForgotUser: () => void; onForgotPass: () => void }) {
  const [username, setUsername] = useState(""), [password, setPassword] = useState("");
  const { busy, error, run } = useAction();
  const online = useOnline();
  const submit = (e: FormEvent) => { e.preventDefault(); void run(async () => { auth.signIn(await auth.api.login(username.trim(), password)); }); };
  return (
    <form className="form" onSubmit={submit}>
      {notice && <p className="saved" role="status">{notice}</p>}
      {(!online || offline) && <p className="small" role="status">Connect to sign in. Offline editing requires a current entitlement; existing downloaded records remain available to read.</p>}
      <label className="field">Username
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </label>
      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
      {error && <p className="warn" role="alert">{error}</p>}
      <button className="btn btn--wide" type="submit" disabled={busy || !username.trim() || !password}>{busy ? "Signing in…" : "Sign in"}</button>
      <div className="linkrow">
        <button type="button" className="linkbtn" onClick={onForgotUser}>Forgot my username</button>
        <button type="button" className="linkbtn" onClick={onForgotPass}>Forgot my password</button>
      </div>
    </form>
  );
}

function Setup({ auth }: { auth: Auth }) {
  const [f, setF] = useState({ code: "", displayName: DEFAULT_PROFILE.name, username: "", email: "", password: "", again: "" });
  const { busy, error, setError, run } = useAction();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: keyof typeof f, label: string, extra: { type?: string; ac?: string; hint?: string } = {}) => (
    <label className="field">{label}
      <input type={extra.type ?? "text"} value={f[k]} autoComplete={extra.ac} autoCapitalize={k === "displayName" ? "words" : "none"} autoCorrect="off" spellCheck={false}
        onChange={(e) => set(k)(e.target.value)} />
      {extra.hint && <span className="small">{extra.hint}</span>}
    </label>
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = newPasswordProblem(f.password, f.again);
    if (p) return setError(p);
    void run(async () => { auth.signIn(await auth.api.setup({ code: f.code, username: f.username.trim(), email: f.email.trim(), displayName: f.displayName.trim(), password: f.password })); });
  };
  return (
    <form className="form" onSubmit={submit}>
      <p className="small">This is the first time AudEx has been opened on this server. Create your account. You will need the setup code from whoever installed the app.</p>
      {text("code", "Setup code")}
      {text("displayName", "Your full name", { ac: "name", hint: "Printed on every report." })}
      {text("username", "Choose a username", { ac: "username", hint: "3 to 32 letters or numbers. You type this each time you sign in." })}
      {text("email", "Email address", { type: "email", ac: "email", hint: "Used for account verification, recovery and billing." })}
      <PasswordField label="Choose a password" value={f.password} onChange={set("password")} autoComplete="new-password" hint={<Hints pw={f.password} />} />
      <PasswordField label="Type the password again" value={f.again} onChange={set("again")} autoComplete="new-password" />
      {error && <p className="warn" role="alert">{error}</p>}
      <button className="btn btn--wide" type="submit" disabled={busy || !f.code.trim() || !f.username.trim() || !f.email.trim() || !f.displayName.trim() || !f.password}>{busy ? "Creating…" : "Create my account"}</button>
    </form>
  );
}

function Recovery({ intro, label, type, ac, submitLabel, send, onBack }: {
  intro: string; label: string; type?: string; ac: string; submitLabel: string; send: (v: string) => Promise<{ message: string }>; onBack: () => void;
}) {
  const [value, setValue] = useState(""), [done, setDone] = useState("");
  const { busy, error, run } = useAction();
  if (done) return (
    <div className="form">
      <p className="saved" role="status">{done}</p>
      <p className="small">The email can take a few minutes to arrive.</p>
      <button className="btn btn--wide" type="button" onClick={onBack}>Back to sign in</button>
    </div>
  );
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void run(async () => { setDone((await send(value.trim())).message); }); }}>
      <p className="small">{intro}</p>
      <label className="field">{label}
        <input type={type ?? "text"} value={value} onChange={(e) => setValue(e.target.value)} autoComplete={ac} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </label>
      {error && <p className="warn" role="alert">{error}</p>}
      <button className="btn btn--wide" type="submit" disabled={busy || !value.trim()}>{busy ? "Sending…" : submitLabel}</button>
      <button type="button" className="linkbtn" onClick={onBack}>Back to sign in</button>
    </form>
  );
}

function ForgotUsername({ auth, onBack }: { auth: Auth; onBack: () => void }) {
  return <Recovery intro="Enter the email address you signed up with and we will email your username." label="Email address" type="email" ac="email"
    submitLabel="Email me my username" send={(v) => auth.api.forgotUsername(v)} onBack={onBack} />;
}
function ForgotPassword({ auth, onBack }: { auth: Auth; onBack: () => void }) {
  return <Recovery intro="Enter your username or your email address and we will email you a link to choose a new password. The link works once and lasts 30 minutes."
    label="Username or email address" ac="username" submitLabel="Email me a reset link" send={(v) => auth.api.forgotPassword(v)} onBack={onBack} />;
}

function ResetPassword({ auth, token, onDone, onNewLink }: { auth: Auth; token: string; onDone: (msg: string) => void; onNewLink: () => void }) {
  const [pw, setPw] = useState(""), [again, setAgain] = useState("");
  const { busy, error, setError, run } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = newPasswordProblem(pw, again);
    if (p) return setError(p);
    void run(async () => { await auth.api.resetPassword(token, pw); onDone("Your password has been changed. Please sign in with it."); });
  };
  return (
    <form className="form" onSubmit={submit}>
      <PasswordField label="New password" value={pw} onChange={setPw} autoComplete="new-password" hint={<Hints pw={pw} />} />
      <PasswordField label="Type it again" value={again} onChange={setAgain} autoComplete="new-password" />
      {error && <p className="warn" role="alert">{error} {error.includes("expired") && <button type="button" className="linkbtn" onClick={onNewLink}>Ask for a new link</button>}</p>}
      <button className="btn btn--wide" type="submit" disabled={busy || !pw}>{busy ? "Saving…" : "Save new password"}</button>
    </form>
  );
}
