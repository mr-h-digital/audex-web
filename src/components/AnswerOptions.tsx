import type { Result } from "../scoring/types";

export const ANSWER_OPTIONS: { value: Result; label: string; hint: string; cls: string }[] = [
  { value: "COMPLIANT", label: "Compliant", hint: "Fully meets the requirement", cls: "c" },
  { value: "PARTIALLY_COMPLIANT", label: "Partially compliant", hint: "Meets some requirements", cls: "p" },
  { value: "NON_COMPLIANT", label: "Non-compliant", hint: "Does not meet the requirement", cls: "n" },
  { value: "NA", label: "Not applicable", hint: "Does not apply here; explain why", cls: "na" },
];

export function AnswerOptions({ itemKey, answer, locked, onChange }: {
  itemKey: string; answer: Result | undefined; locked: boolean; onChange: (result: Result) => void;
}) {
  return <div className="opts">{ANSWER_OPTIONS.map(option => <label key={option.value}
    className={`opt opt--${option.cls}${answer === option.value ? " is-selected" : ""}`}>
    <input type="radio" name={itemKey} disabled={locked} checked={answer === option.value} onChange={() => onChange(option.value)} />
    <span className="opt__text"><strong>{option.label}</strong><small>{option.hint}</small>
      {answer === option.value && <span className="opt__selected">Selected</span>}</span>
  </label>)}</div>;
}
