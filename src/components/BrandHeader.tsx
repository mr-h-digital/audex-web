import type { ReactNode } from "react";

/** App bar: white AudEx lockup on brand teal, with room for controls on the right. WebP first, PNG for old browsers. */
export function BrandHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="brand-header">
      <picture>
        <source srcSet="/logo/audex-lockup-white.webp" type="image/webp" />
        <img className="brand-header__logo" src="/logo/audex-lockup-white.png" alt="AudEx" height={36} width={139} />
      </picture>
      <div className="brand-header__tools">{children}</div>
    </header>
  );
}
