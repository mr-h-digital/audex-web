import { useState } from "react";
import { useBilling } from "./BillingProvider";
import { useAccountStore } from "../sync/accountStore";

export function BillingPanel() {
  const b = useBilling();
  const { data, store } = useAccountStore();
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [candidate, setCandidate] = useState(""), [reason, setReason] = useState("");
  if (b.legacy) return null;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); await b.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Billing request failed. Please retry."); }
    finally { setBusy(false); }
  };
  const navigate = (url: string) => {
    const target = new URL(url);
    if (target.protocol !== "https:" || !(target.hostname === "paystack.com" || target.hostname.endsWith(".paystack.com"))) throw new Error("Unexpected payment destination.");
    window.location.assign(target.href);
  };
  const a = b.access;
  return <section className="card form" aria-labelledby="billing-title">
    <h2 id="billing-title">Your AudEx subscription</h2>
    <details><summary>Downloaded data export (advanced)</summary><button className="chip" type="button" onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ accountId: store.account, exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `audex-account-${store.account}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>Export downloaded account data (JSON)</button>
    <p className="small">Includes local drafts, sites, training and audit metadata, not image files. Save photos individually from each audit; finalised audits also have PDF export. This JSON export is not a full backup or automatic restore.</p></details>
    {b.testMode && <p className="banner">Payment test mode: use Paystack test cards only. No live purchase is available in this environment.</p>}
    <p><strong>{a ? { COMPLIMENTARY: "Complimentary full access", TRIAL: "14-day trial", SOLO: "Solo", PROFESSIONAL: "Professional" }[a.plan] : "Checking access"}</strong>
      {a?.administrator && " - platform administrator"}</p>
    {a && <dl className="review-list access-summary">
      <div><dt>Editing</dt><dd>{b.writable ? "Available" : "Read-only; records preserved"}</dd></div>
      <div><dt>Active sites</dt><dd>{a.activeSites} / {a.plan === "COMPLIMENTARY" ? "unlimited" : a.siteLimit}</dd></div>
      <div><dt>Photo storage</dt><dd>{a.usageKnown ? `${(a.usedBytes / 1_000_000).toFixed(1)} MB used` : "Requires administrator reconciliation"}</dd></div>
      {a.plan !== "COMPLIMENTARY" && <><div><dt>Site allowance used</dt><dd><progress aria-label="Active-site allowance used" value={a.activeSites} max={a.siteLimit} /></dd></div>
        {a.usageKnown && <div><dt>Photo allowance</dt><dd>{(a.storageBytes / 1_000_000).toLocaleString()} MB<progress aria-label="Photo allowance used" value={Math.min(a.usedBytes, a.storageBytes)} max={a.storageBytes} /></dd></div>}</>}
      {a.accessUntil && <div><dt>Access ends</dt><dd>{new Date(a.accessUntil).toLocaleString()}</dd></div>}
      {b.writable && <div><dt>Reconnect by</dt><dd>{new Date(a.offlineUntil).toLocaleString()} to refresh offline editing</dd></div>}
    </dl>}
    {a && !a.verified && <><p>Verify the email address in your account before creating work or paying. Check your inbox and junk folder.</p>
      <button className="btn" disabled={busy} onClick={() => void run(async () => setMessage((await b.request<{ message: string }>("/verification", {})).message))}>Send verification email</button></>}
    {!b.writable && <p className="warn">Read-only: your existing audits, reports and drafts remain on this device. Refresh access or renew to edit again.</p>}
    <button className="chip" disabled={busy || b.loading} onClick={() => void run(async () => {
      if (b.checkoutEnabled) setMessage((await b.request<{ message: string }>("/refresh", {})).message);
    })}>Refresh billing and offline access</button>
    {a?.plan !== "COMPLIMENTARY" && <>
      <label className="field"><span><input type="checkbox" checked={annual} onChange={(e) => setAnnual(e.target.checked)} /> Annual billing (pay for 10 months)</span></label>
      {([{ plan: "SOLO", name: "Solo", monthly: 199, sites: 3, storage: "1 GB" }, { plan: "PROFESSIONAL", name: "Professional", monthly: 399, sites: 15, storage: "5 GB" }] as const).map((p) =>
        <div className="card form" key={p.plan}>
          <h3>{p.name} - R{(p.monthly * (annual ? 10 : 1)).toLocaleString("en-ZA")} / {annual ? "year" : "month"}</h3>
          <p>{p.sites} active sites. {p.storage} photo storage. All core audit and reporting tools.</p>
          <button className="btn" disabled={busy || !a?.verified || !b.checkoutEnabled} onClick={() => void run(async () => {
            const choice = `${p.name} at R${p.monthly * (annual ? 10 : 1)} charged ${annual ? "annually" : "monthly"}`;
            if (!window.confirm(`Continue to ${b.testMode ? "TEST " : ""}Paystack checkout for ${choice}? This renews automatically until cancelled. Charges do not include VAT because Mr. H Digital is not VAT registered.`)) return;
            const result = await b.request<{ url: string; testMode: boolean }>("/checkout", { plan: p.plan, cadence: annual ? "annually" : "monthly" });
            navigate(result.url);
          })}>{b.testMode ? "Test checkout" : "Choose"} {p.name}</button>
        </div>)}
      {!b.checkoutEnabled && <p>Checkout is not enabled yet. Contact <a href="mailto:info@mrhdigital.co.za">Mr. H Digital</a> for availability.</p>}
      <p className="small">Prices are charged without VAT; Mr. H Digital is not VAT registered. One account per person. Team plans are enquiry-only. No card is required for the 14-day trial. Paid plans renew automatically until cancelled. Cancel future renewal below; paid access continues to expiry. Plan changes take effect by choosing a new subscription after your current paid period ends. Data is not deleted on expiry; back up important exports.</p>
    </>}
    {b.subscriptions.map((s) => <div className="form" key={s.code}>
      <p className="small">Subscription {s.code}: {s.cancel_requested ? "renewal cancelled" : "recurring billing enabled"}</p>
      <button className="chip" disabled={busy} onClick={() => void run(async () => navigate((await b.request<{ url: string }>("/manage", { code: s.code })).url))}>Manage card and subscription</button>
      {!s.cancel_requested && <button className="btn btn--ghost" disabled={busy} onClick={() => void run(async () => {
        if (window.confirm("Cancel future renewal? Existing paid access continues until expiry.")) setMessage((await b.request<{ message: string }>("/cancel", { code: s.code })).message);
      })}>Cancel renewal</button>}
    </div>)}
    {a?.administrator && <form className="form" onSubmit={(e) => {
      e.preventDefault(); void run(async () => setMessage((await b.request<{ message: string }>("/admin/grants", { userId: candidate.trim(), reason: reason.trim() })).message));
    }}>
      <h3>Existing-account complimentary grant</h3>
      <p className="small">Only the pre-rollout trainer candidate can be granted access after their email ownership is verified. A grant does not give the trainer administrator access.</p>
      <label className="field">Verified account UUID<input required value={candidate} onChange={(e) => setCandidate(e.target.value)} /></label>
      <label className="field">Ownership-verification reason<input required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <button className="btn" disabled={busy}>Grant complimentary access</button>
    </form>}
    {(error || b.error) && <p role="alert" className="warn">{error || b.error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
