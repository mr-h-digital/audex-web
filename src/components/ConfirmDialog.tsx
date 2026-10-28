import { useId, useLayoutEffect, useRef, type ReactNode } from "react";

export function ConfirmDialog({ title, children, onCancel }: { title: string; children: ReactNode; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={ref} className="workspace-dialog" aria-labelledby={id}
    onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <h2 id={id}>{title}</h2>
    {children}
  </dialog>;
}
