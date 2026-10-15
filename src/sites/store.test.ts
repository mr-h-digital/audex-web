import { describe, expect, it } from "vitest";
import { addSite, setArchived, updateSite } from "./store";

const d = { name: " Tygerberg Clinic ", address: "", unitManager: "", supervisor: "" };
describe("sites", () => {
  it("adds a trimmed site", () => expect(addSite([], d, "1")[0].name).toBe("Tygerberg Clinic"));
  it("ignores blank names and duplicates", () => {
    const l = addSite([], d, "1");
    expect(addSite(l, { ...d, name: "  " }, "2")).toHaveLength(1);
    expect(addSite(l, { ...d, name: "tygerberg clinic" }, "2")).toHaveLength(1);
  });
  it("allows re-using the name of an archived site", () => {
    const l = setArchived(addSite([], d, "1"), "1", true);
    expect(addSite(l, d, "2")).toHaveLength(2);
  });
  it("edits and archives", () => {
    const l = updateSite(addSite([], d, "1"), "1", { ...d, name: "Tygerberg", unitManager: "A. Smith", supervisor: "B. Jones" });
    expect(l[0]).toMatchObject({ name: "Tygerberg", unitManager: "A. Smith", supervisor: "B. Jones" });
    expect(setArchived(l, "1", true)[0].archived).toBe(true);
  });
});
