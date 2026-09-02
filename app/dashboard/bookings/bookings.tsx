"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, AdvancePayment, Booking, BookingDocument, Package, User } from "@/lib/api";
import { buildUpiScannerDataUrl } from "@/lib/upiQr";
import { computeInvoiceTotals, downloadInvoicePdf, getInvoicePdfBlob } from "@/lib/invoice";
import { downloadItineraryPdf, escapeHtml, readFileAsDataURL } from "@/lib/itinerary";
import { formatDateDMY } from "@/lib/dates";
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

const ViewIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path
      d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const DownloadIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path
      d="M12 4v11m0 0 4-4m-4 4-4-4M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"
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
  travelDate: string;
  finalPaymentDate: string;
  adults: string;
  children: string;
  infants: string;
  adultPrice: string;
  childPrice: string;
  infantPrice: string;
  flightAmount: string;
  adultLandPrice: string;
  childLandPrice: string;
  infantLandPrice: string;
  advancePayments: AdvancePayment[];
  invoiceNumber: string;
  invoiceDate: string;
  amount: string;
  transactionId: string;
  specialRequirements: string;
  aadharDoc: BookingDocument[];
  panDoc: BookingDocument[];
  passportDoc: BookingDocument[];
  otherDocs: BookingDocument[];
};

// The 4 document upload fields all behave identically (add one or many
// files, remove one, rename one) — this key set drives that shared logic
// (onDocFieldChange/removeDocAt/renameDocAt) instead of 4 near-duplicate
// handlers.
type DocField = "aadharDoc" | "panDoc" | "passportDoc" | "otherDocs";

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
  travelDate: "",
  finalPaymentDate: "",
  adults: "1",
  children: "0",
  infants: "0",
  adultPrice: "",
  childPrice: "",
  infantPrice: "",
  flightAmount: "",
  adultLandPrice: "",
  childLandPrice: "",
  infantLandPrice: "",
  advancePayments: [],
  invoiceNumber: "",
  invoiceDate: "",
  amount: "",
  transactionId: "",
  specialRequirements: "",
  aadharDoc: [],
  panDoc: [],
  passportDoc: [],
  otherDocs: [],
};

const emptyPayment: AdvancePayment = { amount: "", date: "", note: "" };

// Small thumbnail for an uploaded ID document — image types get a real
// preview, anything else (PDF, etc.) gets a file icon. Either way it opens
// the original in a new tab via its own data URL. The name below it is
// editable (defaults to the uploaded filename) so it can be labeled
// something meaningful — "Aadhar front", "Passport page 2" — instead of
// whatever the camera/phone named the file.
function DocPreview({
  doc,
  onRemove,
  onRename,
}: {
  doc: BookingDocument;
  onRemove: () => void;
  onRename: (name: string) => void;
}) {
  const isImage = doc.type.startsWith("image/");
  return (
    <div className={styles.docPreview}>
      <a href={doc.data} target="_blank" rel="noreferrer" title={doc.name}>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={doc.data} alt={doc.name} />
        ) : (
          <span className={styles.docFileIcon}>
            <i className="fas fa-file-lines" />
          </span>
        )}
      </a>
      <input
        type="text"
        className={styles.docNameInput}
        value={doc.name}
        placeholder="Document name"
        onChange={(e) => onRename(e.target.value)}
      />
      <button type="button" onClick={onRemove} aria-label={`Remove ${doc.name}`} title="Remove">
        ×
      </button>
    </div>
  );
}

// Read-only counterpart for the "View documents" modal — no rename/remove,
// just the preview + name + a link that opens/downloads the original.
function DocPreviewReadOnly({ doc, onDownload }: { doc: BookingDocument; onDownload: () => void }) {
  const isImage = doc.type.startsWith("image/");
  return (
    <div className={styles.docPreview}>
      <a href={doc.data} target="_blank" rel="noreferrer" title={doc.name}>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={doc.data} alt={doc.name} />
        ) : (
          <span className={styles.docFileIcon}>
            <i className="fas fa-file-lines" />
          </span>
        )}
        <span className={styles.docName}>{doc.name || "Document"}</span>
      </a>
      <button
        type="button"
        className={styles.docDownloadBtn}
        onClick={onDownload}
        aria-label={`Download ${doc.name || "document"}`}
        title="Download this file"
      >
        <i className="fas fa-download" />
      </button>
    </div>
  );
}

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
  const [busyAction, setBusyAction] = useState<"create" | "update" | "sendMail" | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docBusy, setDocBusy] = useState<DocField | null>(null);
  const [formErr, setFormErr] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  // "View documents" modal — a separate, read-only view from the edit
  // modal, so a user who can only edit their own bookings can still look at
  // (and download) documents on any booking they're allowed to see.
  const [viewBooking, setViewBooking] = useState<Booking | null>(null);
  const [docActionBusy, setDocActionBusy] = useState<{ id: string; action: "view" | "download" } | null>(
    null
  );

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const createRequestId = useRef(0);
  const editRequestId = useRef(0);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function notify(type: "ok" | "err", text: string) {
    window.clearTimeout(toastTimer.current);
    setToast({ type, text });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  // Bookings, users, and packages load independently now (not Promise.all'd
  // together) — the bookings table only needs `bookings` + `loaded`, so it
  // used to sit on "Loading…" waiting on users/packages to finish even after
  // its own request had already come back, whenever either of those two was
  // the slower of the three. Users/packages only matter once the create/edit
  // modal is open, so there's no downside to them arriving a beat later.
  function load() {
    api
      .listBookings()
      .then(setBookings)
      .catch((e) => notify("err", e instanceof Error ? e.message : "Failed to load bookings"))
      .finally(() => setLoaded(true));
    api.listUsers().then(setUsers).catch(() => {});
    api.listPackages().then(setPackages).catch(() => {});
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  // A search term also matches against the travel date — typed as
  // 2026-08-07, 07-08-2026, 07/08/2026, "august", "aug", or just "2026" —
  // so typing a date or month finds who's travelling then (or was invoiced
  // then — both dates are checked, since either is a reasonable thing to
  // search by), not just who a client is. When a term is entered, results
  // are additionally sorted by travel date (soonest first) so a date/month
  // search reads as a travel schedule rather than in whatever order
  // bookings were created.
  function dateSearchText(isoDate: string): string {
    if (!isoDate) return "";
    const d = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return isoDate.toLowerCase();
    const [y, m, day] = isoDate.split("-");
    const monthName = d.toLocaleString("en-US", { month: "long" });
    const monthShort = d.toLocaleString("en-US", { month: "short" });
    return [isoDate, `${day}-${m}-${y}`, `${day}/${m}/${y}`, monthName, monthShort, y]
      .join(" ")
      .toLowerCase();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = bookings.filter((b) => {
      if (typeTab !== "all" && b.packageType !== typeTab) return false;
      if (!q) return true;
      return (
        b.clientName.toLowerCase().includes(q) ||
        b.clientPhone.toLowerCase().includes(q) ||
        b.packageTitle.toLowerCase().includes(q) ||
        b.userName.toLowerCase().includes(q) ||
        dateSearchText(b.travelDate).includes(q) ||
        dateSearchText(b.invoiceDate).includes(q)
      );
    });
    if (!q) return matches;
    return [...matches].sort((a, b) =>
      (a.travelDate || "9999-99-99").localeCompare(b.travelDate || "9999-99-99")
    );
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

  // Fallback only — used if the server-side next-invoice-number call fails.
  // Derived from `bookings`, which for a non-admin is already filtered down
  // to just their own bookings, so this alone would hand out numbers that
  // collide with other users' invoices; the real source of truth is
  // api.getNextInvoiceNumber() in openCreate below.
  function fallbackNextInvoiceNumber(): string {
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
        infants: form.infants,
        adultPrice: form.adultPrice,
        childPrice: form.childPrice,
        infantPrice: form.infantPrice,
        advancePayments: form.advancePayments,
      }),
    [
      form.adults,
      form.children,
      form.infants,
      form.adultPrice,
      form.childPrice,
      form.infantPrice,
      form.advancePayments,
    ]
  );

  async function openCreate() {
    // Guards the async correction below against a stale response landing
    // after the user has already closed this modal, reopened it, or
    // switched to editing something else.
    const requestId = ++createRequestId.current;
    setMode("create");
    setEditingId(null);
    setForm({
      ...emptyForm,
      userId: isAdmin ? "" : user?.id || "",
      invoiceNumber: fallbackNextInvoiceNumber(),
      invoiceDate: todayIso(),
    });
    setNewPayment({ amount: "", date: todayIso(), note: "" });
    setFormErr("");
    setQrDataUrl(null);
    setModalOpen(true);
    // Replace the fallback guess with the real, business-wide next number
    // once it arrives — modal's already open with something reasonable in
    // the field either way, this just corrects it a beat later.
    try {
      const { invoiceNumber } = await api.getNextInvoiceNumber();
      if (createRequestId.current === requestId) {
        setForm((f) => ({ ...f, invoiceNumber }));
      }
    } catch {
      // Fallback number stays — better than blocking booking creation.
    }
  }

  async function openEdit(b: Booking) {
    // Guards the async doc-fetch below against a stale response landing
    // after the user has closed this modal and opened a different booking.
    const requestId = ++editRequestId.current;
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
      travelDate: b.travelDate,
      finalPaymentDate: b.finalPaymentDate,
      adults: b.adults,
      children: b.children,
      infants: b.infants || "0",
      adultPrice: b.adultPrice,
      childPrice: b.childPrice,
      infantPrice: b.infantPrice || "",
      flightAmount: b.flightAmount || "",
      adultLandPrice: b.adultLandPrice || "",
      childLandPrice: b.childLandPrice || "",
      infantLandPrice: b.infantLandPrice || "",
      advancePayments: b.advancePayments,
      invoiceNumber: b.invoiceNumber,
      invoiceDate: b.invoiceDate,
      amount: b.amount,
      transactionId: b.transactionId,
      specialRequirements: b.specialRequirements || "",
      // listBookings() omits ID documents for performance — placeholder
      // here, filled in from the full record fetched just below.
      aadharDoc: [],
      panDoc: [],
      passportDoc: [],
      otherDocs: [],
    });
    setNewPayment({ amount: "", date: todayIso(), note: "" });
    setFormErr("");
    setQrDataUrl(null);
    setModalOpen(true);
    setDocsLoading(true);
    try {
      const full = await api.getBooking(b.id);
      if (editRequestId.current === requestId) {
        setForm((f) => ({
          ...f,
          aadharDoc: full.aadharDoc ?? [],
          panDoc: full.panDoc ?? [],
          passportDoc: full.passportDoc ?? [],
          otherDocs: full.otherDocs ?? [],
        }));
      }
    } catch {
      // Non-fatal — the rest of the form is already editable; documents
      // just won't show until the booking is reopened.
    } finally {
      if (editRequestId.current === requestId) setDocsLoading(false);
    }
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

  async function fileToDoc(file: File): Promise<BookingDocument> {
    // readFileAsDataURL resizes/re-compresses image files (see lib/itinerary.ts)
    // and passes anything else (PDFs) through unchanged — safe for both.
    const data = await readFileAsDataURL(file);
    return { name: file.name, type: file.type, data };
  }

  // Shared by all 4 document fields — each accepts one or many files,
  // appended to whatever's already there (never replacing it, same reasoning
  // as the day-image upload fix elsewhere in the app: a file input only ever
  // reports what was picked in THIS dialog).
  async function onDocFieldChange(field: DocField, files: FileList | null) {
    if (!files || files.length === 0) return;
    setDocBusy(field);
    try {
      const docs = await Promise.all(Array.from(files).map(fileToDoc));
      setForm((f) => ({ ...f, [field]: [...f[field], ...docs] }));
    } catch {
      notify("err", "Failed to read one or more files");
    } finally {
      setDocBusy(null);
    }
  }

  function removeDocAt(field: DocField, index: number) {
    setForm((f) => ({ ...f, [field]: f[field].filter((_, i) => i !== index) }));
  }

  function renameDocAt(field: DocField, index: number, name: string) {
    setForm((f) => ({
      ...f,
      [field]: f[field].map((d, i) => (i === index ? { ...d, name } : d)),
    }));
  }

  type DocGroup = { label: string; docs: BookingDocument[] };

  // Shared by the View modal and the download sheet, so the grouping/order
  // (Aadhar → PAN → Passport → Other) only lives in one place.
  function docGroups(b: Booking): DocGroup[] {
    return [
      { label: "Aadhar Card", docs: b.aadharDoc || [] },
      { label: "PAN Card", docs: b.panDoc || [] },
      { label: "Passport", docs: b.passportDoc || [] },
      { label: "Other Documents", docs: b.otherDocs || [] },
    ].filter((g) => g.docs.length > 0);
  }

  // One printable sheet with every document laid out on it, built the same
  // way the invoice/itinerary PDFs are (an off-screen container rendered
  // through html2canvas+jsPDF, auto-paginated by downloadItineraryPdf) —
  // rather than triggering a separate download per file, which browsers
  // routinely block/drop past the first couple when fired in one go, and
  // which the user explicitly asked to be combined into one document.
  // Image documents are embedded directly; a non-image upload (e.g. a PDF)
  // can't be flattened into this image-based sheet, so it gets a labeled
  // placeholder instead — those still need opening individually via the
  // thumbnail's own link.
  function buildDocsSheetHtml(b: Booking, groups: DocGroup[]): string {
    const meta = [b.clientPhone, b.clientEmail].filter(Boolean).map(escapeHtml).join(" &middot; ");
    let html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;width:800px;background:#ffffff;padding:28px;">`;
    html += `<div style="border-bottom:3px solid #f2c14e;padding-bottom:14px;margin-bottom:18px;">
      <div style="font-size:21px;font-weight:800;color:#10162a;">${escapeHtml(b.clientName || "Client")}</div>
      <div style="font-size:13px;color:#64748b;margin-top:4px;">${meta}</div>
      <div style="font-size:13px;color:#64748b;">${escapeHtml(b.packageTitle || "")}</div>
    </div>`;

    groups.forEach((g) => {
      html += `<div style="background:#10162a;color:#f2c14e;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:8px 14px;margin:16px 0 12px;border-radius:6px;">${escapeHtml(
        g.label
      )}</div>`;
      html += `<div style="display:flex;flex-wrap:wrap;gap:16px;">`;
      g.docs.forEach((doc) => {
        const isImage = doc.type.startsWith("image/");
        html += `<div style="width:220px;text-align:center;">`;
        html += isImage
          ? `<img src="${doc.data}" style="width:220px;height:220px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;display:block;" />`
          : `<div style="width:220px;height:220px;display:flex;align-items:center;justify-content:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12.5px;color:#94a3b8;">Non-image file —<br/>open from the app to view</div>`;
        html += `<div style="margin-top:6px;font-size:12px;color:#475569;">${escapeHtml(doc.name || "Document")}</div>`;
        html += `</div>`;
      });
      html += `</div>`;
    });

    html += `</div>`;
    return html;
  }

  async function downloadDocsSheet(b: Booking, groups: DocGroup[]) {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    container.style.width = "800px";
    container.innerHTML = buildDocsSheetHtml(b, groups);
    document.body.appendChild(container);
    try {
      const filename = `documents-${(b.clientName || "booking").trim().replace(/\s+/g, "-").toLowerCase()}.pdf`;
      await downloadItineraryPdf(container, filename, "download");
    } finally {
      document.body.removeChild(container);
    }
  }

  // Single-file counterpart to downloadDocsSheet — just that one document,
  // as its own original file (not flattened into the combined PDF).
  function downloadSingleDoc(doc: BookingDocument) {
    const a = document.createElement("a");
    a.href = doc.data;
    a.download = doc.name || "document";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // List rows come from listBookings(), which excludes documents for
  // performance (see the backend route) — both View and Download re-fetch
  // the full booking first, same as openEdit does.
  async function openViewDocs(b: Booking) {
    setDocActionBusy({ id: b.id, action: "view" });
    try {
      setViewBooking(await api.getBooking(b.id));
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setDocActionBusy(null);
    }
  }

  async function downloadAllDocs(b: Booking) {
    setDocActionBusy({ id: b.id, action: "download" });
    try {
      const full = await api.getBooking(b.id);
      const groups = docGroups(full);
      if (groups.length === 0) {
        notify("err", "No documents uploaded for this booking");
        return;
      }
      await downloadDocsSheet(full, groups);
      notify("ok", "Documents downloaded as one PDF");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to download documents");
    } finally {
      setDocActionBusy(null);
    }
  }

  // Every document as its own separate file, instead of combined onto one
  // PDF sheet — the "Single images" choice in promptDownloadChoice below.
  async function downloadAllDocsIndividually(b: Booking) {
    setDocActionBusy({ id: b.id, action: "download" });
    try {
      const full = await api.getBooking(b.id);
      const docs = docGroups(full).flatMap((g) => g.docs);
      if (docs.length === 0) {
        notify("err", "No documents uploaded for this booking");
        return;
      }
      // Staggered rather than fired in one tick — several browsers block or
      // silently drop a burst of programmatic downloads triggered together.
      docs.forEach((doc, i) => window.setTimeout(() => downloadSingleDoc(doc), i * 200));
      notify("ok", `Downloading ${docs.length} document${docs.length === 1 ? "" : "s"}`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to download documents");
    } finally {
      setDocActionBusy(null);
    }
  }

  // The row-level Download button asks which of the above the user wants,
  // rather than guessing — persists until answered (no auto-dismiss timer),
  // same as the delete confirmation below.
  function promptDownloadChoice(b: Booking) {
    window.clearTimeout(toastTimer.current);
    setToast({
      type: "choose",
      text: `Download documents for ${b.clientName} as…`,
      options: [
        {
          label: "All (PDF)",
          onClick: () => {
            setToast(null);
            void downloadAllDocs(b);
          },
        },
        {
          label: "Single images",
          onClick: () => {
            setToast(null);
            void downloadAllDocsIndividually(b);
          },
        },
      ],
      onCancel: () => setToast(null),
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
      infants: form.infants,
      adultPrice: form.adultPrice,
      childPrice: form.childPrice,
      infantPrice: form.infantPrice,
      advancePayments: form.advancePayments,
      invoiceNumber: form.invoiceNumber,
      invoiceDate: form.invoiceDate,
      specialRequirements: form.specialRequirements.trim(),
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

  // Fired after a booking is created OR edited — builds the same invoice
  // PDF as the "Download Invoice PDF" button and hands it to the backend to
  // email to the client, the company inbox, and the assigned user. Runs
  // after the modal has already closed, so failures here surface as a toast
  // rather than blocking booking creation/edits (the booking itself is
  // already saved either way). Re-sending on every edit is deliberate — a
  // balance-due edit is exactly the kind of change (updated amount paid,
  // new balance) the client and staff need the refreshed invoice for.
  async function emailInvoice(bookingId: string) {
    try {
      const filename = invoiceFilename();
      const blob = await getInvoicePdfBlob(buildInvoiceInput(), filename);
      await api.sendBookingInvoiceEmail(bookingId, blob, filename);
      notify("ok", "Invoice emailed to client, company & assigned user");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Booking saved, but the invoice email failed to send");
    }
  }

  // Edit mode has two save paths: "Update Changes" saves silently, "Send
  // Mail" saves and re-sends the confirmation email — e.g. after adjusting
  // the balance due, so the client/office/user get the refreshed invoice.
  // Create mode only ever has the one path (always emails).
  async function onSubmit(sendEmail: boolean) {
    setFormErr("");
    setBusy(true);
    setBusyAction(mode === "create" ? "create" : sendEmail ? "sendMail" : "update");
    try {
      const body = {
        userId: isAdmin ? form.userId : user?.id || "",
        clientName: form.clientName.trim(),
        clientPhone: form.clientPhone.trim(),
        clientEmail: form.clientEmail.trim(),
        location: form.location.trim(),
        packageType: form.packageType,
        packageId: form.packageId || null,
        travelDate: form.travelDate,
        finalPaymentDate: form.finalPaymentDate,
        adults: form.adults.trim() || "1",
        children: form.children.trim() || "0",
        infants: form.infants.trim() || "0",
        adultPrice: form.adultPrice.trim(),
        childPrice: form.childPrice.trim(),
        infantPrice: form.infantPrice.trim(),
        flightAmount: form.flightAmount.trim(),
        adultLandPrice: form.adultLandPrice.trim(),
        childLandPrice: form.childLandPrice.trim(),
        infantLandPrice: form.infantLandPrice.trim(),
        advancePayments: form.advancePayments,
        invoiceNumber: form.invoiceNumber.trim(),
        invoiceDate: form.invoiceDate,
        amount: form.amount.trim(),
        transactionId: form.transactionId.trim(),
        specialRequirements: form.specialRequirements.trim(),
        aadharDoc: form.aadharDoc,
        panDoc: form.panDoc,
        passportDoc: form.passportDoc,
        otherDocs: form.otherDocs,
      };
      if (mode === "create") {
        const created = await api.createBooking(body);
        notify("ok", `Booking created for ${body.clientName}`);
        setModalOpen(false);
        load();
        void emailInvoice(created.id);
      } else if (editingId) {
        await api.updateBooking(editingId, body);
        notify(
          "ok",
          sendEmail
            ? `Booking updated for ${body.clientName} — invoice emailed`
            : `Booking updated for ${body.clientName}`
        );
        setModalOpen(false);
        load();
        if (sendEmail) void emailInvoice(editingId);
      }
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      setBusyAction(null);
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
                  placeholder="Search by client, phone, package, date or month…"
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
                  <th>Travel Date</th>
                  <th>Client</th>
                  <th>Phone</th>
                  <th>Package</th>
                  <th>Adults</th>
                  <th>Children</th>
                  <th>Package Amount</th>
                  <th>Advance Paid</th>
                  <th>Balance Due</th>
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
                    <td style={{ color: "var(--ink-dim)" }}>{formatDateDMY(b.invoiceDate) || "—"}</td>
                    <td style={{ color: "var(--ink-dim)" }}>{formatDateDMY(b.travelDate) || "—"}</td>
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
                    <td style={{ color: "var(--ink-dim)" }}>{b.adults || "0"}</td>
                    <td style={{ color: "var(--ink-dim)" }}>{b.children || "0"}</td>
                    <td className={styles.amount}>₹ {t.packagePrice.toLocaleString("en-IN")}</td>
                    <td className={styles.amount}>₹ {t.totalAdvance.toLocaleString("en-IN")}</td>
                    <td className={styles.amount}>
                      ₹ {t.balanceDue.toLocaleString("en-IN")}
                      <span className={styles.subDate}>
                        Due by {formatDateDMY(b.finalPaymentDate) || "—"}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <span className={styles.userPill}>{b.userName || "—"}</span>
                      </td>
                    )}
                    <td>
                      <div className={styles.actions}>
                        <button
                          className={styles.iconBtn}
                          onClick={() => openViewDocs(b)}
                          disabled={docActionBusy?.id === b.id}
                          aria-label={`View documents for ${b.clientName}`}
                          title="View documents"
                        >
                          {docActionBusy?.id === b.id && docActionBusy.action === "view" ? (
                            <i className="fas fa-spinner fa-spin" />
                          ) : (
                            ViewIcon
                          )}
                        </button>
                        <button
                          className={styles.iconBtn}
                          onClick={() => promptDownloadChoice(b)}
                          disabled={docActionBusy?.id === b.id}
                          aria-label={`Download documents for ${b.clientName}`}
                          title="Download documents"
                        >
                          {docActionBusy?.id === b.id && docActionBusy.action === "download" ? (
                            <i className="fas fa-spinner fa-spin" />
                          ) : (
                            DownloadIcon
                          )}
                        </button>
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
        maxWidth={760}
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
        <div className={styles.field}>
          <label htmlFor="b-special-requirements">Special requirements (optional)</label>
          <textarea
            id="b-special-requirements"
            rows={3}
            value={form.specialRequirements}
            placeholder="e.g. Vegetarian meals, wheelchair access, early check-in…"
            onChange={(e) => setForm({ ...form, specialRequirements: e.target.value })}
          />
        </div>

        <div className={styles.sectionLabel}>
          Documents{docsLoading && <span className={styles.docsLoadingNote}> — loading existing files…</span>}
        </div>
        <div className={styles.row3}>
          {(
            [
              { field: "aadharDoc" as const, id: "b-doc-aadhar", label: "Aadhar Card" },
              { field: "panDoc" as const, id: "b-doc-pan", label: "PAN Card" },
              { field: "passportDoc" as const, id: "b-doc-passport", label: "Passport" },
            ]
          ).map(({ field, id, label }) => (
            <div className={styles.field} key={field}>
              <label htmlFor={id}>{label}</label>
              <input
                id={id}
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={(e) => {
                  void onDocFieldChange(field, e.target.files);
                  e.target.value = "";
                }}
              />
              {docBusy === field && <div className={styles.docStatus}>Uploading…</div>}
              {form[field].length > 0 && (
                <div className={styles.docGrid}>
                  {form[field].map((doc, i) => (
                    // Keyed by index, not doc.name — the name is what the
                    // rename input edits, so keying on it changed the key
                    // (and remounted the input, losing focus/cursor) on
                    // every single keystroke. See DocPreview below.
                    <DocPreview
                      key={i}
                      doc={doc}
                      onRemove={() => removeDocAt(field, i)}
                      onRename={(name) => renameDocAt(field, i, name)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className={styles.field}>
          <label htmlFor="b-doc-other">Upload files</label>
          <input
            id="b-doc-other"
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => {
              void onDocFieldChange("otherDocs", e.target.files);
              e.target.value = "";
            }}
          />
          {docBusy === "otherDocs" && <div className={styles.docStatus}>Uploading…</div>}
          {form.otherDocs.length > 0 && (
            <div className={styles.docGrid}>
              {form.otherDocs.map((doc, i) => (
                <DocPreview
                  key={i}
                  doc={doc}
                  onRemove={() => removeDocAt("otherDocs", i)}
                  onRename={(name) => renameDocAt("otherDocs", i, name)}
                />
              ))}
            </div>
          )}
        </div>

        <div className={styles.sectionLabel}>Package details</div>
        <div className={styles.row}>
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
        </div>
        <div className={styles.row3}>
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
        <div className={styles.row3}>
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
            <label htmlFor="b-infants">Infants</label>
            <input
              id="b-infants"
              type="number"
              min="0"
              value={form.infants}
              onChange={(e) => setForm({ ...form, infants: e.target.value })}
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
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="b-child-price">Child price (Rs. per child)</label>
            <input
              id="b-child-price"
              value={form.childPrice}
              placeholder="e.g. 25000"
              onChange={(e) => setForm({ ...form, childPrice: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="b-infant-price">Infant price (Rs. per infant)</label>
            <input
              id="b-infant-price"
              value={form.infantPrice}
              placeholder="e.g. 5000"
              onChange={(e) => setForm({ ...form, infantPrice: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="b-flight-amount">Flight amount (Rs.)</label>
            <input
              id="b-flight-amount"
              value={form.flightAmount}
              placeholder="e.g. 20000"
              onChange={(e) => setForm({ ...form, flightAmount: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="b-adult-land-price">Adult land price (Rs.)</label>
            <input
              id="b-adult-land-price"
              value={form.adultLandPrice}
              placeholder="e.g. 15000"
              onChange={(e) => setForm({ ...form, adultLandPrice: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="b-child-land-price">Child land price (Rs.)</label>
            <input
              id="b-child-land-price"
              value={form.childLandPrice}
              placeholder="e.g. 8000"
              onChange={(e) => setForm({ ...form, childLandPrice: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="b-infant-land-price">Infant land price (Rs.)</label>
            <input
              id="b-infant-land-price"
              value={form.infantLandPrice}
              placeholder="e.g. 4000"
              onChange={(e) => setForm({ ...form, infantLandPrice: e.target.value })}
            />
          </div>
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
                <span className={styles.paymentDate}>{formatDateDMY(p.date) || "—"}</span>
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
          {mode === "edit" && (
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => onSubmit(false)}
              disabled={!canSubmit}
              title="Save the changes without emailing anyone"
            >
              {busyAction === "update" ? "Saving…" : "Update Changes"}
            </button>
          )}
          <button
            className={styles.submit}
            onClick={() => onSubmit(true)}
            disabled={!canSubmit}
            title={mode === "edit" ? "Save the changes and email the updated invoice to client, company & assigned user" : undefined}
          >
            {busyAction === "create"
              ? "Creating…"
              : busyAction === "sendMail"
              ? "Sending…"
              : mode === "create"
              ? "Create booking"
              : "Send Mail"}
          </button>
        </div>
      </Modal>

      <Modal
        open={!!viewBooking}
        onClose={() => setViewBooking(null)}
        title="Booking documents"
        maxWidth={640}
      >
        {viewBooking && (
          <>
            <div className={styles.viewDocsHeader}>
              <div className={styles.bName}>
                <span className={styles.bAvatar}>{viewBooking.clientName.slice(0, 2).toUpperCase()}</span>
                <b>{viewBooking.clientName}</b>
              </div>
              <div className={styles.viewDocsMeta}>
                {viewBooking.clientPhone}
                {viewBooking.clientEmail ? ` · ${viewBooking.clientEmail}` : ""}
              </div>
              <div className={styles.viewDocsMeta}>{viewBooking.packageTitle || "No package"}</div>
            </div>

            {(() => {
              const groups = docGroups(viewBooking);

              if (groups.length === 0) {
                return <div className={styles.docStatus}>No documents uploaded for this booking.</div>;
              }

              return (
                <>
                  <div className={styles.sectionLabel}>Full — all documents in one file</div>
                  <div className={styles.docFullSection}>
                    <span>
                      Every document below, combined onto one printable PDF sheet.
                    </span>
                    <button
                      type="button"
                      className={styles.submit}
                      onClick={() => downloadAllDocs(viewBooking)}
                      disabled={docActionBusy?.id === viewBooking.id}
                    >
                      <i className="fas fa-download" /> Download as PDF
                    </button>
                  </div>

                  <div className={styles.sectionLabel}>Single image — download individually</div>
                  {groups.map((g) => (
                    <div key={g.label}>
                      <div className={styles.docGroupLabel}>{g.label}</div>
                      <div className={styles.docGrid}>
                        {g.docs.map((doc, i) => (
                          <DocPreviewReadOnly key={i} doc={doc} onDownload={() => downloadSingleDoc(doc)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              );
            })()}
          </>
        )}
      </Modal>
    </>
  );
}
