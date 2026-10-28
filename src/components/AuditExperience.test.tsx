import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerOptions, ANSWER_OPTIONS } from "./AnswerOptions";
import { ScorePanel } from "./ScorePanel";
import { auditSaveLabel, itemComplete, sectionProgress } from "../audits/progress";
import { newAudit, scoreOf } from "../audits/store";
import { ruleSet } from "../scoring/catalog";
import { selectionForFacility } from "../facilities/FacilitySelection";

describe("audit visual feedback", () => {
  it("counts required explanations as unfinished without changing answered totals", () => {
    const audit = { answers: { a: "COMPLIANT", b: "NA", c: "PARTIALLY_COMPLIANT" } as const, naReasons: { b: " " } };
    const items = ["a", "b", "c", "d"].map(key => ({ key }));
    expect(sectionProgress(audit, items)).toEqual({ answered: 3, complete: 2, reasonsNeeded: 1, total: 4, ready: false });
    expect(itemComplete(audit, "b")).toBe(false);
    expect(sectionProgress({ ...audit, answers: { ...audit.answers, d: "NON_COMPLIANT" }, naReasons: { b: "No applicable service" } }, items))
      .toEqual({ answered: 4, complete: 4, reasonsNeeded: 0, total: 4, ready: true });
  });

  it.each(ANSWER_OPTIONS)("shows exactly one explicit selected state for $label", option => {
    const html = renderToStaticMarkup(<AnswerOptions itemKey="check-1" answer={option.value} locked={false} onChange={() => {}} />);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html.match(/>Selected</g)).toHaveLength(1);
    expect(html).toContain("Partially compliant");
    expect(html).toContain("Not applicable");
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html).not.toContain('disabled=""');
  });

  it("unanswered checks have no selected default; final answers remain disabled", () => {
    expect(renderToStaticMarkup(<AnswerOptions itemKey="check" answer={undefined} locked={false} onChange={() => {}} />)).not.toContain('checked=""');
    expect(renderToStaticMarkup(<AnswerOptions itemKey="check" answer="NA" locked onChange={() => {}} />).match(/disabled=""/g)).toHaveLength(4);
  });

  it("distinguishes provisional results and required explanations from final results", () => {
    const audit = newAudit("a", { id: "s", name: "Clinic", unitManager: "", supervisor: "" }, "2026-10-28", "WPC_V1", undefined, selectionForFacility("CLINIC"));
    const score = scoreOf(audit), rules = ruleSet(audit.ruleSetCode);
    const html = renderToStaticMarkup(<ScorePanel score={score} rules={rules} draft answered={0} total={74} reasonsNeeded={2} />);
    expect(html).toContain("Provisional result");
    expect(html).toContain("0 of 74 answered");
    expect(html).toContain("2 not-applicable explanation(s) still required");
    expect(renderToStaticMarkup(<ScorePanel score={score} rules={rules} />)).toContain("Final audit result");
  });

  it("never describes local drafts as uploaded or backed up online", () => {
    expect(auditSaveLabel({ state: "draft", synced: true }, true)).toBe("Draft on this device only");
    expect(auditSaveLabel({ state: "final", synced: false }, true)).toContain("Upload pending");
    expect(auditSaveLabel({ state: "final", synced: true }, true)).toBe("Uploaded to your account");
    expect(auditSaveLabel({ state: "final", synced: false }, false)).toBe("Saved on this device");
  });
});
