import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Navigation, type Page } from "./Navigation";
import { PageHeading } from "./PageHeading";

describe("workspace navigation", () => {
  it.each<Page>(["audit", "sites", "dashboard", "settings"])("marks only %s as the current page", (page) => {
    const html = renderToStaticMarkup(<Navigation page={page} onNavigate={() => {}} />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    const activeButton = html.match(/<button[^>]*aria-current="page"[^>]*>.*?<\/button>/)?.[0];
    expect(activeButton).toContain(`<span>${page.charAt(0).toUpperCase() + page.slice(1)}</span>`);
    for (const label of ["Audit", "Sites", "Dashboard", "Settings"]) {
      expect(html).toContain(`<span>${label}</span>`);
    }
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(4);
    expect(html).toContain('aria-label="Main"');
  });

  it("renders a page title and supporting description", () => {
    const html = renderToStaticMarkup(<PageHeading title="Sites" description="Manage your facilities." />);
    expect(html).toContain('<h1 tabindex="-1" class="pagetitle">Sites</h1>');
    expect(html).toContain("Manage your facilities.");
  });
});
