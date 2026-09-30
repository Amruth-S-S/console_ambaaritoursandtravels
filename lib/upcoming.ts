// Shared by the admin Upcoming Packages page and the Overview dashboard strip.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "2026-10" -> "October 2026" (or "Oct 2026" when short).
export function monthLabel(month: string, short = false): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month || "");
  if (!m) return month || "—";
  const name = MONTHS[Number(m[2]) - 1] || m[2];
  return `${short ? name.slice(0, 3) : name} ${m[1]}`;
}

// "11, 18,25" -> ["11", "18", "25"]
export function splitDates(dates: string): string[] {
  return (dates || "")
    .split(/[,\s/]+/)
    .map((d) => d.trim())
    .filter(Boolean);
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Past months drop off the dashboard automatically; admin can still see
// and tidy them on the Upcoming Packages page.
export function isUpcoming(month: string): boolean {
  return month >= currentMonth();
}

export function formatLandCost(v: string): string {
  const n = Number((v || "").replace(/[^0-9.]/g, ""));
  return v && n ? `₹ ${n.toLocaleString("en-IN")}` : "—";
}
