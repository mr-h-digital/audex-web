import type { RuleSet, ScoreResult, Status } from "../scoring/types";
import { explain } from "../scoring/explain";

const LABEL: Record<Status, string> = {
  COMPLIANT: "Compliant",
  NOT_YET_COMPLIANT: "Not yet compliant",
  NON_COMPLIANT: "Non-compliant",
  INCOMPLETE: "Incomplete",
};

/** Live audit score for the phone: status, percentage and the reasons behind it. Works fully offline. */
export function ScorePanel({ score, rules, answered, total, draft = false, reasonsNeeded = 0 }: { score: ScoreResult; rules: RuleSet; answered?: number; total?: number; draft?: boolean; reasonsNeeded?: number }) {
  const reasons = explain(score, rules);
  return (
    <section className={`score score--${score.status.toLowerCase()}${draft ? " score--draft" : ""}`} aria-label={draft ? "Audit progress and provisional result" : "Final audit result"}>
      <div className="score__label">{draft ? "Provisional result · not finalised" : "Final audit result"}</div>
      <div className="score__row">
        <span className="score__pct">{score.possibleHalf === 0 ? "–" : `${score.percent}%`}</span>
        <span className="score__status">{LABEL[score.status]}</span>
      </div>
      {draft && <p className="score__disclaimer">Based on answers recorded so far. The result can change until all checks are complete.</p>}
      {reasons.length > 0 && (
        <details className="score__why">
          <summary>Why? ({reasons.length})</summary>
          <ul className="score__reasons">
            {reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </details>
      )}
      {answered !== undefined && total ? (
        <div className="score__progress">
          <div className="score__meta">{answered} of {total} answered</div>
          {reasonsNeeded > 0 && <p className="score__meta">{reasonsNeeded} not-applicable explanation(s) still required.</p>}
          <div className="pbar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered} aria-label="Items answered"><i style={{ width: `${(100 * answered) / total}%` }} /></div>
        </div>) : null}
    </section>
  );
}
