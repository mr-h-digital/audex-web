/** Date helpers on ISO calendar dates (YYYY-MM-DD). All maths is in UTC so time zones and DST never shift a day. */
const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

const toMs = (d: string): number => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d: string, n: number): string => toIso(toMs(d) + n * DAY);
/** Whole days from b to a (a - b). */
export const diffDays = (a: string, b: string): number => Math.round((toMs(a) - toMs(b)) / DAY);
export const startOfMonth = (d: string): string => `${d.slice(0, 8)}01`;
export const startOfQuarter = (d: string): string => {
  const month = Math.floor((Number(d.slice(5, 7)) - 1) / 3) * 3 + 1;
  return `${d.slice(0, 4)}-${pad(month)}-01`;
};
export const startOfYear = (d: string): string => `${d.slice(0, 4)}-01-01`;
/** Monday of the week containing d. */
export const startOfWeek = (d: string): string => {
  const dow = new Date(toMs(d)).getUTCDay(); // 0 = Sunday
  return addDays(d, -((dow + 6) % 7));
};
export const meanDate = (dates: string[]): string =>
  toIso(Math.round(dates.reduce((s, d) => s + toMs(d), 0) / dates.length / DAY) * DAY);

export const fmtDate = (d: string): string => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
export const fmtShort = (d: string): string => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
export const fmtMonth = (d: string): string => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
export const fmtMonthShort = (d: string): string => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}`;

/** Today's calendar date in the user's local time zone. */
export const todayIso = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
};
