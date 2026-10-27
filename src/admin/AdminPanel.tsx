import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../auth/client";
import type { Auth } from "../auth/useAuth";
import { ROLE_LABELS, canChangeRole, canManage, type AccountRole, type AdminChange, type AdminEvent, type AdminPage, type AdminUser } from "./types";
import "./admin.css";

type Selection = { user: AdminUser; action: "SUSPEND" | "RESTORE" | "PROMOTE" | "DEMOTE" };
const ACTION_LABELS = { SUSPEND: "Suspend account", RESTORE: "Restore account", PROMOTE: "Appoint Admin", DEMOTE: "Remove Admin role" };
const EVENT_LABELS = { OWNER_BOOTSTRAPPED: "Owner activated by operator", ROLE_CHANGED: "Role changed", SUSPENDED: "Account suspended", RESTORED: "Account restored" };

export function AdminPanel({ auth }: { auth: Auth }) {
  const [role, setRole] = useState<AccountRole | null>(null);
  const [users, setUsers] = useState<AdminPage<AdminUser> | null>(null);
  const [events, setEvents] = useState<AdminPage<AdminEvent> | null>(null);
  const [search, setSearch] = useState(""), [appliedSearch, setAppliedSearch] = useState("");
  const [offset, setOffset] = useState(0), [eventOffset, setEventOffset] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [reason, setReason] = useState(""), [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const live = useRef(true);
  const revision = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const actionForm = useRef<HTMLFormElement>(null);
  const api = auth.api;
  const userId = auth.user?.id;

  const fail = useCallback((e: unknown) => {
    if (!live.current) return;
    setError(e instanceof Error ? e.message : "Account administration could not be loaded. Please retry.");
    if (e instanceof ApiError && e.status === 401) auth.goToSignIn("Your session has ended. Please sign in again.");
    if (e instanceof ApiError && e.status === 403) { setRole(null); setUsers(null); setEvents(null); }
  }, [auth.goToSignIn]);

  const load = useCallback(async (query: string, start: number, historyStart: number | null) => {
    if (!userId) return;
    const request = ++revision.current;
    setBusy(true); setError("");
    try {
      const access = await api.adminAccess();
      if (!live.current || request !== revision.current) return;
      setRole(access.role);
      if (access.role === "AUDITOR") { setUsers(null); setEvents(null); return; }
      const [directory, history] = await Promise.all([
        api.adminUsers(query, start),
        historyStart === null ? Promise.resolve(null) : api.adminEvents(historyStart),
      ]);
      if (!live.current || request !== revision.current) return;
      setUsers(directory); setEvents(history);
      setAppliedSearch(query); setOffset(start);
      if (historyStart !== null) setEventOffset(historyStart);
    } catch (e) { if (request === revision.current) fail(e); }
    finally { if (live.current && request === revision.current) setBusy(false); }
  }, [api, userId, fail]);

  useEffect(() => {
    live.current = true;
    void load("", 0, null);
    return () => { live.current = false; revision.current++; };
  }, [load]);

  useEffect(() => {
    if (selection) { actionForm.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); actionForm.current?.querySelector("textarea")?.focus(); }
  }, [selection]);

  const select = (value: Selection | null) => {
    setPassword(""); setReason(""); setConfirmed(false); setSelection(value); setError(""); setMessage("");
    if (!value) heading.current?.focus();
  };
  const submit = async () => {
    if (!selection || !reason.trim() || !password || !confirmed) return;
    const { user, action } = selection;
    const common = { revision: user.revision, reason: reason.trim(), currentPassword: password };
    const change: AdminChange = action === "PROMOTE" || action === "DEMOTE"
      ? { ...common, role: action === "PROMOTE" ? "ADMIN" : "AUDITOR" }
      : { ...common, disabled: action === "SUSPEND" };
    setPassword(""); setBusy(true); setError(""); setMessage("");
    try {
      await api.adminChange(user.id, change);
      if (!live.current) return;
      select(null);
      setMessage(`${ACTION_LABELS[action]}: ${user.username}. The account's server sessions and unused reset links were revoked.`);
      await load(appliedSearch, offset, events ? eventOffset : null);
    } catch (e) {
      fail(e);
      if (live.current && e instanceof ApiError && e.status === 409) { setSelection(null); heading.current?.focus(); }
    } finally { if (live.current) setBusy(false); }
  };

  if (!userId) return null;
  return <section className="card admin-panel" aria-labelledby="admin-title">
    <div className="card__head"><h2 id="admin-title" ref={heading} tabIndex={-1}>Account administration</h2>
      <button type="button" className="chip" disabled={busy} onClick={() => { select(null); void load(appliedSearch, offset, events ? eventOffset : null); }}>Refresh</button></div>
    <p className="small">{role ? `Your account role: ${ROLE_LABELS[role]}.` : busy ? "Checking account permissions..." : "Account permissions unavailable."} Account roles are separate from subscriptions and billing permissions.</p>
    {role === "AUDITOR" && <p className="small">Only the Owner and Admins can view the user directory. Your audits remain private to your account.</p>}
    {(role === "ADMIN" || role === "OWNER") && <>
      <p className="small">{role === "OWNER" ? "You can appoint or remove Admins and suspend or restore other accounts." : "You can suspend or restore ordinary Auditor accounts. Only the Owner can change roles or manage Admins."} User passwords, password hashes, sessions and audit records are not included in this directory.</p>
      <form className="admin-search" onSubmit={(e) => { e.preventDefault(); select(null); void load(search.trim(), 0, events ? eventOffset : null); }}>
        <label className="field">Find a user<input type="search" maxLength={120} value={search} disabled={busy}
          placeholder="Name, username or email" onChange={(e) => setSearch(e.target.value)} /></label>
        <button type="submit" className="btn" disabled={busy}>Search</button>
      </form>
      {users && <>
        <p className="small" role="status">{users.items.length ? `Showing users ${offset + 1}-${offset + users.items.length}${appliedSearch ? ` matching "${appliedSearch}"` : ""}.` : "No users found."}</p>
        <ul className="admin-users">{users.items.map((user) => <li key={user.id}>
          <div className="admin-user-heading"><strong>{user.displayName}</strong><span>{ROLE_LABELS[user.role]}{user.id === userId ? " (you)" : ""} · {user.disabled ? "Suspended" : "Active"}</span></div>
          <div>{user.username} · <span className="admin-wrap">{user.email}</span></div>
          <div className="small">Joined {new Date(user.createdAt).toLocaleDateString()} · Email {user.emailVerified ? "verified" : "not verified"}</div>
          <details><summary>Account ID</summary><code className="admin-wrap">{user.id}</code></details>
          <div className="admin-actions">
            {canManage(userId, role, user) && <button type="button" className="chip" disabled={busy || !!selection} onClick={() => select({ user, action: user.disabled ? "RESTORE" : "SUSPEND" })}>{user.disabled ? "Restore" : "Suspend"}</button>}
            {canChangeRole(userId, role, user) && <button type="button" className="chip" disabled={busy || !!selection} onClick={() => select({ user, action: user.role === "ADMIN" ? "DEMOTE" : "PROMOTE" })}>{user.role === "ADMIN" ? "Remove Admin role" : "Appoint Admin"}</button>}
          </div>
        </li>)}</ul>
        <div className="admin-pagination" aria-label="User directory pages"><button type="button" className="chip" disabled={busy || offset === 0 || !!selection} onClick={() => void load(appliedSearch, Math.max(0, offset - 25), events ? eventOffset : null)}>Previous users</button>
          <button type="button" className="chip" disabled={busy || !users.hasMore || !!selection} onClick={() => void load(appliedSearch, offset + 25, events ? eventOffset : null)}>Next users</button></div>
      </>}
      {selection && <form className="form admin-confirmation" ref={actionForm} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <h3>{ACTION_LABELS[selection.action]}: {selection.user.displayName}</h3>
        <p className="small">Account: {selection.user.username} ({selection.user.email}). This change is recorded in administrative history and signs this user out of the server.</p>
        {selection.action === "SUSPEND" && <p className="warn">Suspension blocks sign-in and future server requests. It does not erase their records, cancel subscriptions or remotely delete data already downloaded to offline devices.</p>}
        {selection.action === "PROMOTE" && <p className="warn">An Admin can view registered users and suspend or restore Auditors. This does not grant access to users' audits or billing privileges.</p>}
        <label className="field">Reason (do not enter passwords or other secrets)<textarea required maxLength={500} rows={3} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} /></label>
        <label className="field">Your current password<input type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} /></label>
        <label className="admin-check"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />I confirm this change is intended for {selection.user.username}.</label>
        <div className="admin-actions"><button type="button" className="btn btn--ghost" disabled={busy} onClick={() => select(null)}>Cancel</button><button type="submit" className="btn" disabled={busy || !confirmed || !reason.trim() || !password}>Confirm {ACTION_LABELS[selection.action].toLowerCase()}</button></div>
      </form>}
      <div className="admin-history">
        <h3>Administrative history</h3>
        <button type="button" className="chip" disabled={busy || !!selection} onClick={() => void load(appliedSearch, offset, events ? null : 0)}>{events ? "Hide history" : "View history"}</button>
        {events && <>
          {events.items.length === 0 && <p className="small">No administrative actions recorded.</p>}
          <ol className="admin-events">{events.items.map((event) => <li key={event.id}>
            <strong>{EVENT_LABELS[event.action]}</strong> · {new Date(event.createdAt).toLocaleString()}
            <div className="small admin-wrap">Actor: {event.actorId ?? "Deployment operator"}<br />Account: {event.targetId}</div>
            <div className="small">{ROLE_LABELS[event.previousRole]} → {ROLE_LABELS[event.nextRole]} · {event.previousDisabled ? "Suspended" : "Active"} → {event.nextDisabled ? "Suspended" : "Active"}</div>
            <p className="admin-wrap">{event.reason}</p>
          </li>)}</ol>
          <div className="admin-pagination" aria-label="Administrative history pages"><button type="button" className="chip" disabled={busy || eventOffset === 0 || !!selection} onClick={() => void load(appliedSearch, offset, Math.max(0, eventOffset - 25))}>Previous history</button>
            <button type="button" className="chip" disabled={busy || !events.hasMore || !!selection} onClick={() => void load(appliedSearch, offset, eventOffset + 25)}>Next history</button></div>
        </>}
      </div>
    </>}
    {busy && <p className="small" role="status">Working on your account administration request...</p>}
    {error && <p className="warn" role="alert">{error} Refresh the directory before retrying a change.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
