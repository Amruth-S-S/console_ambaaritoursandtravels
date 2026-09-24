"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, AccountEntry } from "@/lib/api";
import { formatDateDMY } from "@/lib/dates";
import Navbar from "@/components/Navbar";
import Modal from "@/components/Modal";
import Toast, { ToastState } from "@/components/Toast";
import dash from "../dashboard.module.css";
import styles from "./accounts.module.css";

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

const DEBIT_CREDIT_OPTIONS = ["Debit", "Credit"];
const PAYMENT_MODE_OPTIONS = ["Cash", "UPI", "Net Banking", "Cheque"];

type FormState = {
  slNo: string;
  date: string;
  invoiceNo: string;
  agent: string;
  clientName: string;
  destination: string;
  handOverTo: string;
  debitCredit: string;
  balance: string;
  paymentMode: string;
  description: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm: FormState = {
  slNo: "",
  date: "",
  invoiceNo: "",
  agent: "",
  clientName: "",
  destination: "",
  handOverTo: "",
  debitCredit: "Credit",
  balance: "",
  paymentMode: "Cash",
  description: "",
};

export default function AccountsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  // Same "Account" role check as Sidebar's menu gate — a direct URL visit
  // shouldn't reach this page for anyone else, even though the backend
  // itself is the real enforcement (see routes/accounts.py).
  const isAccountRole = (user?.roleName || "").trim().toLowerCase() === "account";
  const allowed = isAdmin || isAccountRole;

  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const [clientNames, setClientNames] = useState<string[]>([]);
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
      setEntries(await api.listAccounts());
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load entries");
    } finally {
      setLoaded(true);
    }
    // Decoupled from the main load above — the client dropdown just has
    // fewer options if this fails, it shouldn't block the ledger itself.
    // getClientDirectory() (unlike listBookings) works even for a non-admin
    // with no bookings of their own — see routes/bookings.py's /clients —
    // which is the normal case for someone whose whole job is ledger entry.
    api
      .getClientDirectory()
      .then((clients) => setClientNames(clients.map((c) => c.clientName)))
      .catch(() => {});
  }

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.slNo.toLowerCase().includes(q) ||
        e.invoiceNo.toLowerCase().includes(q) ||
        e.agent.toLowerCase().includes(q) ||
        e.clientName.toLowerCase().includes(q) ||
        e.destination.toLowerCase().includes(q) ||
        e.handOverTo.toLowerCase().includes(q)
    );
  }, [entries, search]);

  async function openCreate() {
    setMode("create");
    setEditingId(null);
    setForm({ ...emptyForm, date: todayIso() });
    setFormErr("");
    setModalOpen(true);
    // Prefills a reasonable next number — editable, not enforced, same
    // "best guess, correctable" spirit as the booking form's invoice number.
    try {
      const { slNo } = await api.getNextSlNo();
      setForm((f) => ({ ...f, slNo }));
    } catch {
      // Leave it blank — the field is still editable by hand.
    }
  }

  function openEdit(entry: AccountEntry) {
    setMode("edit");
    setEditingId(entry.id);
    setForm({
      slNo: entry.slNo,
      date: entry.date,
      invoiceNo: entry.invoiceNo,
      agent: entry.agent,
      clientName: entry.clientName,
      destination: entry.destination,
      handOverTo: entry.handOverTo,
      debitCredit: entry.debitCredit,
      balance: entry.balance,
      paymentMode: entry.paymentMode,
      description: entry.description,
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
        await api.createAccount({ ...form });
        notify("ok", "Entry added");
      } else if (editingId) {
        await api.updateAccount(editingId, { ...form });
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

  function onDelete(entry: AccountEntry) {
    window.clearTimeout(toastTimer.current);
    setToast({
      type: "confirm",
      text: `Delete this entry for ${entry.clientName || "this client"}? This cannot be undone.`,
      onCancel: () => setToast(null),
      onConfirm: async () => {
        setToast(null);
        try {
          await api.deleteAccount(entry.id);
          notify("ok", "Entry deleted");
          load();
        } catch (e) {
          notify("err", e instanceof Error ? e.message : "Failed to delete");
        }
      },
    });
  }

  // Admin-only, enforced again server-side — the Account role only ever
  // sees the resulting green/grey badge below, never this control.
  async function toggleApproval(entry: AccountEntry) {
    setApprovalBusyId(entry.id);
    try {
      const updated = await api.setAccountApproval(entry.id, !entry.approved);
      setEntries((list) => list.map((e) => (e.id === entry.id ? updated : e)));
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to update approval");
    } finally {
      setApprovalBusyId(null);
    }
  }

  if (user && !allowed) return null;

  const canSubmit = form.clientName.trim() && form.balance.trim() && !busy;

  return (
    <>
      <Navbar title="Account" />
      <Toast toast={toast} />
      <div className={dash.content}>
        <section className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div className={styles.tableHeadLeft}>
              <h3>Ledger entries</h3>
              <span className={styles.count}>{entries.length} total</span>
            </div>
            <div className={styles.tableHeadRight}>
              <div className={styles.search}>
                <span className={styles.searchIcon}>{SearchIcon}</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by agent, client, destination…"
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
                    <th>Date</th>
                    <th>Invoice No</th>
                    <th>Agent</th>
                    <th>Client Name</th>
                    <th>Destination</th>
                    <th>Hand Over To</th>
                    <th>Debit/Credit</th>
                    <th>Balance</th>
                    <th>Payment Mode</th>
                    <th>Description</th>
                    <th>Approval</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id}>
                      <td>{e.slNo || "—"}</td>
                      <td>{formatDateDMY(e.date) || "—"}</td>
                      <td>{e.invoiceNo || "—"}</td>
                      <td>{e.agent || "—"}</td>
                      <td>{e.clientName || "—"}</td>
                      <td>{e.destination || "—"}</td>
                      <td>{e.handOverTo || "—"}</td>
                      <td className={e.debitCredit === "Debit" ? styles.debit : styles.credit}>
                        {e.debitCredit || "—"}
                      </td>
                      <td>₹ {(Number(e.balance) || 0).toLocaleString("en-IN")}</td>
                      <td>{e.paymentMode || "—"}</td>
                      <td className={styles.descCell} title={e.description || undefined}>
                        {e.description || "—"}
                      </td>
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
        title={mode === "create" ? "Add ledger entry" : "Edit ledger entry"}
        maxWidth={720}
      >
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="a-slno">Sl No</label>
            <input
              id="a-slno"
              value={form.slNo}
              onChange={(e) => setForm({ ...form, slNo: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="a-date">Date</label>
            <input
              id="a-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="a-invoice">Invoice No</label>
            <input
              id="a-invoice"
              value={form.invoiceNo}
              onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="a-agent">Agent</label>
            <input
              id="a-agent"
              value={form.agent}
              onChange={(e) => setForm({ ...form, agent: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="a-client">Client Name</label>
            <select
              id="a-client"
              value={form.clientName}
              onChange={(e) => setForm({ ...form, clientName: e.target.value })}
            >
              <option value="">
                {clientNames.length === 0 ? "No clients found" : "Select a client…"}
              </option>
              {clientNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="a-destination">Destination</label>
            <input
              id="a-destination"
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="a-handover">Hand Over To</label>
            <input
              id="a-handover"
              value={form.handOverTo}
              onChange={(e) => setForm({ ...form, handOverTo: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="a-debitcredit">Debit/Credit</label>
            <select
              id="a-debitcredit"
              value={form.debitCredit}
              onChange={(e) => setForm({ ...form, debitCredit: e.target.value })}
            >
              {DEBIT_CREDIT_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="a-balance">Balance (Rs.)</label>
            <input
              id="a-balance"
              value={form.balance}
              placeholder="e.g. 5000"
              onChange={(e) => setForm({ ...form, balance: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="a-paymentmode">Payment Mode</label>
          <select
            id="a-paymentmode"
            value={form.paymentMode}
            onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
          >
            {PAYMENT_MODE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="a-description">Description</label>
          <textarea
            id="a-description"
            rows={3}
            value={form.description}
            placeholder="Any additional notes for this entry…"
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
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
