// Every <input type="date"> in this app stores/returns yyyy-mm-dd (the
// only format that element accepts) — but it also DISPLAYS as dd-mm-yyyy
// in this browser, since that's this locale's date order. Read-only date
// text elsewhere (tables, cards, summaries) was just printing that raw
// yyyy-mm-dd string, so it looked inconsistent with the very form field it
// came from. This is the one place that formatting decision lives — call
// it anywhere a stored date is shown as plain text, not inside a date
// input (which already renders correctly on its own and shouldn't be
// touched).
export function formatDateDMY(iso: string | undefined | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}-${mo}-${y}`;
}
