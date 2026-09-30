"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, BookingByPackage, Package, RoomEntry, RoomTraveler } from "@/lib/api";
import {
  downloadCombinedRoomListPdf,
  downloadRoomListPdf,
  getCombinedRoomListPdfBlob,
  getRoomListPdfBlob,
} from "@/lib/roomListPdf";
import Navbar from "@/components/Navbar";
import RefreshButton from "@/components/RefreshButton";
import PassportScan from "@/components/PassportScan";
import PassportExtraFields from "@/components/PassportExtraFields";
import { EMPTY_PASSPORT_EXTRAS, genderFromSex, PassportDetails, pickExtras } from "@/lib/passport";
import Modal from "@/components/Modal";
import Toast, { ToastState } from "@/components/Toast";
import dash from "../dashboard.module.css";
import styles from "./rooms.module.css";
import "./room-list-preview.css";

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

const PACKAGE_TYPE_OPTIONS: { value: "domestic" | "international"; label: string }[] = [
  { value: "domestic", label: "Domestic" },
  { value: "international", label: "International" },
];

const ROOM_TYPE_OPTIONS = ["Single", "Double", "Twin", "Triple", "Quad", "Family"];
const GENDER_OPTIONS = ["Male", "Female", "Other"];

const CATEGORY_LABELS: Record<RoomTraveler["category"], string> = {
  adult: "Adults",
  child: "Children",
  infant: "Infants",
};

function emptyTraveler(category: RoomTraveler["category"]): RoomTraveler {
  return {
    category,
    givenName: "",
    surname: "",
    gender: "",
    passportNo: "",
    dob: "",
    arrivalAirport: "",
    departureAirport: "",
    ...EMPTY_PASSPORT_EXTRAS,
  };
}

function buildTravelers(adults: number, children: number, infants: number): RoomTraveler[] {
  return [
    ...Array.from({ length: adults }, () => emptyTraveler("adult")),
    ...Array.from({ length: children }, () => emptyTraveler("child")),
    ...Array.from({ length: infants }, () => emptyTraveler("infant")),
  ];
}

type FormState = {
  slNo: string;
  packageType: "domestic" | "international";
  packageId: string;
  packageTitle: string;
  clientName: string;
  invoiceNumber: string;
  roomType: string;
  numberOfRooms: string;
  sharingPerRoom: string;
  travelers: RoomTraveler[];
};

const emptyForm: FormState = {
  slNo: "",
  packageType: "domestic",
  packageId: "",
  packageTitle: "",
  clientName: "",
  invoiceNumber: "",
  roomType: "Double",
  numberOfRooms: "",
  sharingPerRoom: "",
  travelers: [],
};

export default function RoomsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  // Same "Room List" role check as Sidebar's menu gate — a direct URL
  // visit shouldn't reach this page for anyone else, even though the
  // backend itself is the real enforcement (see routes/rooms.py).
  const isRoomListRole = (user?.roleNames || []).some(
    (rn) => rn.trim().toLowerCase() === "room list"
  );
  const allowed = isAdmin || isRoomListRole;

  const [entries, setEntries] = useState<RoomEntry[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [search, setSearch] = useState("");
  // Filters the list to one package's room lists — also what "Download
  // All" bundles into the combined master sheet below.
  const [packageFilter, setPackageFilter] = useState("");
  const [allBusy, setAllBusy] = useState<"view" | "download" | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  // Options for the Client dropdown, scoped to whatever package is
  // currently selected — see loadClientOptions below.
  const [clientOptions, setClientOptions] = useState<BookingByPackage[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [clientsLoading, setClientsLoading] = useState(false);

  const [docActionBusy, setDocActionBusy] = useState<{ id: string; action: "view" | "download" } | null>(
    null
  );

  // Defaults to fully allowed (matches the backend's default — see
  // routes/access.py) so buttons don't flash-hide before this resolves.
  // Admin never fetches this; they're never restricted.
  const [perms, setPerms] = useState({ create: true, edit: true, delete: true });

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (user && !allowed) router.replace("/dashboard");
  }, [user, allowed, router]);

  useEffect(() => {
    if (!allowed || isAdmin) return;
    api
      .getMyAccess()
      .then((info) => {
        const g = info.grants.find((g) => g.roleName.trim().toLowerCase() === "room list");
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

  function pdfFilename(entry: RoomEntry): string {
    const client = (entry.clientName || "room-list").replace(/[^a-z0-9]+/gi, "-");
    return `room-list-${client}.pdf`;
  }

  async function onViewPdf(entry: RoomEntry) {
    setDocActionBusy({ id: entry.id, action: "view" });
    try {
      const blob = await getRoomListPdfBlob(entry, pdfFilename(entry));
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Revoked after a delay rather than immediately — the new tab needs
      // the blob URL to still be valid by the time it finishes loading it.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to open room list");
    } finally {
      setDocActionBusy(null);
    }
  }

  async function onDownloadPdf(entry: RoomEntry) {
    setDocActionBusy({ id: entry.id, action: "download" });
    try {
      await downloadRoomListPdf(entry, pdfFilename(entry));
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to download room list");
    } finally {
      setDocActionBusy(null);
    }
  }

  async function load() {
    try {
      setEntries(await api.listRooms());
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load room lists");
    } finally {
      setLoaded(true);
    }
    api.listPackages().then(setPackages).catch(() => {});
  }

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const matchingPackages = useMemo(
    () => packages.filter((p) => p.packageType === form.packageType),
    [packages, form.packageType]
  );

  // One option per distinct package that actually has a room list —
  // populates the filter dropdown above the table.
  const packageFilterOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const e of entries) {
      if (e.packageId && !byId.has(e.packageId)) byId.set(e.packageId, e.packageTitle);
    }
    return Array.from(byId.entries())
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [entries]);

  const byPackage = useMemo(
    () => (packageFilter ? entries.filter((e) => e.packageId === packageFilter) : entries),
    [entries, packageFilter]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byPackage;
    return byPackage.filter(
      (e) =>
        e.slNo.toLowerCase().includes(q) ||
        e.invoiceNumber.toLowerCase().includes(q) ||
        e.clientName.toLowerCase().includes(q) ||
        e.packageTitle.toLowerCase().includes(q)
    );
  }, [byPackage, search]);

  // "View All" opens the combined sheet in a new tab, "Download All" saves
  // it — same PDF either way.
  async function onAllPdf(action: "view" | "download") {
    if (!packageFilter) return;
    const packageTitle =
      packageFilterOptions.find((p) => p.id === packageFilter)?.title || "room-list";
    const filename = `room-list-${packageTitle.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
    setAllBusy(action);
    try {
      if (action === "download") {
        await downloadCombinedRoomListPdf(byPackage, packageTitle, filename);
      } else {
        const blob = await getCombinedRoomListPdfBlob(byPackage, packageTitle, filename);
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to build combined room list");
    } finally {
      setAllBusy(null);
    }
  }

  function countOf(entry: RoomEntry, category: RoomTraveler["category"]) {
    return entry.travelers.filter((t) => t.category === category).length;
  }

  // Loads the clients booked under a package (with their adult/children/
  // infant counts) so the Client dropdown only ever offers real bookings —
  // called whenever the Package selection changes.
  async function loadClientOptions(packageId: string) {
    setClientsLoading(true);
    try {
      setClientOptions(await api.getBookingsByPackage(packageId));
    } catch {
      setClientOptions([]);
    } finally {
      setClientsLoading(false);
    }
  }

  function onPackageTypeChange(packageType: "domestic" | "international") {
    const stillValid = packages.find((p) => p.id === form.packageId)?.packageType === packageType;
    setForm((f) => ({
      ...f,
      packageType,
      ...(stillValid
        ? {}
        : { packageId: "", packageTitle: "", clientName: "", travelers: [] }),
    }));
    if (!stillValid) {
      setClientOptions([]);
      setSelectedBookingId("");
    }
  }

  function onPackageChange(packageId: string) {
    const pkg = packages.find((p) => p.id === packageId);
    setForm((f) => ({
      ...f,
      packageId,
      packageTitle: pkg?.packageTitle || "",
      clientName: "",
      travelers: [],
    }));
    setSelectedBookingId("");
    setClientOptions([]);
    if (packageId) loadClientOptions(packageId);
  }

  function onClientChange(bookingId: string) {
    setSelectedBookingId(bookingId);
    const match = clientOptions.find((c) => c.bookingId === bookingId);
    if (!match) {
      setForm((f) => ({ ...f, clientName: "", invoiceNumber: "", travelers: [] }));
      return;
    }
    setForm((f) => ({
      ...f,
      clientName: match.clientName,
      // Auto-filled from the booking, per the request — still editable
      // afterward in case this room list needs a different number.
      invoiceNumber: match.invoiceNumber,
      travelers: buildTravelers(
        Number(match.adults) || 0,
        Number(match.children) || 0,
        Number(match.infants) || 0
      ),
    }));
  }

  function updateTraveler(index: number, field: keyof RoomTraveler, value: string) {
    setForm((f) => ({
      ...f,
      travelers: f.travelers.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    }));
  }

  // Fills one traveler card from a passport scan. Blank scan values never
  // wipe what's already typed (e.g. page 2 alone has no name on it).
  function applyPassport(index: number, d: PassportDetails) {
    const scanned: Partial<RoomTraveler> = {
      givenName: d.givenName,
      surname: d.surname,
      gender: genderFromSex(d.sex),
      passportNo: d.passportNo,
      dob: d.dob,
      ...pickExtras(d),
    };
    setForm((f) => ({
      ...f,
      travelers: f.travelers.map((t, i) => {
        if (i !== index) return t;
        const next = { ...t };
        for (const [k, v] of Object.entries(scanned)) if (v) (next as Record<string, string>)[k] = v;
        return next;
      }),
    }));
  }

  async function openCreate() {
    setMode("create");
    setEditingId(null);
    setForm(emptyForm);
    setClientOptions([]);
    setSelectedBookingId("");
    setFormErr("");
    setModalOpen(true);
    try {
      const { slNo } = await api.getNextRoomSlNo();
      setForm((f) => ({ ...f, slNo }));
    } catch {
      // Leave it blank — the field is still editable by hand.
    }
  }

  async function openEdit(entry: RoomEntry) {
    setMode("edit");
    setEditingId(entry.id);
    setForm({
      slNo: entry.slNo,
      packageType: entry.packageType === "international" ? "international" : "domestic",
      packageId: entry.packageId,
      packageTitle: entry.packageTitle,
      clientName: entry.clientName,
      invoiceNumber: entry.invoiceNumber,
      roomType: entry.roomType,
      numberOfRooms: entry.numberOfRooms,
      sharingPerRoom: entry.sharingPerRoom,
      travelers: entry.travelers,
    });
    setFormErr("");
    setModalOpen(true);
    if (entry.packageId) {
      setClientsLoading(true);
      try {
        const options = await api.getBookingsByPackage(entry.packageId);
        const match = options.find((o) => o.clientName === entry.clientName);
        // The booking behind this entry may since have been edited/deleted
        // — fall back to a synthetic option so the dropdown still shows the
        // client name that's actually saved on this room-list entry.
        setClientOptions(match ? options : [...options, {
          bookingId: "__saved__",
          clientName: entry.clientName,
          adults: String(countOf(entry, "adult")),
          children: String(countOf(entry, "child")),
          infants: String(countOf(entry, "infant")),
          invoiceNumber: entry.invoiceNumber,
        }]);
        setSelectedBookingId(match ? match.bookingId : "__saved__");
      } catch {
        setClientOptions([]);
      } finally {
        setClientsLoading(false);
      }
    }
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
  }

  async function onSubmit() {
    setFormErr("");
    setBusy(true);
    try {
      const body = {
        slNo: form.slNo,
        packageType: form.packageType,
        packageId: form.packageId,
        packageTitle: form.packageTitle,
        clientName: form.clientName,
        invoiceNumber: form.invoiceNumber,
        roomType: form.roomType,
        numberOfRooms: form.numberOfRooms,
        sharingPerRoom: form.sharingPerRoom,
        travelers: form.travelers,
      };
      if (mode === "create") {
        await api.createRoom(body);
        notify("ok", "Room list added");
      } else if (editingId) {
        await api.updateRoom(editingId, body);
        notify("ok", "Room list updated");
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function onDelete(entry: RoomEntry) {
    window.clearTimeout(toastTimer.current);
    setToast({
      type: "confirm",
      text: `Delete the room list for ${entry.clientName || "this client"}? This cannot be undone.`,
      onCancel: () => setToast(null),
      onConfirm: async () => {
        setToast(null);
        try {
          await api.deleteRoom(entry.id);
          notify("ok", "Room list deleted");
          load();
        } catch (e) {
          notify("err", e instanceof Error ? e.message : "Failed to delete");
        }
      },
    });
  }

  if (user && !allowed) return null;

  const canSubmit = form.packageId.trim() && form.clientName.trim() && !busy;

  return (
    <>
      <Navbar title="Room List" />
      <Toast toast={toast} />
      <div className={dash.content}>
        <div className={styles.filterBar}>
          <label htmlFor="r-filter-package">Filter by Package</label>
          <select
            id="r-filter-package"
            value={packageFilter}
            onChange={(e) => setPackageFilter(e.target.value)}
          >
            <option value="">All packages</option>
            {packageFilterOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        <section className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div className={styles.tableHeadLeft}>
              <h3>Room lists</h3>
              <span className={styles.count}>{filtered.length} total</span>
            </div>
            <div className={styles.tableHeadRight}>
              <button
                className={styles.secondaryBtn}
                onClick={() => onAllPdf("view")}
                disabled={!packageFilter || allBusy !== null}
                title={
                  packageFilter
                    ? "Open a combined PDF of every room list for this package"
                    : "Select a package above first"
                }
              >
                {ViewIcon}
                {allBusy === "view" ? "Opening…" : "View All"}
              </button>
              <button
                className={styles.secondaryBtn}
                onClick={() => onAllPdf("download")}
                disabled={!packageFilter || allBusy !== null}
                title={
                  packageFilter
                    ? "Download a combined PDF of every room list for this package"
                    : "Select a package above first"
                }
              >
                {DownloadIcon}
                {allBusy === "download" ? "Downloading…" : "Download All"}
              </button>
              <div className={styles.search}>
                <span className={styles.searchIcon}>{SearchIcon}</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by Sl No, client or package…"
                />
              </div>
              <RefreshButton onRefresh={load} />
              {(isAdmin || perms.create) && (
                <button className={styles.createBtn} onClick={openCreate}>
                  + Add Room
                </button>
              )}
            </div>
          </div>

          {!loaded ? (
            <div className={styles.empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              {search
                ? "No room lists match your search."
                : packageFilter
                ? "No room lists for this package yet."
                : "No room lists yet."}
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Sl No</th>
                    <th>Invoice No</th>
                    <th>Package Type</th>
                    <th>Package</th>
                    <th>Client Name</th>
                    <th>Room Type</th>
                    <th>No of Rooms</th>
                    <th>Share Per Room</th>
                    <th>Adults</th>
                    <th>Children</th>
                    <th>Infants</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id}>
                      <td>{e.slNo || "—"}</td>
                      <td>{e.invoiceNumber || "—"}</td>
                      <td className={styles.capitalize}>{e.packageType}</td>
                      <td>{e.packageTitle || "—"}</td>
                      <td>{e.clientName || "—"}</td>
                      <td>{e.roomType || "—"}</td>
                      <td>{e.numberOfRooms || "—"}</td>
                      <td>{e.sharingPerRoom || "—"}</td>
                      <td>{countOf(e, "adult")}</td>
                      <td>{countOf(e, "child")}</td>
                      <td>{countOf(e, "infant")}</td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            className={styles.iconBtn}
                            onClick={() => onViewPdf(e)}
                            disabled={docActionBusy?.id === e.id}
                            aria-label="View room list PDF"
                            title="View"
                          >
                            {docActionBusy?.id === e.id && docActionBusy.action === "view" ? (
                              <i className="fas fa-spinner fa-spin" />
                            ) : (
                              ViewIcon
                            )}
                          </button>
                          <button
                            className={styles.iconBtn}
                            onClick={() => onDownloadPdf(e)}
                            disabled={docActionBusy?.id === e.id}
                            aria-label="Download room list PDF"
                            title="Download"
                          >
                            {docActionBusy?.id === e.id && docActionBusy.action === "download" ? (
                              <i className="fas fa-spinner fa-spin" />
                            ) : (
                              DownloadIcon
                            )}
                          </button>
                          {(isAdmin || perms.edit) && (
                            <button
                              className={styles.iconBtn}
                              onClick={() => openEdit(e)}
                              aria-label="Edit room list"
                              title="Edit"
                            >
                              {EditIcon}
                            </button>
                          )}
                          {(isAdmin || perms.delete) && (
                            <button
                              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                              onClick={() => onDelete(e)}
                              aria-label="Delete room list"
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
          )}
        </section>
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={mode === "create" ? "Add room list" : "Edit room list"}
        maxWidth={900}
      >
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="r-slno">Sl No</label>
            <input
              id="r-slno"
              value={form.slNo}
              onChange={(e) => setForm({ ...form, slNo: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="r-packagetype">Package Type</label>
            <select
              id="r-packagetype"
              value={form.packageType}
              onChange={(e) => onPackageTypeChange(e.target.value as "domestic" | "international")}
            >
              {PACKAGE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="r-package">Package</label>
            <select
              id="r-package"
              value={form.packageId}
              onChange={(e) => onPackageChange(e.target.value)}
            >
              <option value="">
                {matchingPackages.length === 0 ? "No packages found" : "Select a package…"}
              </option>
              {matchingPackages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.packageTitle}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="r-client">Client Name</label>
          <select
            id="r-client"
            value={selectedBookingId}
            onChange={(e) => onClientChange(e.target.value)}
            disabled={!form.packageId || clientsLoading}
          >
            <option value="">
              {!form.packageId
                ? "Select a package first…"
                : clientsLoading
                ? "Loading clients…"
                : clientOptions.length === 0
                ? "No clients booked under this package"
                : "Select a client…"}
            </option>
            {clientOptions.map((c) => (
              <option key={c.bookingId} value={c.bookingId}>
                {c.clientName} ({c.adults} adults, {c.children} children, {c.infants} infants)
              </option>
            ))}
          </select>
        </div>

        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="r-roomtype">Room Type</label>
            <select
              id="r-roomtype"
              value={form.roomType}
              onChange={(e) => setForm({ ...form, roomType: e.target.value })}
            >
              {ROOM_TYPE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="r-numrooms">No of Rooms</label>
            <input
              id="r-numrooms"
              value={form.numberOfRooms}
              placeholder="e.g. 2"
              onChange={(e) => setForm({ ...form, numberOfRooms: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="r-sharing">Share Per Room</label>
            <input
              id="r-sharing"
              value={form.sharingPerRoom}
              placeholder="e.g. 2"
              onChange={(e) => setForm({ ...form, sharingPerRoom: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="r-invoice">Invoice Number</label>
            <input
              id="r-invoice"
              value={form.invoiceNumber}
              placeholder="Auto-filled from the client's booking"
              onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
            />
          </div>
        </div>

        {form.travelers.length > 0 && (
          <div className={styles.travelerGroups}>
            {(["adult", "child", "infant"] as const).map((category) => {
              const inCategory = form.travelers
                .map((t, i) => ({ t, i }))
                .filter(({ t }) => t.category === category);
              if (inCategory.length === 0) return null;
              return (
                <div key={category} className={styles.travelerSection}>
                  <div className={styles.travelerSectionTitle}>
                    {CATEGORY_LABELS[category]} ({inCategory.length})
                  </div>
                  {inCategory.map(({ t, i }, n) => {
                    return (
                      <div key={i} className={styles.travelerCard}>
                        <div className={styles.travelerCardTitle}>
                          {CATEGORY_LABELS[category].replace(/s$/, "")} {n + 1}
                        </div>
                        <PassportScan onScanned={(d) => applyPassport(i, d)} />
                        <div className={styles.row3}>
                          <div className={styles.field}>
                            <label>Given Name</label>
                            <input
                              value={t.givenName}
                              onChange={(e) => updateTraveler(i, "givenName", e.target.value)}
                            />
                          </div>
                          <div className={styles.field}>
                            <label>Surname</label>
                            <input
                              value={t.surname}
                              onChange={(e) => updateTraveler(i, "surname", e.target.value)}
                            />
                          </div>
                          <div className={styles.field}>
                            <label>Gender</label>
                            <select
                              value={t.gender}
                              onChange={(e) => updateTraveler(i, "gender", e.target.value)}
                            >
                              <option value="">Select…</option>
                              {GENDER_OPTIONS.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className={styles.row3}>
                          <div className={styles.field}>
                            <label>Passport No</label>
                            <input
                              value={t.passportNo}
                              onChange={(e) => updateTraveler(i, "passportNo", e.target.value)}
                            />
                          </div>
                          <div className={styles.field}>
                            <label>DOB</label>
                            <input
                              type="date"
                              value={t.dob}
                              onChange={(e) => updateTraveler(i, "dob", e.target.value)}
                            />
                          </div>
                          <div className={styles.field}>
                            <label>Arrival Airport</label>
                            <input
                              value={t.arrivalAirport}
                              onChange={(e) => updateTraveler(i, "arrivalAirport", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className={styles.row3}>
                          <div className={styles.field}>
                            <label>Departure Airport</label>
                            <input
                              value={t.departureAirport}
                              onChange={(e) => updateTraveler(i, "departureAirport", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className={styles.passportDivider}>Passport details</div>
                        <PassportExtraFields
                          idPrefix={`t${i}`}
                          values={{ ...EMPTY_PASSPORT_EXTRAS, ...pickExtras(t) }}
                          onChange={(key, value) => updateTraveler(i, key, value)}
                          rowClass={styles.row3}
                          fieldClass={styles.field}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

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
