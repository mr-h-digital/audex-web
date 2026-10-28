import { useEffect, useRef, type ReactNode } from "react";

/** App bar: white AudEx lockup on brand teal, with room for controls on the right. WebP first, PNG for old browsers. */
export function BrandHeader({ children }: { children?: ReactNode }) {
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = header.current!;
    const update = () => document.documentElement.style.setProperty("--workspace-header-height", `${Math.ceil(element.getBoundingClientRect().height)}px`);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--workspace-header-height"); };
  }, []);
  return (
    <header ref={header} className="brand-header">
      <picture>
        <source srcSet="/logo/audex-lockup-white.webp" type="image/webp" />
        <img className="brand-header__logo" src="/logo/audex-lockup-white.png" alt="AudEx" height={36} width={139} />
      </picture>
      <div className="brand-header__tools">{children}</div>
    </header>
  );
}
