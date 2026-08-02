"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, AdvancePayment, Booking, Package, User } from "@/lib/api";
import { buildUpiScannerDataUrl } from "@/lib/upiQr";
import { computeInvoiceTotals, downloadInvoicePdf, getInvoicePdfBlob } from "@/lib/invoice";
import Navbar from "@/components/Navbar";
import Modal from "@/components/Modal";
import Toast, { ToastState } from "@/components/Toast";
import dash from "../dashboard.module.css";
import styles from "./bookings.module.css";
import "./invoice-preview.css";

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

type FormState = {
  userId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  location: string;
  packageType: "domestic" | "international";
  packageId: string;
  landPackage: string;
  travelDate: string;
  finalPaymentDate: string;
  adults: string;
  children: string;
  adultPrice: string;
  childPrice: string;
  advancePayments: AdvancePayment[];
  invoiceNumber: string;
  invoiceDate: string;
  amount: string;
  transactionId: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm: FormState = {
  userId: "",
  clientName: "",
  clientPhone: "",
  clientEmail: "",
  location: "",
  packageType: "domestic",
  packageId: "",
  landPackage: "",
  travelDate: "",
  finalPaymentDate: "",
  adults: "1",
  children: "0",
  adultPrice: "",
  childPrice: "",
  advancePayments: [],
  invoiceNumber: "",
  invoiceDate: "",
  amount: "",
  transactionId: "",
};

const emptyPayment: AdvancePayment = { amount: "", date: "", note: "" };

export default function BookingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [search, setSearch] = useState("");
  const [typeTab, setTypeTab] = useState<"all" | "domestic" | "international">("all");
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [newPayment, setNewPayment] = useState<AdvancePayment>(emptyPayment);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function notify(type: "ok" | "err", text: string) {
    window.clearTimeout(toastTimer.current);
    setToast({ type, text });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  async function load() {
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
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (typeTab !== "all" && b.packageType !== typeTab) return false;
      if (!q) return true;
      return (
        b.clientName.toLowerCase().includes(q) ||
        b.clientPhone.toLowerCase().includes(q) ||
        b.packageTitle.toLowerCase().includes(q) ||
        b.userName.toLowerCase().includes(q)
      );
    });
  }, [bookings, search, typeTab]);

  // Search/tab changes can shrink the result set out from under whatever
  // page the user was on — snap back to page 1 rather than showing a blank page.
  useEffect(() => {
    setPage(1);
  }, [search, typeTab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  function nextInvoiceNumber(): string {
    const nums = bookings
      .map((b) => parseInt(b.invoiceNumber, 10))
      .filter((n) => !Number.isNaN(n));
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return String(next).padStart(4, "0");
  }

  const matchingPackages = useMemo(
    () => packages.filter((p) => p.packageType === form.packageType),
    [packages, form.packageType]
  );

  const totals = useMemo(
    () =>
      computeInvoiceTotals({
        adults: form.adults,
        children: form.children,
        adultPrice: form.adultPrice,
        childPrice: form.childPrice,
        advancePayments: form.advancePayments,
      }),
    [form.adults, form.children, form.adultPrice, form.childPrice, form.advancePayments]
  );

  function openCreate() {
    setMode("create");
    setEditingId(null);
    setForm({
      ...emptyForm,
      userId: isAdmin ? "" : user?.id || "",
      invoiceNumber: nextInvoiceNumber(),
      invoiceDate: todayIso(),
    });
    setNewPayment({ amount: "", date: todayIso(), note: "" });
    setFormErr("");
    setQrDataUrl(null);
    setModalOpen(true);
  }

  function openEdit(b: Booking) {
    setMode("edit");
    setEditingId(b.id);
    setForm({
      userId: b.userId,
      clientName: b.clientName,
      clientPhone: b.clientPhone,
      clientEmail: b.clientEmail,
      location: b.location,
      packageType: b.packageType,
      packageId: b.packageId || "",
      landPackage: b.landPackage || "",
      travelDate: b.travelDate,
      finalPaymentDate: b.finalPaymentDate,
      adults: b.adults,
      children: b.children,
      adultPrice: b.adultPrice,
      childPrice: b.childPrice,
      advancePayments: b.advancePayments,
      invoiceNumber: b.invoiceNumber,
      invoiceDate: b.invoiceDate,
      amount: b.amount,
      transactionId: b.transactionId,
    });
    setNewPayment({ amount: "", date: todayIso(), note: "" });
    setFormErr("");
    setQrDataUrl(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
  }

  function onAmountChange(value: string) {
    // A previously generated scanner (and any transaction ID entered against
    // it) refers to the old amount — drop both so neither lingers as if it
    // still applied to a since-edited figure.
    setForm({ ...form, amount: value, transactionId: "" });
    setQrDataUrl(null);
  }

  async function onGenerateScanner() {
    if (!form.amount.trim()) return;
    setQrBusy(true);
    try {
      setQrDataUrl(await buildUpiScannerDataUrl(form.amount.trim()));
    } catch {
      notify("err", "Failed to generate scanner");
    } finally {
      setQrBusy(false);
    }
  }

  function addPayment() {
    if (!newPayment.amount.trim()) return;
    setForm({ ...form, advancePayments: [...form.advancePayments, { ...newPayment }] });
    setNewPayment({ amount: "", date: todayIso(), note: "" });
  }

  function removePayment(index: number) {
    setForm({
      ...form,
      advancePayments: form.advancePayments.filter((_, i) => i !== index),
    });
  }

  function buildInvoiceInput() {
    const pkg = packages.find((p) => p.id === form.packageId);
    return {
      companyName: pkg?.companyName || "Ambaari Tours and Travels",
      clientName: form.clientName.trim(),
      clientPhone: form.clientPhone.trim(),
      location: form.location.trim(),
      packageTitle: pkg?.packageTitle || "",
      travelDate: form.travelDate,
      adults: form.adults,
      children: form.children,
      adultPrice: form.adultPrice,
      childPrice: form.childPrice,
      advancePayments: form.advancePayments,
      invoiceNumber: form.invoiceNumber,
      invoiceDate: form.invoiceDate,
    };
  }

  function invoiceFilename() {
    return `invoice-${form.clientName.trim().replace(/\s+/g, "-").toLowerCase()}.pdf`;
  }

  async function onDownloadInvoice() {
    if (!form.clientName.trim()) {
      notify("err", "Enter a client name first");
      return;
    }
    setInvoiceBusy(true);
    try {
      await downloadInvoicePdf(buildInvoiceInput(), invoiceFilename());
      notify("ok", "Invoice downloaded");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to generate invoice");
    } finally {
      setInvoiceBusy(false);
    }
  }

  // Fired after a booking is created — builds the same invoice PDF as the
  // "Download Invoice PDF" button and hands it to the backend to email to
  // the client and the company inbox. Runs after the modal has already
  // closed, so failures here surface as a toast rather than blocking booking
  // creation (the booking itself is already saved either way).
  async function emailInvoice(bookingId: string) {
    try {
      const filename = invoiceFilename();
      const blob = await getInvoicePdfBlob(buildInvoiceInput(), filename);
      await api.sendBookingInvoiceEmail(bookingId, blob, filename);
      notify("ok", "Invoice emailed to client & company");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Booking saved, but the invoice email failed to send");
    }
  }

  async function onSubmit() {
    setFormErr("");
    setBusy(true);
    try {
      const body = {
        userId: isAdmin ? form.userId : user?.id || "",
        clientName: form.clientName.trim(),
        clientPhone: form.clientPhone.trim(),
        clientEmail: form.clientEmail.trim(),
        location: form.location.trim(),
        packageType: form.packageType,
        packageId: form.packageId || null,
        landPackage: form.landPackage.trim(),
        travelDate: form.travelDate,
        finalPaymentDate: form.finalPaymentDate,
        adults: form.adults.trim() || "1",
        children: form.children.trim() || "0",
        adultPrice: form.adultPrice.trim(),
        childPrice: form.childPrice.trim(),
        advancePayments: form.advancePayments,
        invoiceNumber: form.invoiceNumber.trim(),
        invoiceDate: form.invoiceDate,
        amount: form.amount.trim(),
        transactionId: form.transactionId.trim(),
      };
      if (mode === "create") {
        const created = await api.createBooking(body);
        notify("ok", `Booking created for ${body.clientName}`);
        setModalOpen(false);
        load();
        void emailInvoice(created.id);
      } else if (editingId) {
        await api.updateBooking(editingId, body);
        notify("ok", `Booking updated for ${body.clientName}`);
        setModalOpen(false);
        load();
      }
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function onDelete(id: string, clientName: string) {
    window.clearTimeout(toastTimer.current);
    setToast({
      type: "confirm",
      text: `Delete the booking for ${clientName}? This cannot be undone.`,
      onCancel: () => setToast(null),
      onConfirm: async () => {
        setToast(null);
        try {
          await api.deleteBooking(id);
          notify("ok", "Booking deleted");
          load();
        } catch (e) {
          notify("err", e instanceof Error ? e.message : "Failed to delete");
        }
      },
    });
  }

  const canSubmit =
    (isAdmin ? form.userId : true) &&
    form.clientName.trim() &&
    form.clientPhone.trim() &&
    form.packageId &&
    form.amount.trim() &&
    !busy;

  return (
    <>
      <Navbar title="Bookings" />
      <Toast toast={toast} />
      <div className={dash.content}>
        <section className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div className={styles.tableHeadLeft}>
              <h3>{isAdmin ? "All bookings" : "Your bookings"}</h3>
              <span className={styles.count}>{bookings.length} total</span>
            </div>
            <div className={styles.tableHeadRight}>
              <div className={styles.search}>
                <span className={styles.searchIcon}>{SearchIcon}</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by client, phone or package…"
                />
              </div>
              <button className={styles.createBtn} onClick={openCreate}>
                + Create Booking
              </button>
            </div>
          </div>

          <div className={styles.typeTabsWrap}>
            <div className={styles.typeTabs}>
              <button
                className={`${styles.typeTab} ${typeTab === "all" ? styles.typeTabActive : ""}`}
                onClick={() => setTypeTab("all")}
              >
                All
              </button>
              <button
                className={`${styles.typeTab} ${typeTab === "domestic" ? styles.typeTabActive : ""}`}
                onClick={() => setTypeTab("domestic")}
              >
                Domestic
              </button>
              <button
                className={`${styles.typeTab} ${typeTab === "international" ? styles.typeTabActive : ""}`}
                onClick={() => setTypeTab("international")}
              >
                International
              </button>
            </div>
          </div>

          {!loaded ? (
            <div className={styles.empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              {search
                ? "No bookings match your search."
                : typeTab !== "all"
                ? "No bookings in this category yet."
                : "No bookings yet."}
            </div>
          ) : (
            <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Invoice No</th>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Phone</th>
                  <th>Package</th>
                  <th>Package Amount</th>
                  <th>Advance Paid</th>
                  <th>Balance Due</th>
                  <th>Amount</th>
                  {isAdmin && <th>Booked By</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paged.map((b) => {
                  const t = computeInvoiceTotals(b);
                  return (
                  <tr key={b.id}>
                    <td style={{ color: "var(--ink-dim)" }}>{b.invoiceNumber || "—"}</td>
                    <td style={{ color: "var(--ink-dim)" }}>{b.invoiceDate || "—"}</td>
                    <td>
                      <div className={styles.bName}>
                        <span className={styles.bAvatar}>
                          {b.clientName.slice(0, 2).toUpperCase()}
                        </span>
                        {b.clientName}
                      </div>
                    </td>
                    <td style={{ color: "var(--ink-dim)" }}>{b.clientPhone}</td>
                    <td style={{ color: "var(--ink-dim)" }}>{b.packageTitle || "—"}</td>
                    <td className={styles.amount}>₹ {t.packagePrice.toLocaleString("en-IN")}</td>
                    <td className={styles.amount}>₹ {t.totalAdvance.toLocaleString("en-IN")}</td>
                    <td className={styles.amount}>₹ {t.balanceDue.toLocaleString("en-IN")}</td>
                    <td className={styles.amount}>{b.amount ? `₹ ${b.amount}` : "—"}</td>
                    {isAdmin && (
                      <td>
                        <span className={styles.userPill}>{b.userName || "—"}</span>
                      </td>
                    )}
                    <td>
                      <div className={styles.actions}>
                        <button
                          className={styles.iconBtn}
                          onClick={() => openEdit(b)}
                          aria-label={`Edit booking for ${b.clientName}`}
                          title="Edit"
                        >
                          {EditIcon}
                        </button>
                        <button
                          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          onClick={() => onDelete(b.id, b.clientName)}
                          aria-label={`Delete booking for ${b.clientName}`}
                          title="Delete"
                        >
                          {DeleteIcon}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}

          {loaded && filtered.length > 0 && pageCount > 1 && (
            <div className={styles.pagination}>
              <span className={styles.pageInfo}>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className={styles.pageBtns}>
                <button
                  className={styles.pageBtn}
                  onClick={() => setPage((p) => p - 1)}
                  disabled={currentPage === 1}
                >
                  Prev
                </button>
                <span className={styles.pageCurrent}>
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  className={styles.pageBtn}
                  onClick={() => setPage((p) => p + 1)}
                  disabled={currentPage === pageCount}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={mode === "create" ? "Create booking" : "Edit booking"}
      >
        <div className={styles.field}>
          <label htmlFor="b-user">User</label>
          {isAdmin ? (
            <select
              id="b-user"
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          ) : (
            <select id="b-user" value={form.userId} disabled>
              <option value={form.userId}>{user?.name} (you)</option>
            </select>
          )}
        </div>

        <div className={styles.sectionLabel}>Client details</div>
        <div className={styles.field}>
          <label htmlFor="b-client">Client name</label>
          <input
            id="b-client"
            value={form.clientName}
            placeholder="Client full name"
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
          />
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="b-phone">Client phone number</label>
            <input
              id="b-phone"
              type="tel"
              value={form.clientPhone}
              placeholder="+91 98765 43210"
              onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="b-email">Client email</label>
            <input
              id="b-email"
              type="email"
              value={form.clientEmail}
              placeholder="client@example.com"
              onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="b-location">Location</label>
          <input
            id="b-location"
            value={form.location}
            placeholder="e.g. Bengaluru"
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>

        <div className={styles.sectionLabel}>Package details</div>
        <div className={styles.field}>
          <label htmlFor="b-package-type">Package type</label>
          <select
            id="b-package-type"
            value={form.packageType}
            onChange={(e) => {
              const packageType = e.target.value as "domestic" | "international";
              const selected = packages.find((p) => p.id === form.packageId);
              const stillValid = selected?.packageType === packageType;
              setForm({ ...form, packageType, packageId: stillValid ? form.packageId : "" });
            }}
          >
            <option value="domestic">Domestic</option>
            <option value="international">International</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="b-package">Package</label>
          <select
            id="b-package"
            value={form.packageId}
            onChange={(e) => setForm({ ...form, packageId: e.target.value })}
          >
            <option value="">
              {matchingPackages.length === 0 ? "No packages available" : "Select a package…"}
            </option>
            {matchingPackages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.packageTitle || "Untitled package"}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="b-land-package">Land package (Rs.)</label>
          <input
            id="b-land-package"
            value={form.landPackage}
            placeholder="e.g. 30000"
            onChange={(e) => setForm({ ...form, landPackage: e.target.value })}
          />
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="b-travel-date">Travel date</label>
            <input
              id="b-travel-date"
              type="date"
              value={form.travelDate}
              onChange={(e) => setForm({ ...form, travelDate: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="b-final-payment-date">Final payment date</label>
            <input
              id="b-final-payment-date"
              type="date"
              value={form.finalPaymentDate}
              onChange={(e) => setForm({ ...form, finalPaymentDate: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="b-adults">Adults</label>
            <input
              id="b-adults"
              type="number"
              min="0"
              value={form.adults}
              onChange={(e) => setForm({ ...form, adults: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="b-children">Children (0–12 yrs)</label>
            <input
              id="b-children"
              type="number"
              min="0"
              value={form.children}
              onChange={(e) => setForm({ ...form, children: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="b-adult-price">Adult price (Rs. per adult)</label>
            <input
              id="b-adult-price"
              value={form.adultPrice}
              placeholder="e.g. 40000"
              onChange={(e) => setForm({ ...form, adultPrice: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="b-child-price">Child price (Rs. per child)</label>
          <input
            id="b-child-price"
            value={form.childPrice}
            placeholder="e.g. 25000"
            onChange={(e) => setForm({ ...form, childPrice: e.target.value })}
          />
        </div>

        <div className={styles.sectionLabel}>Advance payments</div>
        <div className={`${styles.row} ${styles.paymentRow}`}>
          <div className={styles.field}>
            <label htmlFor="p-amount">Amount (Rs.)</label>
            <input
              id="p-amount"
              value={newPayment.amount}
              placeholder="e.g. 5000"
              onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="p-date">Date</label>
            <input
              id="p-date"
              type="date"
              value={newPayment.date}
              onChange={(e) => setNewPayment({ ...newPayment, date: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="p-note">Note (optional)</label>
            <input
              id="p-note"
              value={newPayment.note}
              placeholder="e.g. UPI, Cash"
              onChange={(e) => setNewPayment({ ...newPayment, note: e.target.value })}
            />
          </div>
          <button
            type="button"
            className={styles.addPaymentBtn}
            onClick={addPayment}
            disabled={!newPayment.amount.trim()}
            aria-label="Add payment"
            title="Add payment"
          >
            +
          </button>
        </div>

        {form.advancePayments.length === 0 ? (
          <div className={styles.paymentEmpty}>No payments added yet. Click + to add.</div>
        ) : (
          <ul className={styles.paymentList}>
            {form.advancePayments.map((p, i) => (
              <li key={i}>
                <span className={styles.paymentDate}>{p.date || "—"}</span>
                <span className={styles.paymentNote}>{p.note || "—"}</span>
                <span className={styles.paymentAmount}>₹ {p.amount}</span>
                <button
                  type="button"
                  onClick={() => removePayment(i)}
                  aria-label={`Remove payment of ${p.amount}`}
                  title="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.summaryBox}>
          <div>
            <span>Package price × pax</span>
            <b>₹ {totals.packagePrice.toLocaleString("en-IN")}</b>
          </div>
          <div>
            <span>Total advance paid</span>
            <b>₹ {totals.totalAdvance.toLocaleString("en-IN")}</b>
          </div>
          <div className={styles.summaryBalance}>
            <span>Balance due</span>
            <b>₹ {totals.balanceDue.toLocaleString("en-IN")}</b>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="b-amount">Amount to collect now</label>
          <input
            id="b-amount"
            value={form.amount}
            placeholder="e.g. 45000"
            onChange={(e) => onAmountChange(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <button
            type="button"
            className={styles.scannerBtn}
            onClick={onGenerateScanner}
            disabled={!form.amount.trim() || qrBusy}
          >
            <i className="fas fa-qrcode" />
            {qrBusy ? "Generating…" : "Generate Scanner"}
          </button>

          {qrDataUrl && (
            <div className={styles.qrBox}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="UPI payment QR code" />
              <span>Scan to pay ₹{form.amount}</span>
            </div>
          )}
        </div>

        {(qrDataUrl || form.transactionId) && (
          <div className={styles.field}>
            <label htmlFor="b-txn">UPI transaction ID</label>
            <input
              id="b-txn"
              value={form.transactionId}
              placeholder="e.g. 123456789012"
              onChange={(e) => setForm({ ...form, transactionId: e.target.value })}
            />
          </div>
        )}

        <div className={styles.sectionLabel}>Invoice settings</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="b-inv-num">Invoice number</label>
            <input
              id="b-inv-num"
              value={form.invoiceNumber}
              placeholder="e.g. 0954"
              onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="b-inv-date">Invoice date</label>
            <input
              id="b-inv-date"
              type="date"
              value={form.invoiceDate}
              onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
            />
          </div>
        </div>

        {formErr && <div className={`${styles.msg} ${styles.err}`}>{formErr}</div>}

        <button
          type="button"
          className={styles.invoiceBtn}
          onClick={onDownloadInvoice}
          disabled={invoiceBusy}
        >
          <i className="fas fa-file-pdf" />
          {invoiceBusy ? "Generating invoice…" : "Download Invoice PDF"}
        </button>

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={closeModal} disabled={busy}>
            Cancel
          </button>
          <button className={styles.submit} onClick={onSubmit} disabled={!canSubmit}>
            {busy
              ? mode === "create"
                ? "Creating…"
                : "Saving…"
              : mode === "create"
              ? "Create booking"
              : "Save changes"}
          </button>
        </div>
      </Modal>
    </>
  );
}
