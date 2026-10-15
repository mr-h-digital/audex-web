import { describe, expect, it } from "vitest";
import { applyTheme, parseTheme } from "../theme/theme";
import { DEFAULT_PROFILE, roleLine, validateProfile } from "./store";

describe("profile", () => {
  it("defaults to Chernay and reads as a report byline", () => {
    expect(DEFAULT_PROFILE.name).toBe("Chernay Hildebrandt");
    expect(roleLine(DEFAULT_PROFILE)).toBe("Housekeeping Trainer, Western Province Caterers (Health Care Division)");
  });
  it("needs a name and a sensible email", () => {
    expect(validateProfile({ ...DEFAULT_PROFILE, name: "  " })).toMatch(/name/i);
    expect(validateProfile({ ...DEFAULT_PROFILE, email: "nope" })).toMatch(/email/i);
    expect(validateProfile({ ...DEFAULT_PROFILE, email: "chernay@example.com" })).toBeNull();
    expect(validateProfile(DEFAULT_PROFILE)).toBeNull();
  });
  it("drops an empty job title from the byline", () => {
    expect(roleLine({ ...DEFAULT_PROFILE, jobTitle: "" })).toBe("Western Province Caterers (Health Care Division)");
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
