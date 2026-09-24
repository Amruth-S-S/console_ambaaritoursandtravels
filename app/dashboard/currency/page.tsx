"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, CurrencyEntry } from "@/lib/api";
import { formatDateDMY } from "@/lib/dates";
import Navbar from "@/components/Navbar";
import Modal from "@/components/Modal";
import Toast, { ToastState } from "@/components/Toast";
import dash from "../dashboard.module.css";
// Reusing the Account ledger's styling — same shape of page (search,
// create button, table, admin-only approval toggle, multi-field modal).
import styles from "../accounts/accounts.module.css";

const SearchIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" strokeLinecap="round" />
  </svg>
);

const EditIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path
      d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
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

const CURRENCY_OPTIONS = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "THB",
  "MYR",
  "SGD",
  "AED",
  "AUD",
  "JPY",
  "CNY",
  "CAD",
  "CHF",
  "NZD",
  "HKD",
  "SAR",
  "IDR",
  "VND",
  "NPR",
  "LKR",
];

type FormState = {
  slNo: string;
  travelDate: string;
  passportNumber: string;
  clientName: string;
  phoneNumber: string;
  currency: string;
  amount: string;
  clientAmount: string;
  currencyConversion: string;
  handOverTo: string;
};

const emptyForm: FormState = {
  slNo: "",
  travelDate: "",
  passportNumber: "",
  clientName: "",
  phoneNumber: "",
  currency: "USD",
  amount: "",
  clientAmount: "",
  currencyConversion: "",
  handOverTo: "",
};

export default function CurrencyLedgerPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  // Same "Currency" role check as Sidebar's menu gate — a direct URL visit
  // shouldn't reach this page for anyone else, even though the backend
  // itself is the real enforcement (see routes/currency_entries.py).
  const isCurrencyRole = (user?.roleName || "").trim().toLowerCase() === "currency";
  const allowed = isAdmin || isCurrencyRole;

  const [entries, setEntries] = useState<CurrencyEntry[]>([]);
  const [clientOptions, setClientOptions] = useState<{ clientName: string; clientPhone: string }[]>([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (user && !allowed) router.replace("/dashboard");
  }, [user, allowed, router]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function notify(type: "ok" | "err", text: string) {
    window.clearTimeout(toastTimer.current);
    setToast({ type, text });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  async function load() {
    try {
      setEntries(await api.listCurrencyEntries());
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load entries");
    } finally {
      setLoaded(true);
    }
    // Decoupled from the main load above (not awaited together) — the
    // client dropdown just has fewer options if this fails, it shouldn't
    // block the ledger itself from showing. getClientDirectory() (unlike
    // listBookings) works even for a non-admin with no bookings of their
    // own — see routes/bookings.py's /clients — which is the normal case
    // for someone whose whole job is currency/account ledger entry.
    api.getClientDirectory().then(setClientOptions).catch(() => {});
  }

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  function onClientNameChange(clientName: string) {
    const match = clientOptions.find((c) => c.clientName === clientName);
    setForm((f) => ({ ...f, clientName, phoneNumber: match ? match.clientPhone : f.phoneNumber }));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.slNo.toLowerCase().includes(q) ||
        e.passportNumber.toLowerCase().includes(q) ||
        e.clientName.toLowerCase().includes(q) ||
        e.phoneNumber.toLowerCase().includes(q) ||
        e.currency.toLowerCase().includes(q) ||
        e.handOverTo.toLowerCase().includes(q)
    );
  }, [entries, search]);

  async function openCreate() {
    setMode("create");
    setEditingId(null);
    setForm(emptyForm);
    setFormErr("");
    setModalOpen(true);
    try {
      const { slNo } = await api.getNextCurrencySlNo();
      setForm((f) => ({ ...f, slNo }));
    } catch {
      // Leave it blank — the field is still editable by hand.
    }
  }

  function openEdit(entry: CurrencyEntry) {
    setMode("edit");
    setEditingId(entry.id);
    setForm({
      slNo: entry.slNo,
      travelDate: entry.travelDate,
      passportNumber: entry.passportNumber,
      clientName: entry.clientName,
      phoneNumber: entry.phoneNumber,
      currency: entry.currency,
      amount: entry.amount,
      clientAmount: entry.clientAmount,
      currencyConversion: entry.currencyConversion,
      handOverTo: entry.handOverTo,
    });
    setFormErr("");
    setModalOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
  }

  async function onSubmit() {
    setFormErr("");
    setBusy(true);
    try {
      if (mode === "create") {
        await api.createCurrencyEntry({ ...form });
        notify("ok", "Entry added");
      } else if (editingId) {
        await api.updateCurrencyEntry(editingId, { ...form });
        notify("ok", "Entry updated");
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function onDelete(entry: CurrencyEntry) {
    window.clearTimeout(toastTimer.current);
    setToast({
      type: "confirm",
      text: `Delete this entry for ${entry.clientName || "this client"}? This cannot be undone.`,
      onCancel: () => setToast(null),
      onConfirm: async () => {
        setToast(null);
        try {
          await api.deleteCurrencyEntry(entry.id);
          notify("ok", "Entry deleted");
          load();
        } catch (e) {
          notify("err", e instanceof Error ? e.message : "Failed to delete");
        }
      },
    });
  }

  // Admin-only, enforced again server-side — the Currency role only ever
  // sees the resulting green/grey badge below, never this control.
  async function toggleApproval(entry: CurrencyEntry) {
    setApprovalBusyId(entry.id);
    try {
      const updated = await api.setCurrencyApproval(entry.id, !entry.approved);
      setEntries((list) => list.map((e) => (e.id === entry.id ? updated : e)));
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to update approval");
    } finally {
      setApprovalBusyId(null);
    }
  }

  if (user && !allowed) return null;

  const canSubmit = form.clientName.trim() && form.amount.trim() && !busy;

  return (
    <>
      <Navbar title="Currency" />
      <Toast toast={toast} />
      <div className={dash.content}>
        <section className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div className={styles.tableHeadLeft}>
              <h3>Currency exchange entries</h3>
              <span className={styles.count}>{entries.length} total</span>
            </div>
            <div className={styles.tableHeadRight}>
              <div className={styles.search}>
                <span className={styles.searchIcon}>{SearchIcon}</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by client, passport, currency…"
                />
              </div>
              <button className={styles.createBtn} onClick={openCreate}>
                + Add Entry
              </button>
            </div>
          </div>

          {!loaded ? (
            <div className={styles.empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              {search ? "No entries match your search." : "No entries yet."}
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Sl No</th>
                    <th>Travel Date</th>
                    <th>Passport Number</th>
                    <th>Client Name</th>
                    <th>Phone Number</th>
                    <th>Currency</th>
                    <th>Client Amount</th>
                    <th>Currency Conversion</th>
                    <th>Amount (INR)</th>
                    <th>Hand Over To</th>
                    <th>Approval</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id}>
                      <td>{e.slNo || "—"}</td>
                      <td>{formatDateDMY(e.travelDate) || "—"}</td>
                      <td>{e.passportNumber || "—"}</td>
                      <td>{e.clientName || "—"}</td>
                      <td>{e.phoneNumber || "—"}</td>
                      <td>{e.currency || "—"}</td>
                      <td>{e.clientAmount || "—"}</td>
                      <td>{e.currencyConversion || "—"}</td>
                      <td>₹ {(Number(e.amount) || 0).toLocaleString("en-IN")}</td>
                      <td>{e.handOverTo || "—"}</td>
                      <td>
                        {isAdmin ? (
                          <button
                            type="button"
                            className={`${styles.approveToggle} ${
                              e.approved ? styles.approveToggleOn : ""
                            }`}
                            onClick={() => toggleApproval(e)}
                            disabled={approvalBusyId === e.id}
                            aria-label={e.approved ? "Mark as not approved" : "Mark as approved"}
                            title={
                              e.approved ? "Approved — click to revoke" : "Not approved — click to approve"
                            }
                          >
                            <span className={styles.approveToggleDot} />
                          </button>
                        ) : (
                          <span
                            className={`${styles.approveBadge} ${
                              e.approved ? styles.approveBadgeOn : styles.approveBadgeOff
                            }`}
                          >
                            {e.approved ? "Approved" : "Pending"}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            className={styles.iconBtn}
                            onClick={() => openEdit(e)}
                            aria-label="Edit entry"
                            title="Edit"
                          >
                            {EditIcon}
                          </button>
                          <button
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                            onClick={() => onDelete(e)}
                            aria-label="Delete entry"
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
        title={mode === "create" ? "Add currency entry" : "Edit currency entry"}
        maxWidth={720}
      >
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="c-slno">Sl No</label>
            <input
              id="c-slno"
              value={form.slNo}
              onChange={(e) => setForm({ ...form, slNo: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="c-traveldate">Travel Date</label>
            <input
              id="c-traveldate"
              type="date"
              value={form.travelDate}
              onChange={(e) => setForm({ ...form, travelDate: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="c-passport">Passport Number</label>
            <input
              id="c-passport"
              value={form.passportNumber}
              onChange={(e) => setForm({ ...form, passportNumber: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="c-client">Client Name</label>
            <select
              id="c-client"
              value={form.clientName}
              onChange={(e) => onClientNameChange(e.target.value)}
            >
              <option value="">
                {clientOptions.length === 0 ? "No clients found" : "Select a client…"}
              </option>
              {clientOptions.map((c) => (
                <option key={c.clientName} value={c.clientName}>
                  {c.clientName}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="c-phone">Phone Number</label>
            <input
              id="c-phone"
              type="tel"
              value={form.phoneNumber}
              placeholder="Auto-filled from the client's booking"
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="c-handover">Hand Over To</label>
            <input
              id="c-handover"
              value={form.handOverTo}
              onChange={(e) => setForm({ ...form, handOverTo: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="c-currency">Currency</label>
            <select
              id="c-currency"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="c-clientamount">Client Amount</label>
            <input
              id="c-clientamount"
              value={form.clientAmount}
              placeholder="e.g. 500"
              onChange={(e) => setForm({ ...form, clientAmount: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="c-conversion">Currency Conversion</label>
            <input
              id="c-conversion"
              value={form.currencyConversion}
              placeholder="e.g. 83.50"
              onChange={(e) => setForm({ ...form, currencyConversion: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="c-amount">Amount (INR)</label>
            <input
              id="c-amount"
              value={form.amount}
              placeholder="e.g. 25000"
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
        </div>

        {formErr && <div className={`${styles.msg} ${styles.err}`}>{formErr}</div>}

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={closeModal} disabled={busy}>
            Cancel
          </button>
          <button className={styles.submit} onClick={onSubmit} disabled={!canSubmit}>
            {busy ? "Saving…" : mode === "create" ? "Save" : "Save changes"}
          </button>
        </div>
      </Modal>
    </>
  );
}
