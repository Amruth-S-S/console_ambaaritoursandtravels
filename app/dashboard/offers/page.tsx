"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, Offer, OfferInput } from "@/lib/api";
import { formatDateDMY } from "@/lib/dates";
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

const RemoveRowIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
  </svg>
);

const emptyRow = (): OfferInput => ({ packageName: "", targetAmount: "", fromDate: "", toDate: "" });

// Amounts are free text and may contain commas ("1,50,000").
function toNumber(v: string): number {
  return Number((v || "").replace(/[^0-9.]/g, "")) || 0;
}

function formatAmount(v: string): string {
  return v ? `₹ ${toNumber(v).toLocaleString("en-IN")}` : "—";
}

export default function OffersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const [offers, setOffers] = useState<Offer[]>([]);
  // Titles of every saved package — the Package Name dropdown's options.
  const [packageNames, setPackageNames] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  // Editing one saved offer uses the same modal with a single row and no
  // "Add row" button.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rows, setRows] = useState<OfferInput[]>([emptyRow()]);
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
      setOffers(await api.listOffers());
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load offers");
    } finally {
      setLoaded(true);
    }
    api
      .listPackages()
      .then((list) =>
        setPackageNames(Array.from(new Set(list.map((p) => p.packageTitle.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)))
      )
      .catch(() => notify("err", "Couldn't load the package list"));
  }

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? offers.filter((o) => o.packageName.toLowerCase().includes(q)) : offers;
  }, [offers, search]);

  const totalTarget = useMemo(() => filtered.reduce((s, o) => s + toNumber(o.targetAmount), 0), [filtered]);

  function openCreate() {
    setEditingId(null);
    setRows([emptyRow()]);
    setFormErr("");
    setModalOpen(true);
  }

  function openEdit(o: Offer) {
    setEditingId(o.id);
    setRows([{ packageName: o.packageName, targetAmount: o.targetAmount, fromDate: o.fromDate || "", toDate: o.toDate || "" }]);
    setFormErr("");
    setModalOpen(true);
  }

  function closeModal() {
    if (!busy) setModalOpen(false);
  }

  function updateRow(i: number, patch: Partial<OfferInput>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }

  function removeRow(i: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));
  }

  // Fully blank rows are skipped; a row with an amount but no name is an error.
  const filledRows = rows
    .map((r) => ({ ...r, packageName: r.packageName.trim(), targetAmount: r.targetAmount.trim() }))
    .filter((r) => r.packageName || r.targetAmount || r.fromDate || r.toDate);
  const missingName = filledRows.some((r) => !r.packageName);
  const badDates = filledRows.some((r) => r.fromDate && r.toDate && r.fromDate > r.toDate);
  const canSubmit = filledRows.length > 0 && !missingName && !badDates && !busy;

  async function onSubmit() {
    setFormErr("");
    setBusy(true);
    try {
      if (editingId) {
        await api.updateOffer(editingId, filledRows[0]);
        notify("ok", "Offer updated");
      } else {
        await api.createOffers(filledRows);
        notify("ok", `${filledRows.length} offer${filledRows.length === 1 ? "" : "s"} saved`);
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function onDelete(o: Offer) {
    window.clearTimeout(toastTimer.current);
    setToast({
      type: "confirm",
      text: `Delete the offer for ${o.packageName}?`,
      onCancel: () => setToast(null),
      onConfirm: async () => {
        setToast(null);
        try {
          await api.deleteOffer(o.id);
          notify("ok", "Offer deleted");
          load();
        } catch (e) {
          notify("err", e instanceof Error ? e.message : "Failed to delete");
        }
      },
    });
  }

  if (user && !isAdmin) return null;

  return (
    <>
      <Navbar title="Offer Section" />
      <Toast toast={toast} />
      <div className={dash.content}>
        <section className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div className={styles.tableHeadLeft}>
              <h3>Offers</h3>
              <span className={styles.count}>{offers.length} total</span>
              {filtered.length > 0 && (
                <span className={styles.count} title="Sum of target amounts shown">
                  Target ₹ {totalTarget.toLocaleString("en-IN")}
                </span>
              )}
            </div>
            <div className={styles.tableHeadRight}>
              <div className={styles.search}>
                <span className={styles.searchIcon}>{SearchIcon}</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by package name…" />
              </div>
              <RefreshButton onRefresh={load} />
              <button className={styles.createBtn} onClick={openCreate}>
                + Add Offer Section
              </button>
            </div>
          </div>

          {!loaded ? (
            <div className={styles.empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>{search ? "No offers match your search." : "No offers yet — add the first ones."}</div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Sl No</th>
                    <th>Package Name</th>
                    <th>Target Amount</th>
                    <th>From Date</th>
                    <th>To Date</th>
                    <th>Added On</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o, i) => (
                    <tr key={o.id}>
                      <td>{i + 1}</td>
                      <td>{o.packageName}</td>
                      <td>{formatAmount(o.targetAmount)}</td>
                      <td>{formatDateDMY(o.fromDate) || "—"}</td>
                      <td>{formatDateDMY(o.toDate) || "—"}</td>
                      <td>{formatDateDMY(o.createdAt.slice(0, 10)) || "—"}</td>
                      <td>
                        <div className={styles.actions}>
                          <button className={styles.iconBtn} onClick={() => openEdit(o)} aria-label="Edit offer" title="Edit">
                            {EditIcon}
                          </button>
                          <button
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                            onClick={() => onDelete(o)}
                            aria-label="Delete offer"
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

      <Modal open={modalOpen} onClose={closeModal} title={editingId ? "Edit offer" : "Add offer section"} maxWidth={900}>
        {rows.map((r, i) => (
          <div key={i} className={styles.offerRow}>
            <div className={styles.field}>
              <label htmlFor={`o-name-${i}`}>Package Name</label>
              <select
                id={`o-name-${i}`}
                value={r.packageName}
                onChange={(e) => updateRow(i, { packageName: e.target.value })}
              >
                <option value="">{packageNames.length === 0 ? "No packages found" : "Select a package…"}</option>
                {/* An offer saved earlier for a package that's since been
                    renamed or deleted keeps its name as an option. */}
                {r.packageName && !packageNames.includes(r.packageName) && (
                  <option value={r.packageName}>{r.packageName}</option>
                )}
                {packageNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor={`o-target-${i}`}>Target Amount (₹)</label>
              <input
                id={`o-target-${i}`}
                inputMode="decimal"
                value={r.targetAmount}
                placeholder="e.g. 500000"
                onChange={(e) => updateRow(i, { targetAmount: e.target.value })}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={`o-from-${i}`}>From Date</label>
              <input
                id={`o-from-${i}`}
                type="date"
                value={r.fromDate}
                max={r.toDate || undefined}
                onChange={(e) => updateRow(i, { fromDate: e.target.value })}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={`o-to-${i}`}>To Date</label>
              <input
                id={`o-to-${i}`}
                type="date"
                value={r.toDate}
                min={r.fromDate || undefined}
                onChange={(e) => updateRow(i, { toDate: e.target.value })}
              />
            </div>
            {!editingId && rows.length > 1 && (
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconBtnDanger} ${styles.offerRowRemove}`}
                onClick={() => removeRow(i)}
                aria-label={`Remove row ${i + 1}`}
                title="Remove row"
              >
                {RemoveRowIcon}
              </button>
            )}
          </div>
        ))}

        {!editingId && (
          <button type="button" className={styles.addRowBtn} onClick={addRow}>
            + Add row
          </button>
        )}

        {missingName && <div className={`${styles.msg} ${styles.err}`}>Every row with a target amount needs a package selected.</div>}
        {badDates && <div className={`${styles.msg} ${styles.err}`}>From Date must be on or before To Date.</div>}
        {formErr && <div className={`${styles.msg} ${styles.err}`}>{formErr}</div>}

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={closeModal} disabled={busy}>
            Cancel
          </button>
          <button className={styles.submit} onClick={onSubmit} disabled={!canSubmit}>
            {busy
              ? "Saving…"
              : editingId
              ? "Save changes"
              : `Save${filledRows.length > 1 ? ` all ${filledRows.length}` : ""}`}
          </button>
        </div>
      </Modal>
    </>
  );
}
