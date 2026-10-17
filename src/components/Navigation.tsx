export type Page = "audit" | "sites" | "dashboard" | "settings";

const ITEMS: { id: Page; label: string; path: string }[] = [
  { id: "audit", label: "Audit", path: "M9 5H5v16h14V5h-4 M9 3h6v4H9z M8 12h8 M8 16h5" },
  { id: "sites", label: "Sites", path: "M4 21V7h10v14 M14 11h6v10 M2 21h20 M7 10h4 M7 14h4 M8 21v-3h2v3 M17 14h1 M17 17h1" },
  { id: "dashboard", label: "Dashboard", path: "M4 20V10h4v10z M10 20V4h4v16z M16 20v-7h4v7z" },
  { id: "settings", label: "Settings", path: "M4 7h4 M12 7h8 M4 17h8 M16 17h4 M8 4v6h4V4z M12 14v6h4v-6z" },
];

export function Navigation({ page, onNavigate }: { page: Page; onNavigate: (page: Page) => void }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <span className="tabbar__heading">Workspace</span>
      {ITEMS.map(({ id, label, path }) => (
        <button key={id} className={id === "settings" ? "tabbar__settings" : undefined} type="button"
          aria-current={page === id ? "page" : undefined} onClick={() => onNavigate(id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={path} />
          </svg>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
