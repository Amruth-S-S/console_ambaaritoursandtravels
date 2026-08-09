"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, Booking, Package, User } from "@/lib/api";
import { computeInvoiceTotals } from "@/lib/invoice";
import BookingsBarChart, { BarDatum } from "@/components/BookingsBarChart";
import PieChart, { PieDatum } from "@/components/PieChart";
import RevenueLineChart, { LinePoint } from "@/components/RevenueLineChart";
import Navbar from "@/components/Navbar";
import Toast, { ToastState } from "@/components/Toast";
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
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function notify(type: "ok" | "err", text: string) {
    window.clearTimeout(toastTimer.current);
    setToast({ type, text });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  async function load(isManualRefresh = false) {
    if (isManualRefresh) setRefreshing(true);
    try {
      const [b, u, p] = await Promise.all([
        api.listBookings(),
        api.listUsers(),
        api.listPackages(),
      ]);
      setBookings(b);
      setUsers(u);
      setPackages(p);
      if (isManualRefresh) notify("ok", "Dashboard refreshed");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load dashboard data");
    } finally {
      setLoaded(true);
      if (isManualRefresh) setRefreshing(false);
    }
  }

  // Fetches for any logged-in user now, not just admins — a regular user
  // needs their own booking stats below. The backend already scopes
  // GET /bookings to "mine" for non-admins, so `bookings` here is already
  // exactly the right set for that section, no extra filtering needed.
  useEffect(() => {
    if (user) load();
  }, [user]);

  // Non-admin "My bookings" stats — counts plus the plain package amount
  // each booking was made for (adultPrice*adults + childPrice*children —
  // the figure this user typed in themselves when creating the booking).
  // Deliberately no net-profit or land-cost figures here — those stay
  // admin-only, see the isAdmin section below. `bookings` is already just
  // this user's own bookings for a non-admin (see the backend note above),
  // so no extra filtering needed.
  const myBookingStats = useMemo(() => {
    let domestic = 0;
    let international = 0;
    let withFlight = 0;
    let withoutFlight = 0;
    let domesticAmount = 0;
    let internationalAmount = 0;
    for (const b of bookings) {
      const amount = computeInvoiceTotals(b).packagePrice;
      if (b.packageType === "international") {
        international += 1;
        internationalAmount += amount;
      } else {
        domestic += 1;
        domesticAmount += amount;
      }
      if (parseAmount(b.flightAmount) > 0) withFlight += 1;
      else withoutFlight += 1;
    }
    return {
      total: bookings.length,
      domestic,
      international,
      withFlight,
      withoutFlight,
      domesticAmount,
      internationalAmount,
      totalAmount: domesticAmount + internationalAmount,
    };
  }, [bookings]);

  // Per-package amount breakdown — one row per package (not per booking),
  // same grouping approach as the admin net-revenue tables below.
  function myAmountByPackage(type: "domestic" | "international") {
    const byPackage = new Map<string, { title: string; amount: number }>();
    for (const b of bookings) {
      if (b.packageType !== type) continue;
      const title = (b.packageTitle || "Untitled package").trim();
      const key = b.packageId || title;
      const amount = computeInvoiceTotals(b).packagePrice;
      const existing = byPackage.get(key);
      if (existing) existing.amount += amount;
      else byPackage.set(key, { title, amount });
    }
    return Array.from(byPackage.values()).sort((a, b) => b.amount - a.amount);
  }

  const myDomesticAmountByPackage = useMemo(
    () => myAmountByPackage("domestic"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings]
  );
  const myInternationalAmountByPackage = useMemo(
    () => myAmountByPackage("international"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings]
  );

  const myTypePieData: PieDatum[] = useMemo(
    () => [
      { id: "domestic", label: "Domestic", value: myBookingStats.domestic, color: "var(--chart-1)" },
      { id: "international", label: "International", value: myBookingStats.international, color: "var(--chart-2)" },
    ],
    [myBookingStats]
  );

  const myFlightPieData: PieDatum[] = useMemo(
    () => [
      { id: "with-flight", label: "With flight", value: myBookingStats.withFlight, color: "var(--chart-3)" },
      { id: "without-flight", label: "Without flight", value: myBookingStats.withoutFlight, color: "var(--chart-4)" },
    ],
    [myBookingStats]
  );

  // "Revenue" here means money actually received — the sum of each
  // booking's advance payments (same figure as the "Advance Paid" column on
  // the Bookings page) — not the one-off "amount to collect now" field,
  // which doesn't change when you add/edit a payment on an existing booking
  // and was going stale on this page as a result.
  const totalRevenue = useMemo(
    () => bookings.reduce((sum, b) => sum + computeInvoiceTotals(b).totalAdvance, 0),
    [bookings]
  );

  // packageAmount/packageNames ride along on the same per-user rows as the
  // chart's count/amount (advance paid) — extra fields BarDatum doesn't
  // declare, but the bar chart only reads id/label/count/amount so this is
  // safe to share between both the chart and the "User booking details"
  // table below instead of computing the same grouping twice.
  type PerUserRow = BarDatum & { packageAmount: number; packageNames: string };
  const perUser: PerUserRow[] = useMemo(() => {
    const map = new Map<string, PerUserRow & { packageTitles: Set<string> }>();
    for (const b of bookings) {
      const key = b.userId || "unknown";
      const amount = computeInvoiceTotals(b).totalAdvance;
      const packageAmount = computeInvoiceTotals(b).packagePrice;
      const title = (b.packageTitle || "Untitled package").trim();
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.amount += amount;
        existing.packageAmount += packageAmount;
        existing.packageTitles.add(title);
      } else {
        map.set(key, {
          id: key,
          label: b.userName || "Unknown",
          count: 1,
          amount,
          packageAmount,
          packageNames: "",
          packageTitles: new Set([title]),
        });
      }
    }
    return Array.from(map.values())
      .map(({ packageTitles, ...row }) => ({ ...row, packageNames: Array.from(packageTitles).join(", ") }))
      .sort((a, b) => b.count - a.count);
  }, [bookings]);

  // "User booking details" table ranks by total package amount (highest
  // spender first) — a different order than the bar chart above it, which
  // stays ranked by booking count. Same rows, sorted independently for each.
  const perUserByPackageAmount: PerUserRow[] = useMemo(
    () => [...perUser].sort((a, b) => b.packageAmount - a.packageAmount),
    [perUser]
  );

  const byType = useMemo(() => {
    let domestic = 0;
    let international = 0;
    let domesticCount = 0;
    let internationalCount = 0;
    for (const b of bookings) {
      const amount = computeInvoiceTotals(b).totalAdvance;
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

  // Domestic/International Net Revenue — one row per package (not per
  // booking, so a package's net profit isn't double-counted across its
  // bookings), broken out per pax category: that category's admin-entered
  // net profit is PER PERSON, same as the land price, so both get scaled by
  // headcount the same way before comparing — categoryNetProfit * count vs.
  // categoryLandPrice * count, both summed across all the package's bookings
  // of this type. Each category's amount is the larger-minus-smaller
  // difference (never negative) between those two scaled totals — see the
  // earlier "-41,000 looked wrong" fix. Total is just the 3 category amounts
  // added together.
  type CategoryTotal = { count: number; land: number; net: number };
  type PackageNetRevenueRow = {
    title: string;
    adult: CategoryTotal & { amount: number };
    child: CategoryTotal & { amount: number };
    infant: CategoryTotal & { amount: number };
    total: number;
  };

  function netRevenueByPackage(type: "domestic" | "international"): PackageNetRevenueRow[] {
    const packageById = new Map(packages.map((p) => [p.id, p]));
    const byPackage = new Map<
      string,
      { title: string; adult: CategoryTotal; child: CategoryTotal; infant: CategoryTotal }
    >();
    for (const b of bookings) {
      if (b.packageType !== type) continue;
      const pkg = packageById.get(b.packageId || "");
      const title = (pkg?.packageTitle || b.packageTitle || "Untitled package").trim();
      const key = b.packageId || title;
      const adults = parseFloat(b.adults) || 0;
      const children = parseFloat(b.children) || 0;
      const infants = parseFloat(b.infants) || 0;
      const existing = byPackage.get(key) || {
        title,
        adult: { count: 0, land: 0, net: 0 },
        child: { count: 0, land: 0, net: 0 },
        infant: { count: 0, land: 0, net: 0 },
      };
      // Net profit is entered per person on the package, same as land price —
      // so e.g. 3 adults × adult net profit is what actually got earned on
      // this booking's adults, not the flat per-person figure on its own.
      const adultNetProfit = parseAmount(pkg?.adultNetProfit || "");
      const childNetProfit = parseAmount(pkg?.childNetProfit || "");
      const infantNetProfit = parseAmount(pkg?.infantNetProfit || "");
      existing.adult.count += adults;
      existing.adult.land += parseAmount(b.adultLandPrice) * adults;
      existing.adult.net += adultNetProfit * adults;
      existing.child.count += children;
      existing.child.land += parseAmount(b.childLandPrice) * children;
      existing.child.net += childNetProfit * children;
      existing.infant.count += infants;
      existing.infant.land += parseAmount(b.infantLandPrice) * infants;
      existing.infant.net += infantNetProfit * infants;
      byPackage.set(key, existing);
    }

    const diff = (netProfit: number, land: number) => Math.max(netProfit, land) - Math.min(netProfit, land);

    return Array.from(byPackage.entries())
      .map(([, { title, adult, child, infant }]) => {
        const adultAmount = diff(adult.net, adult.land);
        const childAmount = diff(child.net, child.land);
        const infantAmount = diff(infant.net, infant.land);
        return {
          title,
          adult: { ...adult, amount: adultAmount },
          child: { ...child, amount: childAmount },
          infant: { ...infant, amount: infantAmount },
          total: adultAmount + childAmount + infantAmount,
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  const domesticNetRevenueByPackage = useMemo(
    () => netRevenueByPackage("domestic"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, packages]
  );
  const internationalNetRevenueByPackage = useMemo(
    () => netRevenueByPackage("international"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, packages]
  );

  const domesticNetRevenueTotal = useMemo(
    () => domesticNetRevenueByPackage.reduce((sum, p) => sum + p.total, 0),
    [domesticNetRevenueByPackage]
  );
  const internationalNetRevenueTotal = useMemo(
    () => internationalNetRevenueByPackage.reduce((sum, p) => sum + p.total, 0),
    [internationalNetRevenueByPackage]
  );

  // "Land package cost" tiles = land price actually paid out (categoryLandPrice
  // × category count, summed across all of a type's bookings — same figures
  // already computed per-package in domestic/internationalNetRevenueByPackage's
  // adult/child/infant.land). "Net revenue (land)" tiles reuse that same
  // section's total, so both pairs of tiles agree with the breakdown table
  // above them instead of tracking a separate, legacy "Land package (Rs.)"
  // flat field. Domestic stays Adult-only; International rolls in Child and
  // Infant land price too, per explicit request.
  const domesticAdultLandTotal = useMemo(
    () => domesticNetRevenueByPackage.reduce((sum, p) => sum + p.adult.land, 0),
    [domesticNetRevenueByPackage]
  );
  const internationalLandTotal = useMemo(
    () =>
      internationalNetRevenueByPackage.reduce(
        (sum, p) => sum + p.adult.land + p.child.land + p.infant.land,
        0
      ),
    [internationalNetRevenueByPackage]
  );

  // "With Flight Total Cost" — the same Package price × pax figure shown in
  // the booking form's summary box (computeInvoiceTotals().packagePrice).
  // Flight amount is NOT added on top here — per-adult/child price already
  // has the flight cost folded into it, so adding flightAmount separately
  // would double-count it. One combined total across every booking admin
  // can see (domestic + international together).
  const totalWithFlightCost = useMemo(
    () => bookings.reduce((sum, b) => sum + computeInvoiceTotals(b).packagePrice, 0),
    [bookings]
  );

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
      const amount = computeInvoiceTotals(b).totalAdvance;
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
      <Toast toast={toast} />
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

        {!isAdmin && (
          <>
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.k}>Your bookings</div>
                <div className={styles.v}>{myBookingStats.total}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-1)" }} /> Domestic
                </div>
                <div className={styles.v}>{myBookingStats.domestic}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-2)" }} /> International
                </div>
                <div className={styles.v}>{myBookingStats.international}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>Total amount</div>
                <div className={styles.v}>₹ {myBookingStats.totalAmount.toLocaleString("en-IN")}</div>
              </div>
            </div>

            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-3)" }} /> With flight
                </div>
                <div className={styles.v}>{myBookingStats.withFlight}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-4)" }} /> Without flight
                </div>
                <div className={styles.v}>{myBookingStats.withoutFlight}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-1)" }} /> Domestic amount
                </div>
                <div className={styles.v}>₹ {myBookingStats.domesticAmount.toLocaleString("en-IN")}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-2)" }} /> International amount
                </div>
                <div className={styles.v}>₹ {myBookingStats.internationalAmount.toLocaleString("en-IN")}</div>
              </div>
            </div>

            {myBookingStats.domestic > 0 && (
              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <h3>Domestic — Package Amounts</h3>
                  <span className={styles.panelTotal}>
                    ₹ {myBookingStats.domesticAmount.toLocaleString("en-IN")}
                  </span>
                </div>
                <table className={styles.miniTable}>
                  <thead>
                    <tr>
                      <th>Package</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myDomesticAmountByPackage.map((p) => (
                      <tr key={p.title}>
                        <td>{p.title}</td>
                        <td>₹ {p.amount.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {myBookingStats.international > 0 && (
              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <h3>International — Package Amounts</h3>
                  <span className={styles.panelTotal}>
                    ₹ {myBookingStats.internationalAmount.toLocaleString("en-IN")}
                  </span>
                </div>
                <table className={styles.miniTable}>
                  <thead>
                    <tr>
                      <th>Package</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myInternationalAmountByPackage.map((p) => (
                      <tr key={p.title}>
                        <td>{p.title}</td>
                        <td>₹ {p.amount.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {myBookingStats.total > 0 && (
              <div className={styles.panelGrid}>
                <section className={styles.panel}>
                  <h3>Domestic vs International</h3>
                  {!loaded ? <div className={styles.loading}>Loading…</div> : <PieChart data={myTypePieData} />}
                </section>
                <section className={styles.panel}>
                  <h3>With vs Without Flight</h3>
                  {!loaded ? <div className={styles.loading}>Loading…</div> : <PieChart data={myFlightPieData} />}
                </section>
              </div>
            )}

            {loaded && myBookingStats.total === 0 && (
              <div className={styles.panel}>
                <div className={styles.loading}>No bookings yet.</div>
              </div>
            )}
          </>
        )}

        {isAdmin && (
          <>
            <div className={styles.sectionHead}>
              <h2>Admin overview</h2>
              <button
                className={styles.refreshBtn}
                onClick={() => load(true)}
                disabled={refreshing}
              >
                <i className={`fas fa-sync-alt ${refreshing ? styles.spin : ""}`} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>

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

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h3>Domestic Net Revenue</h3>
                <span className={styles.panelTotal}>₹ {domesticNetRevenueTotal.toLocaleString("en-IN")}</span>
              </div>
              {!loaded ? (
                <div className={styles.loading}>Loading…</div>
              ) : domesticNetRevenueByPackage.length === 0 ? (
                <div className={styles.loading}>No domestic bookings yet.</div>
              ) : (
                <div className={styles.tableScroll}>
                  <table className={styles.miniTable}>
                    <thead>
                      <tr>
                        <th>Package</th>
                        <th>Adults</th>
                        <th>Adult Amount</th>
                        <th>Children</th>
                        <th>Child Amount</th>
                        <th>Infants</th>
                        <th>Infant Amount</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {domesticNetRevenueByPackage.map((p) => (
                        <tr key={p.title}>
                          <td>{p.title}</td>
                          <td>{p.adult.count}</td>
                          <td>₹ {p.adult.amount.toLocaleString("en-IN")}</td>
                          <td>{p.child.count}</td>
                          <td>₹ {p.child.amount.toLocaleString("en-IN")}</td>
                          <td>{p.infant.count}</td>
                          <td>₹ {p.infant.amount.toLocaleString("en-IN")}</td>
                          <td>₹ {p.total.toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h3>International Net Revenue</h3>
                <span className={styles.panelTotal}>
                  ₹ {internationalNetRevenueTotal.toLocaleString("en-IN")}
                </span>
              </div>
              {!loaded ? (
                <div className={styles.loading}>Loading…</div>
              ) : internationalNetRevenueByPackage.length === 0 ? (
                <div className={styles.loading}>No international bookings yet.</div>
              ) : (
                <div className={styles.tableScroll}>
                  <table className={styles.miniTable}>
                    <thead>
                      <tr>
                        <th>Package</th>
                        <th>Adults</th>
                        <th>Adult Amount</th>
                        <th>Children</th>
                        <th>Child Amount</th>
                        <th>Infants</th>
                        <th>Infant Amount</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {internationalNetRevenueByPackage.map((p) => (
                        <tr key={p.title}>
                          <td>{p.title}</td>
                          <td>{p.adult.count}</td>
                          <td>₹ {p.adult.amount.toLocaleString("en-IN")}</td>
                          <td>{p.child.count}</td>
                          <td>₹ {p.child.amount.toLocaleString("en-IN")}</td>
                          <td>{p.infant.count}</td>
                          <td>₹ {p.infant.amount.toLocaleString("en-IN")}</td>
                          <td>₹ {p.total.toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-1)" }} /> Domestic land package cost
                </div>
                <div className={styles.v}>₹ {domesticAdultLandTotal.toLocaleString("en-IN")}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-1)" }} /> Domestic net revenue (land)
                </div>
                <div className={styles.v}>
                  ₹ {domesticNetRevenueTotal.toLocaleString("en-IN")}
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-2)" }} /> International land package
                  cost
                </div>
                <div className={styles.v}>₹ {internationalLandTotal.toLocaleString("en-IN")}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-2)" }} /> International net revenue
                  (land)
                </div>
                <div className={styles.v}>
                  ₹ {internationalNetRevenueTotal.toLocaleString("en-IN")}
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.k}>
                  <span className={styles.dot} style={{ background: "var(--chart-3)" }} /> With flight total cost
                </div>
                <div className={styles.v}>₹ {totalWithFlightCost.toLocaleString("en-IN")}</div>
              </div>
            </div>

            <div className={`${styles.panelGrid} ${styles.panelGridWide}`}>
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
                  <div className={styles.tableScroll}>
                    <table className={styles.miniTable}>
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Bookings</th>
                          <th>Package Name</th>
                          <th>Total Package Amount</th>
                          <th>Advance Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perUserByPackageAmount.map((u) => (
                          <tr key={u.id}>
                            <td>{u.label}</td>
                            <td>{u.count}</td>
                            <td>{u.packageNames || "—"}</td>
                            <td>₹ {u.packageAmount.toLocaleString("en-IN")}</td>
                            <td>₹ {u.amount.toLocaleString("en-IN")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                      <th>Advance Paid</th>
                      <th>Booked by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBookings.map((b) => (
                      <tr key={b.id}>
                        <td>{b.clientName}</td>
                        <td>{b.packageTitle || "—"}</td>
                        <td>₹ {computeInvoiceTotals(b).totalAdvance.toLocaleString("en-IN")}</td>
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
