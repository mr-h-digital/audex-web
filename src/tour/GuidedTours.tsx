import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Auth } from "../auth/useAuth";
import type { Page } from "../components/Navigation";
import { TOURS, type TourId } from "./catalog";
import { useTourPreference } from "./useTourPreference";
import "./tour.css";

interface Props { auth: Auth; page: Page; onNavigate: (page: Page) => void; busy: boolean }
type View = { kind: "welcome" } | { kind: "help" } | { kind: "tour"; id: TourId; index: number } | { kind: "done" } | null;

export function GuidedTours({ auth, page, onNavigate, busy }: Props) {
  const preference = useTourPreference(auth);
  const [view, setView] = useState<View>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const returnPage = useRef(page);
  const automatic = useRef(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const step = view?.kind === "tour" ? TOURS[view.id].steps[view.index] : null;

  useEffect(() => {
    if (preference.status === "NEW" && !automatic.current && !view && !busy && page === "audit") {
      automatic.current = true; setView({ kind: "welcome" });
    }
  }, [preference.status, busy, page, view]);

  useLayoutEffect(() => {
    if (!view) return;
    const previous = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      queueMicrotask(() => {
        if (document.querySelector(".tour-dialog[open]")) return;
        if (launcher.current) launcher.current.focus();
        else if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      });
    };
  }, [!!view]);

  useEffect(() => { title.current?.focus(); }, [view]);

  useEffect(() => {
    if (!step) { setRect(null); return; }
    onNavigate(step.page);
    let observer: ResizeObserver | undefined;
    let frame = requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
        ?? document.querySelector<HTMLElement>(`[data-tour="nav-${step.page}"]`);
      if (!target) { setRect(null); return; }
      target.scrollIntoView({ block: "center", behavior: "instant" });
      const measure = () => {
        const box = target.getBoundingClientRect();
        setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
      };
      measure();
      observer = new ResizeObserver(measure); observer.observe(target);
    });
    const reposition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = (document.querySelector(`[data-tour="${step.target}"]`)
          ?? document.querySelector(`[data-tour="nav-${step.page}"]`))?.getBoundingClientRect();
        setRect(box ? { top: box.top, left: box.left, width: box.width, height: box.height } : null);
      });
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [step, onNavigate]);

  const close = () => {
    if (view?.kind === "welcome" || (view?.kind === "tour" && view.id === "intro")) preference.save("SKIPPED");
    if (view?.kind === "tour" || view?.kind === "done") onNavigate(returnPage.current);
    setView(null);
  };
  const start = (id: TourId) => {
    automatic.current = true;
    returnPage.current = page;
    setView({ kind: "tour", id, index: 0 });
  };
  const finish = () => {
    if (view?.kind === "tour" && view.id === "intro") preference.save("COMPLETED");
    onNavigate(returnPage.current);
    setView({ kind: "done" });
  };
  const heading = view?.kind === "tour" ? step!.title : view?.kind === "help" ? "How can we help?" : view?.kind === "done" ? "You're ready to explore" : "Welcome to AudEx";

  return <>
    <button ref={launcher} type="button" className="chip tour-launcher" onClick={() => { automatic.current = true; setView({ kind: "help" }); }} aria-haspopup="dialog">Help</button>
    {preference.error && <div className="tour-notice" role="status">{preference.error} <button type="button" className="chip" onClick={() => void preference.retry()}>Retry tour sync</button></div>}
    {view && createPortal(<dialog ref={dialog} className="tour-dialog" aria-labelledby="tour-title" aria-describedby="tour-description"
      onCancel={(event) => { event.preventDefault(); close(); }}>
      {rect && <div className="tour-spotlight" aria-hidden="true" style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }} />}
      <section className={`tour-panel${step ? " tour-panel--step" : ""}`}>
        <div className="tour-topline"><span className="tour-eyebrow">{view.kind === "tour" ? `${TOURS[view.id].title} · ${view.index + 1} of ${TOURS[view.id].steps.length}` : "Your AudEx guide"}</span>
          <button type="button" className="chip" aria-label="Close guided tour" onClick={close}>Close</button></div>
        <h2 id="tour-title" ref={title} tabIndex={-1}>{heading}</h2>
        {view.kind === "welcome" && <>
          <p id="tour-description">Get to know your workspace with a short guided tour. Learn where to manage sites, complete audits and explore results.</p>
          <p className="tour-tip">You stay in control. Skip now and find every guide later under Help. No records will be added or changed.</p>
          <p className="small">Tours switch between pages. Finish any unsaved site or profile edits first; audit drafts stay saved.</p>
          <div className="tour-actions"><button type="button" className="btn btn--ghost" onClick={close}>Explore on my own</button><button type="button" className="btn" onClick={() => start("intro")}>Start tour</button></div>
        </>}
        {view.kind === "help" && <>
          <p id="tour-description">Take the full introduction or choose a focused guide. You can leave at any point.</p>
          <p className="small">Tours switch between pages. Finish any unsaved site or profile edits first; audit drafts stay saved.</p>
          <div className="tour-guides">{(Object.keys(TOURS) as TourId[]).map((id) => <button key={id} type="button" className="tour-guide" onClick={() => start(id)}>
            <strong>{id === "intro" ? "Take the introductory tour" : TOURS[id].title}</strong><span>{TOURS[id].summary}</span><small>{TOURS[id].steps.length} steps</small>
          </button>)}</div>
        </>}
        {view.kind === "tour" && step && <>
          <progress aria-label="Tour progress" max={TOURS[view.id].steps.length} value={view.index + 1} />
          <p id="tour-description" aria-live="polite">{step.description}</p>
          <p className="tour-tip">{step.tip}</p>
          <div className="tour-actions">
            <button type="button" className="btn btn--ghost" onClick={close}>Skip tour</button>
            <div><button type="button" className="chip" disabled={view.index === 0} onClick={() => setView({ ...view, index: view.index - 1 })}>Back</button>{" "}
              <button type="button" className="btn" onClick={() => view.index === TOURS[view.id].steps.length - 1 ? finish() : setView({ ...view, index: view.index + 1 })}>{view.index === TOURS[view.id].steps.length - 1 ? "Finish" : "Next"}</button></div>
          </div>
        </>}
        {view.kind === "done" && <>
          <p id="tour-description">Your workspace is ready. Open Help whenever you want a refresher or a guide to a specific feature.</p>
          <p className="tour-tip">Start by adding a site, then create your first audit when you are ready.</p>
          <div className="tour-actions"><button type="button" className="btn btn--ghost" onClick={() => setView({ kind: "help" })}>More guides</button><button type="button" className="btn" onClick={close}>Back to my workspace</button></div>
        </>}
      </section>
    </dialog>, document.body)}
  </>;
}
