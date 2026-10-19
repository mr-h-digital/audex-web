import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useDashboardData, type RealData } from "./useDashboardData";

function Probe({ real, demo = false }: { real: RealData; demo?: boolean }) {
  const data = useDashboardData("2026-10-19", real, demo);
  return <span>{JSON.stringify({ demo: data.demo, sites: data.sites, audits: data.audits.length })}</span>;
}
describe("account dashboard data", () => {
  it("keeps an empty account empty instead of silently showing demo records", () => {
    const html = renderToStaticMarkup(<Probe real={{ sites: [], audits: [], trainings: [] }} />);
    expect(html).toContain("&quot;demo&quot;:false");
    expect(html).toContain("&quot;audits&quot;:0");
  });
  it("uses real sites and offers demo records only when explicitly requested", () => {
    const real = { sites: [{ id: "own", name: "Own clinic" }], audits: [], trainings: [] };
    expect(renderToStaticMarkup(<Probe real={real} />)).toContain("Own clinic");
    expect(renderToStaticMarkup(<Probe real={real} demo />)).toContain("&quot;demo&quot;:true");
  });
});
