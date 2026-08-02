"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, Booking, Package, User } from "@/lib/api";
import { computeInvoiceTotals } from "@/lib/invoice";
import BookingsBarChart, { BarDatum } from "@/components/BookingsBarChart";
import PieChart, { PieDatum } from "@/components/PieChart";
import RevenueLineChart, { LinePoint } from "@/components/RevenueLineChart";
import Navbar from "@/components/Navbar";
import dash from "./dashboard.module.css";
import styles from "./overview.module.css";

// A plain parseFloat("30,000") stops at the comma and reads as 30 — strip
// thousands separators first so "30,000" and "30000" parse identically and
// group together instead of silently landing in different buckets.
function parseAmount(value: string): number {
  return parseFloat((value || "").replace(/,/g, "").trim()) || 0;
}

export default function OverviewPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const first = user?.name?.split(" ")[0] ?? "there";

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const [b, u, p] = await Promise.all([
          api.listBookings(),
          api.listUsers(),
          api.listPackages(),
        ]);
        setBookings(b);
        setUsers(u);
        setPackages(p);
      } catch {
        /* ignore */
      } finally {
        setLoaded(true);
      }
    })();
  }, [isAdmin]);

  const totalRevenue = useMemo(
    () => bookings.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0),
    [bookings]
  );

  const perUser: BarDatum[] = useMemo(() => {
    const map = new Map<string, BarDatum>();
    for (const b of bookings) {
      const key = b.userId || "unknown";
      const amount = parseFloat(b.amount) || 0;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.amount += amount;
      } else {
        map.set(key, { id: key, label: b.userName || "Unknown", count: 1, amount });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [bookings]);

  const byType = useMemo(() => {
    let domestic = 0;
    let international = 0;
    let domesticCount = 0;
    let internationalCount = 0;
    for (const b of bookings) {
      const amount = parseFloat(b.amount) || 0;
      if (b.packageType === "international") {
        international += amount;
        internationalCount += 1;
      } else {
        domestic += amount;
        domesticCount += 1;
      }
    }
    return { domestic, international, domesticCount, internationalCount };
  }, [bookings]);

  // Land package = what's paid to the land vendor for a booking (internal
  // cost, never shown on the client invoice). Net revenue here is the
  // margin on that: full package price billed to the client minus that
  // land-vendor cost — tracked separately for domestic vs. international
  // since the two are priced and sourced independently.
  const landPackageByType = useMemo(() => {
    let domesticLand = 0;
    let internationalLand = 0;
    let domesticPackagePrice = 0;
    let internationalPackagePrice = 0;
    for (const b of bookings) {
      const land = parseAmount(b.landPackage);
      const packagePrice = computeInvoiceTotals(b).packagePrice;
      if (b.packageType === "international") {
        internationalLand += land;
        internationalPackagePrice += packagePrice;
      } else {
        domesticLand += land;
        domesticPackagePrice += packagePrice;
      }
    }
    return {
      domesticLand,
      internationalLand,
      domesticNetRevenue: domesticPackagePrice - domesticLand,
      internationalNetRevenue: internationalPackagePrice - internationalLand,
    };
  }, [bookings]);

  // Broken down per package title within each type — e.g. Thailand vs. Dubai
  // under International — AND per land cost within that package. Grouping
  // only by title used to lump every booking of a package into one bucket,
  // so a later booking made after the land cost changed still got counted
  // against the old figure. Keying on (title, landCost) instead means a
  // price change starts its own row/bucket rather than merging into the
  // previous one.
  const landPackageByPackageName = useMemo(() => {
    type Row = { title: string; landCost: number; bookingCount: number };
    const domesticMap = new Map<string, Row>();
    const internationalMap = new Map<string, Row>();
    for (const b of bookings) {
      const map = b.packageType === "international" ? internationalMap : domesticMap;
      const title = (b.packageTitle || "Untitled package").trim();
      const land = parseAmount(b.landPackage);
      const key = `${title}::${land}`;
      const existing = map.get(key);
      if (existing) {
        existing.bookingCount += 1;
      } else {
        map.set(key, { title, landCost: land, bookingCount: 1 });
      }
    }
    const finalize = (m: Map<string, Row>) =>
      Array.from(m.values())
        .map((r) => ({ ...r, netRevenue: r.landCost * r.bookingCount }))
        .sort((a, b) => a.title.localeCompare(b.title) || b.landCost - a.landCost);
    return { domestic: finalize(domesticMap), international: finalize(internationalMap) };
  }, [bookings]);

  const revenuePieData: PieDatum[] = useMemo(
    () => [
      { id: "domestic", label: "Domestic", value: byType.domestic, color: "var(--chart-1)" },
      { id: "international", label: "International", value: byType.international, color: "var(--chart-2)" },
    ],
    [byType]
  );

  // Fixed hue order (see globals.css --chart-1..8) assigned by rank, never
  // cycled — beyond 8 users the tail folds into "Other" rather than
  // generating a 9th hue (dataviz skill: series-count ladder).
  const perUserPieData: PieDatum[] = useMemo(() => {
    const colors = [
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
      "var(--chart-5)",
      "var(--chart-6)",
      "var(--chart-7)",
      "var(--chart-8)",
    ];
    const head = perUser.slice(0, 8).map((u, i) => ({ id: u.id, label: u.label, value: u.count, color: colors[i] }));
    const tail = perUser.slice(8);
    if (tail.length > 0) {
      head.push({
        id: "other",
        label: "Other",
        value: tail.reduce((s, u) => s + u.count, 0),
        color: "var(--chart-other)",
      });
    }
    return head;
  }, [perUser]);

  const revenueTrend: LinePoint[] = useMemo(() => {
    const map = new Map<string, { label: string; total: number }>();
    for (const b of bookings) {
      const d = new Date(b.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      const amount = parseFloat(b.amount) || 0;
      const existing = map.get(sortKey);
      if (existing) existing.total += amount;
      else map.set(sortKey, { label, total: amount });
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, m]) => ({ x: m.label, y: m.total }));
  }, [bookings]);

  const recentBookings = useMemo(() => bookings.slice(0, 8), [bookings]);

  return (
    <>
      <Navbar title="Overview" />
      <div className={dash.content}>
        <section className={styles.hero}>
          <span className={styles.glow} />
          <h1>
            Welcome back, <span>{first}</span>.
          </h1>
          <p>
            This is your workspace.{" "}
            {isAdmin
              ? "As an admin, you can create and manage user accounts from the Users section."
              : "Everything you need lives in the menu on the left."}
          </p>
        </section>

        <div className={styles.cards}>
          <div className={styles.card}>
            <div className={styles.k}>Your role</div>
            <div className={styles.v} style={{ textTransform: "capitalize" }}>
              {user?.role}
            </div>
          </div>
          <div className={styles.card}>
            <div className={styles.k}>Account</div>
            <div className={styles.v}>{user?.name}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.k}>Email</div>
            <div className={styles.v} style={{ fontSize: 15 }}>
              {user?.email}
            </div>
          </div>
        </div>

        {isAdmin && (
          <>
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.k}>Total bookings</div>
                <div className={styles.v}>{bookings.length}</div>
                <div className={styles.sub}>
                  {byType.domesticCount} domestic · {byType.internationalCount} international
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>Revenue collected</div>
                <div className={styles.v}>₹ {totalRevenue.toLocaleString("en-IN")}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>Users</div>
                <div className={styles.v}>{users.length}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>Packages</div>
                <div className={styles.v}>{packages.length}</div>
              </div>
            </div>

            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-1)" }} /> Domestic revenue
                </div>
                <div className={styles.v}>₹ {byType.domestic.toLocaleString("en-IN")}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-2)" }} /> International revenue
                </div>
                <div className={styles.v}>₹ {byType.international.toLocaleString("en-IN")}</div>
              </div>
            </div>

            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-1)" }} /> Domestic land package cost
                </div>
                <div className={styles.v}>₹ {landPackageByType.domesticLand.toLocaleString("en-IN")}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-1)" }} /> Domestic net revenue (land)
                </div>
                <div className={styles.v}>
                  ₹ {landPackageByType.domesticNetRevenue.toLocaleString("en-IN")}
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-2)" }} /> International land package
                  cost
                </div>
                <div className={styles.v}>₹ {landPackageByType.internationalLand.toLocaleString("en-IN")}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-2)" }} /> International net revenue
                  (land)
                </div>
                <div className={styles.v}>
                  ₹ {landPackageByType.internationalNetRevenue.toLocaleString("en-IN")}
                </div>
              </div>
            </div>

            <div className={styles.panelGrid}>
              <section className={styles.panel}>
                <h3>Domestic — land package by package</h3>
                {!loaded ? (
                  <div className={styles.loading}>Loading…</div>
                ) : landPackageByPackageName.domestic.length === 0 ? (
                  <div className={styles.loading}>No domestic bookings yet.</div>
                ) : (
                  <table className={styles.miniTable}>
                    <thead>
                      <tr>
                        <th>Package</th>
                        <th>Land cost</th>
                        <th>Bookings</th>
                        <th>Net revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {landPackageByPackageName.domestic.map((p) => (
                        <tr key={`${p.title}::${p.landCost}`}>
                          <td>{p.title}</td>
                          <td>₹ {p.landCost.toLocaleString("en-IN")}</td>
                          <td>{p.bookingCount}</td>
                          <td>₹ {p.netRevenue.toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className={styles.panel}>
                <h3>International — land package by package</h3>
                {!loaded ? (
                  <div className={styles.loading}>Loading…</div>
                ) : landPackageByPackageName.international.length === 0 ? (
                  <div className={styles.loading}>No international bookings yet.</div>
                ) : (
                  <table className={styles.miniTable}>
                    <thead>
                      <tr>
                        <th>Package</th>
                        <th>Land cost</th>
                        <th>Bookings</th>
                        <th>Net revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {landPackageByPackageName.international.map((p) => (
                        <tr key={`${p.title}::${p.landCost}`}>
                          <td>{p.title}</td>
                          <td>₹ {p.landCost.toLocaleString("en-IN")}</td>
                          <td>{p.bookingCount}</td>
                          <td>₹ {p.netRevenue.toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>

            <div className={styles.panelGrid}>
              <section className={styles.panel}>
                <h3>Bookings per user</h3>
                {!loaded ? (
                  <div className={styles.loading}>Loading…</div>
                ) : (
                  <BookingsBarChart data={perUser} />
                )}
              </section>

              <section className={styles.panel}>
                <h3>User booking details</h3>
                {!loaded ? (
                  <div className={styles.loading}>Loading…</div>
                ) : perUser.length === 0 ? (
                  <div className={styles.loading}>No bookings yet.</div>
                ) : (
                  <table className={styles.miniTable}>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Bookings</th>
                        <th>Total amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perUser.map((u) => (
                        <tr key={u.id}>
                          <td>{u.label}</td>
                          <td>{u.count}</td>
                          <td>₹ {u.amount.toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>

            <div className={styles.panelGrid}>
              <section className={styles.panel}>
                <h3>Revenue by type</h3>
                {!loaded ? (
                  <div className={styles.loading}>Loading…</div>
                ) : (
                  <PieChart data={revenuePieData} valueFormat={(v) => `₹${v.toLocaleString("en-IN")}`} />
                )}
              </section>

              <section className={styles.panel}>
                <h3>Bookings per user share</h3>
                {!loaded ? (
                  <div className={styles.loading}>Loading…</div>
                ) : (
                  <PieChart data={perUserPieData} />
                )}
              </section>
            </div>

            <section className={styles.panel}>
              <h3>Revenue over time</h3>
              {!loaded ? (
                <div className={styles.loading}>Loading…</div>
              ) : (
                <RevenueLineChart data={revenueTrend} />
              )}
            </section>

            <section className={styles.panel}>
              <h3>Recent bookings</h3>
              {!loaded ? (
                <div className={styles.loading}>Loading…</div>
              ) : recentBookings.length === 0 ? (
                <div className={styles.loading}>No bookings yet.</div>
              ) : (
                <table className={styles.miniTable}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Package</th>
                      <th>Amount</th>
                      <th>Booked by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBookings.map((b) => (
                      <tr key={b.id}>
                        <td>{b.clientName}</td>
                        <td>{b.packageTitle || "—"}</td>
                        <td>{b.amount ? `₹ ${b.amount}` : "—"}</td>
                        <td>{b.userName || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
