"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, AccountEntry } from "@/lib/api";
import { formatDateDMY } from "@/lib/dates";
import Navbar from "@/components/Navbar";
import RefreshButton from "@/components/RefreshButton";
import Modal from "@/components/Modal";
import Toast, { ToastState } from "@/components/Toast";
import dash from "../dashboard.module.css";
import styles from "./accounts.module.css";
import AttachmentsModal from "./AttachmentsModal";
import ViewEntryModal from "./ViewEntryModal";

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

const ViewIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const AttachIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path
      d="m21 11-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PAYMENT_MODE_OPTIONS = ["Cash", "UPI", "Net Banking", "Cheque", "Account Transfer"];

type FormState = {
  slNo: string;
  date: string;
  invoiceNo: string;
  agent: string;
  clientName: string;
  name: string;
  destination: string;
  handOverTo: string;
  debit: string;
  credit: string;
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
  name: "",
  destination: "",
  handOverTo: "",
  debit: "",
  credit: "",
  balance: "",
  paymentMode: "Cash",
  description: "",
};

type EntryGroup = {
  key: string;
  invoiceNo: string;
  clientName: string;
  name: string;
  slNo: string;
  date: string;
  agent: string;
  destination: string;
  handOverTo: string;
  entries: AccountEntry[];
};

// Groups ledger rows the same way Travel List groups bookings — one client
// making 3-4 advance payments shows up as one collapsible row (the shared
// Sl No/Date/Invoice/Agent/Client/Destination/Hand Over To merged via
// rowSpan) instead of 3-4 near-identical-looking rows. Grouped by Invoice
// No + Client Name, since that's the pair that's actually shared across a
// booking's synced payments; an entry with no invoice number (a one-off
// manual row) just gets its own singleton group.
function groupEntries(entries: AccountEntry[]): EntryGroup[] {
  const map = new Map<string, EntryGroup>();
  const order: string[] = [];
  for (const e of entries) {
    const key = e.invoiceNo.trim()
      ? `${e.invoiceNo.trim().toLowerCase()}__${e.clientName.trim().toLowerCase()}`
      : `single__${e.id}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        invoiceNo: e.invoiceNo,
        clientName: e.clientName,
        name: e.name,
        slNo: e.slNo,
        date: e.date,
        agent: e.agent,
        destination: e.destination,
        handOverTo: e.handOverTo,
        entries: [],
      };
      map.set(key, g);
      order.push(key);
    }
    g.entries.push(e);
  }
  return order.map((k) => map.get(k)!);
}

export default function AccountsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  // Same "Account" role check as Sidebar's menu gate — a direct URL visit
  // shouldn't reach this page for anyone else, even though the backend
  // itself is the real enforcement (see routes/accounts.py).
  const isAccountRole = (user?.roleNames || []).some(
    (rn) => rn.trim().toLowerCase() === "account"
  );
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
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  // Entry whose Files modal is open — kept by id so it tracks upload/delete
  // updates written back into `entries`.
  const [filesEntryId, setFilesEntryId] = useState<string | null>(null);
  // Details modal. "Upload / manage files" in it swaps to the Files modal,
  // and closing that returns here (filesFromView).
  const [viewEntryId, setViewEntryId] = useState<string | null>(null);
  const [filesFromView, setFilesFromView] = useState(false);

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  // Defaults to fully allowed (matches the backend's default — see
  // routes/access.py) so buttons don't flash-hide before this resolves.
  // Admin never fetches this; they're never restricted.
  const [perms, setPerms] = useState({ create: true, edit: true, delete: true });

  useEffect(() => {
    if (user && !allowed) router.replace("/dashboard");
  }, [user, allowed, router]);

  useEffect(() => {
    if (!allowed || isAdmin) return;
    api
      .getMyAccess()
      .then((info) => {
        const g = info.grants.find((g) => g.roleName.trim().toLowerCase() === "account");
        if (g) setPerms({ create: g.create, edit: g.edit, delete: g.delete });
      })
      .catch(() => {});
  }, [allowed, isAdmin]);

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

  const groups = useMemo(() => groupEntries(filtered), [filtered]);

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
      name: entry.name,
      destination: entry.destination,
      handOverTo: entry.handOverTo,
      debit: entry.debit,
      credit: entry.credit,
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

  // Client Name is optional — a manual entry doesn't have to be tied to a
  // known booking client, so the only real requirement is some amount.
  const canSubmit = (form.debit.trim() || form.credit.trim() || form.balance.trim()) && !busy;

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
              <RefreshButton onRefresh={load} />
              {(isAdmin || perms.create) && (
                <button className={styles.createBtn} onClick={openCreate}>
                  + Add Entry
                </button>
              )}
            </div>
          </div>

          {!loaded ? (
            <div className={styles.empty}>Loading…</div>
          ) : groups.length === 0 ? (
            <div className={styles.empty}>
              {search ? "No entries match your search." : "No entries yet."}
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th></th>
                    <th>Sl No</th>
                    <th>Date</th>
                    <th>Invoice No</th>
                    <th>Agent</th>
                    <th>Client Name</th>
                    <th>Name</th>
                    <th>Destination</th>
                    <th>Hand Over To</th>
                    <th>Debit</th>
                    <th>Credit</th>
                    <th>Balance</th>
                    <th>Payment Mode</th>
                    <th>Description</th>
                    <th>Approval</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const isMulti = g.entries.length > 1;
                    const open = openGroups.has(g.key);
                    // Collapsed multi-payment groups only render their
                    // first payment's row — same "click to see the rest"
                    // idea as Travel List's date groups.
                    const rows = isMulti && !open ? [g.entries[0]] : g.entries;
                    return rows.map((e, i) => (
                      <tr key={e.id} className={isMulti ? styles.groupedRow : undefined}>
                        {i === 0 && (
                          <td className={styles.chevronCell} rowSpan={rows.length}>
                            {isMulti && (
                              <button
                                type="button"
                                className={`${styles.chevronBtn} ${open ? styles.chevronOpen : ""}`}
                                onClick={() => toggleGroup(g.key)}
                                aria-expanded={open}
                                aria-label={open ? "Collapse payments" : "Expand payments"}
                                title={`${g.entries.length} payments for this invoice`}
                              >
                                {ChevronIcon}
                              </button>
                            )}
                          </td>
                        )}
                        {i === 0 && (
                          <>
                            <td rowSpan={rows.length}>{g.slNo || "—"}</td>
                            <td rowSpan={rows.length}>{formatDateDMY(g.date) || "—"}</td>
                            <td rowSpan={rows.length}>{g.invoiceNo || "—"}</td>
                            <td rowSpan={rows.length}>{g.agent || "—"}</td>
                            <td rowSpan={rows.length}>
                              {g.clientName || "—"}
                              {isMulti && (
                                <span className={styles.paymentBadge}>{g.entries.length}×</span>
                              )}
                            </td>
                            <td rowSpan={rows.length}>{g.name || "—"}</td>
                            <td rowSpan={rows.length}>{g.destination || "—"}</td>
                            <td rowSpan={rows.length}>{g.handOverTo || "—"}</td>
                          </>
                        )}
                        <td className={styles.debit}>
                          {e.debit
                            ? `₹ ${Number(e.debit).toLocaleString("en-IN")} DR`
                            : "—"}
                        </td>
                        <td className={styles.credit}>
                          {e.credit
                            ? `₹ ${Number(e.credit).toLocaleString("en-IN")} CR`
                            : "—"}
                        </td>
                        <td>{e.balance ? `₹ ${Number(e.balance).toLocaleString("en-IN")}` : "—"}</td>
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
                                e.approved
                                  ? "Approved — click to revoke"
                                  : "Not approved — click to approve"
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
                              onClick={() => setViewEntryId(e.id)}
                              aria-label="View entry details"
                              title="View details and files"
                            >
                              {ViewIcon}
                            </button>
                            <button
                              className={`${styles.iconBtn} ${styles.attachBtn} ${
                                e.attachments?.length ? styles.attachBtnHas : ""
                              }`}
                              onClick={() => {
                                setFilesFromView(false);
                                setFilesEntryId(e.id);
                              }}
                              aria-label="Upload or view files"
                              title={
                                e.attachments?.length
                                  ? `${e.attachments.length} file${e.attachments.length === 1 ? "" : "s"} — click to view or upload`
                                  : "Upload files"
                              }
                            >
                              {AttachIcon}
                              {e.attachments?.length > 0 && (
                                <span className={styles.attachCount}>{e.attachments.length}</span>
                              )}
                            </button>
                            {(isAdmin || perms.edit) && (
                              <button
                                className={styles.iconBtn}
                                onClick={() => openEdit(e)}
                                aria-label="Edit entry"
                                title="Edit"
                              >
                                {EditIcon}
                              </button>
                            )}
                            {(isAdmin || perms.delete) && (
                              <button
                                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                onClick={() => onDelete(e)}
                                aria-label="Delete entry"
                                title="Delete"
                              >
                                {DeleteIcon}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ));
                  })}
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
            <label htmlFor="a-client">Client Name (optional)</label>
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
            <label htmlFor="a-name">Name</label>
            <input
              id="a-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="a-destination">Destination</label>
          <textarea
            id="a-destination"
            rows={3}
            value={form.destination}
            onChange={(e) => setForm({ ...form, destination: e.target.value })}
          />
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
            <label htmlFor="a-debit">Debit (Rs.)</label>
            <input
              id="a-debit"
              value={form.debit}
              placeholder="e.g. 5000"
              onChange={(e) => setForm({ ...form, debit: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="a-credit">Credit (Rs.)</label>
            <input
              id="a-credit"
              value={form.credit}
              placeholder="e.g. 5000"
              onChange={(e) => setForm({ ...form, credit: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="a-balance">Balance (Rs.)</label>
            <input
              id="a-balance"
              value={form.balance}
              placeholder="e.g. 5000"
              onChange={(e) => setForm({ ...form, balance: e.target.value })}
            />
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

      <ViewEntryModal
        entry={entries.find((x) => x.id === viewEntryId) ?? null}
        onClose={() => setViewEntryId(null)}
        onManageFiles={(entry) => {
          setViewEntryId(null);
          setFilesFromView(true);
          setFilesEntryId(entry.id);
        }}
      />

      <AttachmentsModal
        entry={entries.find((x) => x.id === filesEntryId) ?? null}
        onClose={() => {
          if (filesFromView) setViewEntryId(filesEntryId);
          setFilesFromView(false);
          setFilesEntryId(null);
        }}
        onUpdated={(updated) =>
          setEntries((list) => list.map((x) => (x.id === updated.id ? updated : x)))
        }
        canDelete={isAdmin || perms.delete}
      />
    </>
  );
}
