import { useEffect, useRef } from "react";

export function PageHeading({ title, description }: { title: string; description: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [title]);
  return (
    <header className="page-heading">
      <h1 ref={heading} tabIndex={-1} className="pagetitle">{title}</h1>
      <p className="small">{description}</p>
    </header>
  );
}
