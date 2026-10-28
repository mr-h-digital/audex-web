import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { useAccountStore } from "../sync/accountStore";

interface PendingForm { save: () => boolean; discard: () => void }
interface Guard { register: (id: string, form: PendingForm | null) => void; navigate: (action: () => void) => void }
const Context = createContext<Guard>({ register: () => {}, navigate: action => action() });

export function UnsavedChanges({ children }: { children: ReactNode }) {
  const { store } = useAccountStore();
  const forms = useRef(new Map<string, PendingForm>());
  const [next, setNext] = useState<(() => void) | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const register = useCallback((id: string, form: PendingForm | null) => {
    if (form) forms.current.set(id, form); else forms.current.delete(id);
  }, []);
  const navigate = useCallback((action: () => void) => {
    if (!forms.current.size) action();
    else { setError(""); setNext(() => action); }
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (forms.current.size) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const proceed = () => { const action = next; forms.current.clear(); setNext(null); action?.(); };
  return <Context.Provider value={{ register, navigate }}>{children}
    {next && <ConfirmDialog title="Keep your unsaved changes?" onCancel={() => { if (!saving) setNext(null); }}>
      <p>Your form has changes that have not been saved. Audit answers are saved separately as you work.</p>
      {error && <p className="warn" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn btn--ghost" disabled={saving} autoFocus onClick={() => setNext(null)}>Stay here</button>
        <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => {
          for (const form of forms.current.values()) form.discard();
          proceed();
        }}>Discard changes</button>
        <button type="button" className="btn" disabled={saving} onClick={async () => {
          for (const form of [...forms.current.values()]) {
            if (!form.save()) { setError("Some changes could not be saved. Stay here to check the required fields and your editing access."); return; }
          }
          setSaving(true);
          try { await store.retryPersistence(); proceed(); }
          catch { setError("Device storage could not save your changes. Stay here, keep this page open and retry the save."); }
          finally { setSaving(false); }
        }}>{saving ? "Saving..." : "Save and continue"}</button>
      </div>
    </ConfirmDialog>}
  </Context.Provider>;
}

export const useNavigationGuard = () => useContext(Context).navigate;

export function useUnsavedForm(dirty: boolean, save: () => boolean, discard: () => void) {
  const { register } = useContext(Context);
  const id = useId();
  const latest = useRef({ save, discard }); latest.current = { save, discard };
  useEffect(() => {
    register(id, dirty ? { save: () => latest.current.save(), discard: () => latest.current.discard() } : null);
    return () => register(id, null);
  }, [dirty, id, register]);
}
