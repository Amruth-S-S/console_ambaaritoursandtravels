"use client";

import { useEffect, useMemo, useState } from "react";
import { api, TravelListEntry } from "@/lib/api";
import { formatDateDMY } from "@/lib/dates";
import Navbar from "@/components/Navbar";
import dash from "../dashboard.module.css";
import styles from "./travel-list.module.css";

const SearchIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" strokeLinecap="round" />
  </svg>
);

const ChevronIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type Group = {
  key: string;
  travelDate: string;
  packageName: string;
  bookings: TravelListEntry[];
  totalAdults: number;
  totalChildren: number;
  totalInfants: number;
};

// Groups bookings the same way the design sketch lays them out — one row
// per Travel Date + Travel Package combination (not just per package, since
// the same package can run on several different dates), expanding to the
// client/adults/children/infants roster for that specific departure.
function groupBookings(bookings: TravelListEntry[]): Group[] {
  const map = new Map<string, Group>();
  for (const b of bookings) {
    const packageName = (b.packageTitle || b.location || "Unspecified").trim();
    const travelDate = b.travelDate || "";
    const key = `${travelDate}__${packageName}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        travelDate,
        packageName,
        bookings: [],
        totalAdults: 0,
        totalChildren: 0,
        totalInfants: 0,
      };
      map.set(key, g);
    }
    g.bookings.push(b);
    g.totalAdults += Number(b.adults) || 0;
    g.totalChildren += Number(b.children) || 0;
    g.totalInfants += Number(b.infants) || 0;
  }
  return Array.from(map.values());
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TravelListPage() {
  const [bookings, setBookings] = useState<TravelListEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    // No role gate on this page, and getTravelList() itself is deliberately
    // unfiltered by ownership (unlike listBookings()) — every logged-in
    // account sees every trip's date/package/client/adults/children here,
    // not just the bookings they personally created or are assigned to.
    api
      .getTravelList()
      .then(setBookings)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const groups = useMemo(() => groupBookings(bookings), [bookings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.packageName.toLowerCase().includes(q) ||
        formatDateDMY(g.travelDate).toLowerCase().includes(q) ||
        g.bookings.some((b) => b.clientName.toLowerCase().includes(q))
    );
  }, [groups, search]);

  // Today/upcoming travel first (soonest departure on top), past ones
  // pushed down below in their own section (most recent past first) —
  // per the request that old ones "display down" instead of mixed in with
  // what's coming up next.
  const { upcoming, past, noDate } = useMemo(() => {
    const today = todayIso();
    const withDate = filtered.filter((g) => g.travelDate);
    const noDate = filtered.filter((g) => !g.travelDate);
    const upcoming = withDate
      .filter((g) => g.travelDate >= today)
      .sort((a, b) => a.travelDate.localeCompare(b.travelDate));
    const past = withDate
      .filter((g) => g.travelDate < today)
      .sort((a, b) => b.travelDate.localeCompare(a.travelDate));
    return { upcoming, past, noDate };
  }, [filtered]);

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderGroup(g: Group) {
    const open = openKeys.has(g.key);
    return (
      <div key={g.key} className={styles.group}>
        <button
          type="button"
          className={styles.groupHead}
          onClick={() => toggle(g.key)}
          aria-expanded={open}
        >
          <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>
            {ChevronIcon}
          </span>
          <span className={styles.groupDate}>{formatDateDMY(g.travelDate) || "No date"}</span>
          <span className={styles.groupPackage}>{g.packageName}</span>
          <span className={styles.groupCount}>
            {g.bookings.length} client{g.bookings.length === 1 ? "" : "s"} · {g.totalAdults} adults
            · {g.totalChildren} children · {g.totalInfants} infants
          </span>
        </button>
        {open && (
          <table className={styles.miniTable}>
            <thead>
              <tr>
                <th>#</th>
                <th>Client</th>
                <th>Adults</th>
                <th>Children</th>
                <th>Infants</th>
              </tr>
            </thead>
            <tbody>
              {g.bookings.map((b, i) => (
                <tr key={b.id}>
                  <td>{i + 1}</td>
                  <td>{b.clientName || "—"}</td>
                  <td>{b.adults || "0"}</td>
                  <td>{b.children || "0"}</td>
                  <td>{b.infants || "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <>
      <Navbar title="Travel List" />
      <div className={dash.content}>
        <section className={styles.wrap}>
          <div className={styles.head}>
            <div className={styles.headLeft}>
              <h3>Travel lists</h3>
              <span className={styles.count}>{groups.length} groups</span>
            </div>
            <div className={styles.search}>
              <span className={styles.searchIcon}>{SearchIcon}</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by date, package or client…"
              />
            </div>
          </div>

          {!loaded ? (
            <div className={styles.empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              {search ? "No travel lists match your search." : "No bookings yet."}
            </div>
          ) : (
            <>
              {upcoming.length > 0 && (
                <div className={styles.list}>
                  <div className={styles.sectionLabel}>Upcoming</div>
                  {upcoming.map(renderGroup)}
                </div>
              )}
              {past.length > 0 && (
                <div className={styles.list}>
                  <div className={styles.sectionLabel}>Past</div>
                  {past.map(renderGroup)}
                </div>
              )}
              {noDate.length > 0 && (
                <div className={styles.list}>
                  <div className={styles.sectionLabel}>No date set</div>
                  {noDate.map(renderGroup)}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
