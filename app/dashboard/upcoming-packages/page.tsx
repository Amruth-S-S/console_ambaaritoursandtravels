"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, UpcomingPackage, UpcomingPackageInput } from "@/lib/api";
import { formatLandCost, isUpcoming, monthLabel, splitDates } from "@/lib/upcoming";
import Navbar from "@/components/Navbar";
import Modal from "@/components/Modal";
import RefreshButton from "@/components/RefreshButton";
import Toast, { ToastState } from "@/components/Toast";
import dash from "../dashboard.module.css";
// Same list/table/modal shape as the ledgers — reuse their styling.
import styles from "../accounts/accounts.module.css";

const SearchIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" strokeLinecap="round" />
  </svg>
);

const EditIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DeleteIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path
      d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const emptyForm: UpcomingPackageInput = { month: "", dates: "", packageName: "", landCost: "" };

export default function UpcomingPackagesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const [entries, setEntries] = useState<UpcomingPackage[]>([]);
  const [packageNames, setPackageNames] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UpcomingPackageInput>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (user && !isAdmin) router.replace("/dashboard");
  }, [user, isAdmin, router]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function notify(type: "ok" | "err", text: string) {
    window.clearTimeout(toastTimer.current);
    setToast({ type, text });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  async function load() {
    try {
      setEntries(await api.listUpcomingPackages());
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load upcoming packages");
    } finally {
      setLoaded(true);
    }
    // Suggestions for the Package Name box — still free text, so a package
    // that isn't built yet can be announced too.
    api
      .listPackages()
      .then((list) => setPackageNames(Array.from(new Set(list.map((p) => p.packageTitle).filter(Boolean))).sort()))
      .catch(() => {});
  }

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      `${e.packageName} ${monthLabel(e.month)} ${e.dates}`.toLowerCase().includes(q)
    );
  }, [entries, search]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormErr("");
    setModalOpen(true);
  }

  function openEdit(e: UpcomingPackage) {
    setEditingId(e.id);
    setForm({ month: e.month, dates: e.dates, packageName: e.packageName, landCost: e.landCost });
    setFormErr("");
    setModalOpen(true);
  }

  function closeModal() {
    if (!busy) setModalOpen(false);
  }

  async function onSubmit() {
    setFormErr("");
    setBusy(true);
    try {
      const body = { ...form, packageName: form.packageName.trim(), dates: splitDates(form.dates).join(", ") };
      if (editingId) {
        await api.updateUpcomingPackage(editingId, body);
        notify("ok", "Upcoming package updated");
      } else {
        await api.createUpcomingPackage(body);
        notify("ok", "Upcoming package added");
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function onDelete(e: UpcomingPackage) {
    window.clearTimeout(toastTimer.current);
    setToast({
      type: "confirm",
      text: `Remove ${e.packageName} (${monthLabel(e.month)}) from upcoming packages?`,
      onCancel: () => setToast(null),
      onConfirm: async () => {
        setToast(null);
        try {
          await api.deleteUpcomingPackage(e.id);
          notify("ok", "Removed");
          load();
        } catch (err) {
          notify("err", err instanceof Error ? err.message : "Failed to delete");
        }
      },
    });
  }

  if (user && !isAdmin) return null;

  const canSubmit = /^\d{4}-\d{2}$/.test(form.month) && form.packageName.trim() && !busy;

  return (
    <>
      <Navbar title="Upcoming Packages" />
      <Toast toast={toast} />
      <div className={dash.content}>
        <section className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div className={styles.tableHeadLeft}>
              <h3>Upcoming packages</h3>
              <span className={styles.count}>{entries.length} total</span>
            </div>
            <div className={styles.tableHeadRight}>
              <div className={styles.search}>
                <span className={styles.searchIcon}>{SearchIcon}</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by package or month…" />
              </div>
              <RefreshButton onRefresh={load} />
              <button className={styles.createBtn} onClick={openCreate}>
                + Upcoming Package Dates
              </button>
            </div>
          </div>

          {!loaded ? (
            <div className={styles.empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              {search ? "No entries match your search." : "No upcoming packages yet — add the first one."}
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Dates</th>
                    <th>Package Name</th>
                    <th>Land Cost</th>
                    <th>On Dashboard</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id}>
                      <td>{monthLabel(e.month)}</td>
                      <td>{e.dates || "—"}</td>
                      <td>{e.packageName}</td>
                      <td>{formatLandCost(e.landCost)}</td>
                      <td>
                        <span
                          className={`${styles.approveBadge} ${isUpcoming(e.month) ? styles.approveBadgeOn : styles.approveBadgeOff}`}
                          title={isUpcoming(e.month) ? "Shown on everyone's Overview" : "Month has passed — hidden from the Overview"}
                        >
                          {isUpcoming(e.month) ? "Showing" : "Past"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <button className={styles.iconBtn} onClick={() => openEdit(e)} aria-label="Edit" title="Edit">
                            {EditIcon}
                          </button>
                          <button
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                            onClick={() => onDelete(e)}
                            aria-label="Delete"
                            title="Delete"
                          >
                            {DeleteIcon}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "Edit upcoming package" : "Upcoming package dates"}
        maxWidth={620}
      >
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="u-month">Month</label>
            <input id="u-month" type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label htmlFor="u-dates">Date(s)</label>
            <input
              id="u-dates"
              value={form.dates}
              placeholder="e.g. 11, 18, 25"
              onChange={(e) => setForm({ ...form, dates: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="u-package">Package Name</label>
            <input
              id="u-package"
              list="u-package-names"
              value={form.packageName}
              placeholder="Pick a package or type a name"
              onChange={(e) => setForm({ ...form, packageName: e.target.value })}
            />
            <datalist id="u-package-names">
              {packageNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className={styles.field}>
            <label htmlFor="u-landcost">Land Cost (₹)</label>
            <input
              id="u-landcost"
              inputMode="decimal"
              value={form.landCost}
              placeholder="e.g. 25000"
              onChange={(e) => setForm({ ...form, landCost: e.target.value })}
            />
          </div>
        </div>

        {formErr && <div className={`${styles.msg} ${styles.err}`}>{formErr}</div>}

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={closeModal} disabled={busy}>
            Cancel
          </button>
          <button className={styles.submit} onClick={onSubmit} disabled={!canSubmit}>
            {busy ? "Saving…" : editingId ? "Save changes" : "Save"}
          </button>
        </div>
      </Modal>
    </>
  );
}
