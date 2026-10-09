"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { canUseMenu } from "@/lib/menus";
import { api, DmcAccount, DmcAccountInput } from "@/lib/api";
import { formatDateDMY } from "@/lib/dates";
import Navbar from "@/components/Navbar";
import Modal from "@/components/Modal";
import RefreshButton from "@/components/RefreshButton";
import Toast, { ToastState } from "@/components/Toast";
import dash from "../dashboard.module.css";
// Same page shape as the Account/Currency ledgers — reuse their styling.
import styles from "../accounts/accounts.module.css";
// Collapsible destination groups reuse the Travel List's look.
import tl from "../travel-list/travel-list.module.css";
// Same Files (upload) and View windows as the Account ledger.
import AttachmentsModal from "../accounts/AttachmentsModal";
import EntryDetailsModal, { dateTime } from "../accounts/EntryDetailsModal";
import { money } from "../accounts/ViewEntryModal";

const dmcFileApi = {
  upload: api.uploadDmcAttachment,
  get: api.getDmcAttachment,
  remove: api.deleteDmcAttachment,
};

const ChevronIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
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

// Same list as the Account ledger's Payment Mode dropdown.
const PAYMENT_MODE_OPTIONS = ["Cash", "UPI", "Net Banking", "Cheque", "Account Transfer"];

const emptyForm: DmcAccountInput = {
  slNo: "",
  name: "",
  travelDate: "",
  paymentFrom: "",
  paymentTo: "",
  paymentMode: "Account Transfer",
  destination: "",
  numberOfTravelers: "",
  perPersonQuotation: "",
  totalAmount: "",
  debit: "",
  credit: "",
  balance: "",
  note: "",
};

// Amounts are free text and may contain commas ("1,50,000").
function toNumber(v: string): number {
  return Number((v || "").replace(/[^0-9.]/g, "")) || 0;
}

// Balance = Debit - Credit; blank until either is entered.
function computedBalance(f: DmcAccountInput): string {
  if (!f.debit.trim() && !f.credit.trim()) return "";
  return String(toNumber(f.debit) - toNumber(f.credit));
}

// Signed amounts for display — more credit than debit shows as negative.
function formatSigned(v: string): string {
  if (!v) return "—";
  const n = Number(v.replace(/[^0-9.-]/g, "")) || 0;
  return `${n < 0 ? "-" : ""}₹ ${Math.abs(n).toLocaleString("en-IN")}`;
}

function computedTotal(f: DmcAccountInput): string {
  const t = toNumber(f.numberOfTravelers) * toNumber(f.perPersonQuotation);
  return t ? String(t) : "";
}

export default function DmcAccountsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  // Same role check as Sidebar's menu gate — the backend is the real
  // enforcement (routes/dmc_accounts.py).
  const isDmcRole = (user?.roleNames || []).some((rn) => rn.trim().toLowerCase() === "dmc account");
  const allowed = isAdmin || isDmcRole || canUseMenu(user, "dmc-accounts");

  const [entries, setEntries] = useState<DmcAccount[]>([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DmcAccountInput>(emptyForm);
  // Once someone types their own Total Amount, stop overwriting it from
  // travellers x quotation.
  const [totalTouched, setTotalTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  // Files / View windows, tracked by id so upload/delete updates written
  // back into `entries` show straight away. "Upload / manage files" in View
  // swaps to Files, and closing Files returns to View (filesFromView).
  const [filesEntryId, setFilesEntryId] = useState<string | null>(null);
  const [viewEntryId, setViewEntryId] = useState<string | null>(null);
  const [filesFromView, setFilesFromView] = useState(false);

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  // Defaults to fully allowed (matches the backend default — see
  // routes/access.py) so buttons don't flash-hide before this resolves.
  const [perms, setPerms] = useState({ create: true, edit: true, delete: true });

  useEffect(() => {
    if (user && !allowed) router.replace("/dashboard");
  }, [user, allowed, router]);

  useEffect(() => {
    if (!allowed || isAdmin) return;
    api
      .getMyAccess()
      .then((info) => {
        const g = info.grants.find((g) => g.roleName.trim().toLowerCase() === "dmc account");
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
      setEntries(await api.listDmcAccounts());
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load entries");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.slNo, e.name, e.destination, e.paymentFrom, e.paymentTo, e.paymentMode, e.note, formatDateDMY(e.travelDate)]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [entries, search]);

  // Travel List-style layout: one collapsible row per destination (case and
  // spacing ignored, first spelling shown), A–Z, with totals in the header.
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; entries: DmcAccount[]; travellers: number; debit: number; credit: number; balance: number }
    >();
    for (const e of filtered) {
      const label = e.destination.trim().replace(/\s+/g, " ");
      const key = label.toLowerCase() || "__none__";
      let g = map.get(key);
      if (!g) {
        g = { key, label: label || "No destination", entries: [], travellers: 0, debit: 0, credit: 0, balance: 0 };
        map.set(key, g);
      }
      g.entries.push(e);
      g.travellers += toNumber(e.numberOfTravelers);
      g.debit += toNumber(e.debit);
      g.credit += toNumber(e.credit);
      g.balance += Number((e.balance || "").replace(/[^0-9.-]/g, "")) || 0;
    }
    return Array.from(map.values()).sort((a, b) =>
      a.key === "__none__" ? 1 : b.key === "__none__" ? -1 : a.label.localeCompare(b.label)
    );
  }, [filtered]);

  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  function toggleGroup(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const balanceTotal = useMemo(
    () => filtered.reduce((sum, e) => sum + (Number((e.balance || "").replace(/[^0-9.-]/g, "")) || 0), 0),
    [filtered]
  );

  const grandTotal = useMemo(
    () => filtered.reduce((sum, e) => sum + toNumber(e.totalAmount), 0),
    [filtered]
  );

  function updateCalc(patch: Partial<DmcAccountInput>) {
    setForm((f) => {
      const next = { ...f, ...patch };
      return totalTouched ? next : { ...next, totalAmount: computedTotal(next) };
    });
  }

  async function openCreate() {
    setMode("create");
    setEditingId(null);
    setForm(emptyForm);
    setTotalTouched(false);
    setFormErr("");
    setModalOpen(true);
    try {
      const { slNo } = await api.getNextDmcSlNo();
      setForm((f) => ({ ...f, slNo }));
    } catch {
      // Leave it blank — still editable by hand.
    }
  }

  function openEdit(entry: DmcAccount) {
    const input = Object.fromEntries(
      (Object.keys(emptyForm) as (keyof DmcAccountInput)[]).map((k) => [k, entry[k] ?? ""])
    ) as DmcAccountInput;
    setMode("edit");
    setEditingId(entry.id);
    setForm(input);
    // A saved total that differs from the product was typed by hand — keep it.
    setTotalTouched(!!input.totalAmount && toNumber(input.totalAmount) !== toNumber(computedTotal(input)));
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
        await api.createDmcAccount({ ...form, balance: computedBalance(form) });
        notify("ok", "Entry added");
      } else if (editingId) {
        await api.updateDmcAccount(editingId, { ...form, balance: computedBalance(form) });
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

  function onDelete(entry: DmcAccount) {
    window.clearTimeout(toastTimer.current);
    setToast({
      type: "confirm",
      text: `Delete DMC entry ${entry.slNo ? `#${entry.slNo}` : ""} for ${entry.name || "this client"}? This cannot be undone.`,
      onCancel: () => setToast(null),
      onConfirm: async () => {
        setToast(null);
        try {
          await api.deleteDmcAccount(entry.id);
          notify("ok", "Entry deleted");
          load();
        } catch (e) {
          notify("err", e instanceof Error ? e.message : "Failed to delete");
        }
      },
    });
  }

  // Admin-only, enforced again server-side.
  async function toggleApproval(entry: DmcAccount) {
    setApprovalBusyId(entry.id);
    try {
      const updated = await api.setDmcApproval(entry.id, !entry.approved);
      setEntries((list) => list.map((e) => (e.id === entry.id ? updated : e)));
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to update approval");
    } finally {
      setApprovalBusyId(null);
    }
  }

  // One table per destination group (see `groups`).
  function renderTable(rows: DmcAccount[]) {
    return (
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Sl No</th>
              <th>Name</th>
              <th>Travel Date</th>
              <th>Payment From</th>
              <th>Payment To</th>
              <th>Mode of Payment</th>
                <th>No. of Travellers</th>
              <th>Per Person Quotation</th>
              <th>Total Amount</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Balance</th>
              <th>Note</th>
              <th>Approval</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{e.slNo || "—"}</td>
                <td>{e.name || "—"}</td>
                <td>{formatDateDMY(e.travelDate) || "—"}</td>
                <td>{e.paymentFrom || "—"}</td>
                <td>{e.paymentTo || "—"}</td>
                <td>{e.paymentMode || "—"}</td>
                <td>{e.numberOfTravelers || "—"}</td>
                <td>{e.perPersonQuotation ? `₹ ${toNumber(e.perPersonQuotation).toLocaleString("en-IN")}` : "—"}</td>
                <td>{e.totalAmount ? `₹ ${toNumber(e.totalAmount).toLocaleString("en-IN")}` : "—"}</td>
                <td>{e.debit ? `₹ ${toNumber(e.debit).toLocaleString("en-IN")}` : "—"}</td>
                <td>{e.credit ? `₹ ${toNumber(e.credit).toLocaleString("en-IN")}` : "—"}</td>
                <td>{formatSigned(e.balance)}</td>
                <td title={e.note} style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {e.note || "—"}
                </td>
                <td>
                  {isAdmin ? (
                    <button
                      type="button"
                      className={`${styles.approveToggle} ${e.approved ? styles.approveToggleOn : ""}`}
                      onClick={() => toggleApproval(e)}
                      disabled={approvalBusyId === e.id}
                      aria-label={e.approved ? "Mark as not approved" : "Mark as approved"}
                      title={e.approved ? "Approved — click to revoke" : "Not approved — click to approve"}
                    >
                      <span className={styles.approveToggleDot} />
                    </button>
                  ) : (
                    <span
                      className={`${styles.approveBadge} ${e.approved ? styles.approveBadgeOn : styles.approveBadgeOff}`}
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
                      <button className={styles.iconBtn} onClick={() => openEdit(e)} aria-label="Edit entry" title="Edit">
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
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (user && !allowed) return null;

  const canSubmit = form.name.trim() && !busy;

  function textField(id: string, label: string, key: keyof DmcAccountInput, placeholder?: string) {
    return (
      <div className={styles.field}>
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          value={form[key]}
          placeholder={placeholder}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      </div>
    );
  }

  function dateField(id: string, label: string, key: "travelDate") {
    return (
      <div className={styles.field}>
        <label htmlFor={id}>{label}</label>
        <input id={id} type="date" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      </div>
    );
  }

  return (
    <>
      <Navbar title="DMC Account" />
      <Toast toast={toast} />
      <div className={dash.content}>
        <section className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div className={styles.tableHeadLeft}>
              <h3>DMC account entries</h3>
              <span className={styles.count}>
                {groups.length} destination{groups.length === 1 ? "" : "s"} · {entries.length} entr
                {entries.length === 1 ? "y" : "ies"}
              </span>
              {filtered.length > 0 && (
                <span className={styles.count} title="Sum of Total Amount shown">
                  ₹ {grandTotal.toLocaleString("en-IN")}
                </span>
              )}
              {filtered.length > 0 && (
                <span className={styles.count} title="Sum of Balance shown">
                  Balance {formatSigned(String(balanceTotal))}
                </span>
              )}
            </div>
            <div className={styles.tableHeadRight}>
              <div className={styles.search}>
                <span className={styles.searchIcon}>{SearchIcon}</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, destination, payment…"
                />
              </div>
              <RefreshButton onRefresh={load} />
              {(isAdmin || perms.create) && (
                <button className={styles.createBtn} onClick={openCreate}>
                  + Add DMC Account
                </button>
              )}
            </div>
          </div>

          {!loaded ? (
            <div className={styles.empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>{search ? "No entries match your search." : "No entries yet."}</div>
          ) : (
            <div className={tl.list}>
              {groups.map((g) => {
                const open = !!search.trim() || openKeys.has(g.key);
                return (
                  <div key={g.key} className={tl.group}>
                    <button
                      type="button"
                      className={tl.groupHead}
                      onClick={() => toggleGroup(g.key)}
                      aria-expanded={open}
                    >
                      <span className={`${tl.chevron} ${open ? tl.chevronOpen : ""}`}>{ChevronIcon}</span>
                      <span className={tl.groupPackage}>{g.label}</span>
                      <span className={tl.groupCount}>
                        {g.entries.length} entr{g.entries.length === 1 ? "y" : "ies"} · {g.travellers} travellers · Debit ₹{" "}
                        {g.debit.toLocaleString("en-IN")} · Credit ₹ {g.credit.toLocaleString("en-IN")}
                      </span>
                      <span className={tl.groupTotal} title="Balance (Debit − Credit) for this destination">
                        Bal {formatSigned(String(g.balance))}
                      </span>
                    </button>
                    {open && <div className={tl.groupBody}>{renderTable(g.entries)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={mode === "create" ? "Add DMC account" : "Edit DMC account"}
        maxWidth={760}
      >
        <div className={styles.row3}>
          {textField("d-slno", "Sl No", "slNo")}
          {textField("d-name", "Name", "name", "Client / group name")}
          {textField("d-destination", "Destination", "destination", "e.g. Thailand")}
        </div>
        <div className={styles.row3}>
          {dateField("d-traveldate", "Travel Date", "travelDate")}
          <div className={styles.field}>
            <label htmlFor="d-paymentmode">Mode of Payment</label>
            <select
              id="d-paymentmode"
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
        <div className={styles.row3}>
          {textField("d-paymentfrom", "Payment From", "paymentFrom", "Who paid")}
          {textField("d-paymentto", "Payment To", "paymentTo", "DMC / vendor name")}
        </div>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="d-travellers">Number of Travellers</label>
            <input
              id="d-travellers"
              inputMode="numeric"
              value={form.numberOfTravelers}
              placeholder="e.g. 4"
              onChange={(e) => updateCalc({ numberOfTravelers: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="d-perperson">Per Person Quotation (₹)</label>
            <input
              id="d-perperson"
              inputMode="decimal"
              value={form.perPersonQuotation}
              placeholder="e.g. 25000"
              onChange={(e) => updateCalc({ perPersonQuotation: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="d-total">Total Amount (₹)</label>
            <input
              id="d-total"
              inputMode="decimal"
              value={form.totalAmount}
              placeholder="Travellers × per person"
              onChange={(e) => {
                setTotalTouched(e.target.value !== "");
                setForm({ ...form, totalAmount: e.target.value });
              }}
            />
          </div>
        </div>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="d-debit">Debit (₹)</label>
            <input
              id="d-debit"
              inputMode="decimal"
              value={form.debit}
              placeholder="e.g. 100000"
              onChange={(e) => setForm((f) => ({ ...f, debit: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="d-credit">Credit (₹)</label>
            <input
              id="d-credit"
              inputMode="decimal"
              value={form.credit}
              placeholder="e.g. 60000"
              onChange={(e) => setForm((f) => ({ ...f, credit: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="d-balance">Balance (₹)</label>
            <input
              id="d-balance"
              readOnly
              value={formatSigned(computedBalance(form)) === "—" ? "" : formatSigned(computedBalance(form))}
              placeholder="Debit − Credit"
              title="Calculated automatically: Debit − Credit"
            />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="d-note">Note</label>
          <textarea
            id="d-note"
            rows={3}
            value={form.note}
            placeholder="Any additional notes for this entry…"
            onChange={(e) => setForm({ ...form, note: e.target.value })}
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

      {(() => {
        const v = entries.find((x) => x.id === viewEntryId) ?? null;
        return (
          <EntryDetailsModal
            entry={v}
            fileApi={dmcFileApi}
            onClose={() => setViewEntryId(null)}
            onManageFiles={(entry) => {
              setViewEntryId(null);
              setFilesFromView(true);
              setFilesEntryId(entry.id);
            }}
            approved={!!v?.approved}
            amounts={
              v
                ? [
                    { label: "Debit", value: money(v.debit), tone: "debit" },
                    { label: "Credit", value: money(v.credit), tone: "credit" },
                    { label: "Balance", value: money(v.balance) },
                  ]
                : []
            }
            details={
              v
                ? [
                    ["Sl No", v.slNo],
                    ["Name", v.name],
                    ["Destination", v.destination],
                    ["Travel Date", formatDateDMY(v.travelDate)],
                    ["Mode of Payment", v.paymentMode],
                    ["Payment From", v.paymentFrom],
                    ["Payment To", v.paymentTo],
                    ["No. of Travellers", v.numberOfTravelers],
                    ["Per Person Quotation", money(v.perPersonQuotation)],
                    ["Total Amount", money(v.totalAmount)],
                    ["Created", dateTime(v.createdAt)],
                  ]
                : []
            }
            wide={v ? [["Note", v.note]] : []}
          />
        );
      })()}

      <AttachmentsModal
        entry={entries.find((x) => x.id === filesEntryId) ?? null}
        title={(() => {
          const e = entries.find((x) => x.id === filesEntryId);
          return e ? e.name || `Sl No ${e.slNo}` : "";
        })()}
        fileApi={dmcFileApi}
        onClose={() => {
          if (filesFromView) setViewEntryId(filesEntryId);
          setFilesFromView(false);
          setFilesEntryId(null);
        }}
        onUpdated={(updated) => setEntries((list) => list.map((x) => (x.id === updated.id ? updated : x)))}
        canDelete={isAdmin || perms.delete}
      />
    </>
  );
}
