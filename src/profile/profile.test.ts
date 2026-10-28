import { describe, expect, it } from "vitest";
import { applyTheme, parseTheme } from "../theme/theme";
import { DEFAULT_PROFILE, roleLine, validateProfile } from "./store";

describe("profile", () => {
  it("starts without an assumed person, job title or employer", () => {
    expect(DEFAULT_PROFILE.name).toBe("");
    expect(roleLine(DEFAULT_PROFILE)).toBe("");
    expect(validateProfile(DEFAULT_PROFILE)).toMatch(/name/i);
    expect(roleLine({ ...DEFAULT_PROFILE, jobTitle: "Independent Auditor", organisation: " Example Services " })).toBe("Independent Auditor, Example Services");
  });
  it("needs a name and a sensible email", () => {
    expect(validateProfile({ ...DEFAULT_PROFILE, name: "  " })).toMatch(/name/i);
    expect(validateProfile({ ...DEFAULT_PROFILE, name: "Test Auditor", email: "nope" })).toMatch(/email/i);
    expect(validateProfile({ ...DEFAULT_PROFILE, name: "Test Auditor", email: "auditor@example.com" })).toBeNull();
  });
  it("drops an empty job title from the byline", () => {
    expect(roleLine({ ...DEFAULT_PROFILE, jobTitle: "", organisation: "Example Services" })).toBe("Example Services");
    expect(roleLine({ name: "Existing Auditor", jobTitle: "Trainer", email: "", phone: "" })).toBe("Trainer");
  });
});

describe("theme", () => {
  it("accepts only light, dark or system", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("purple")).toBe("system");
    expect(parseTheme(null)).toBe("system");
  });
  it("sets and clears the data-theme attribute", () => {
    const attrs = new Map<string, string>();
    const root = { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) } as unknown as HTMLElement;
    applyTheme("dark", root); expect(attrs.get("data-theme")).toBe("dark");
    applyTheme("system", root); expect(attrs.has("data-theme")).toBe(false);
  });
});
