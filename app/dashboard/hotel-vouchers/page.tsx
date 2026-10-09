"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { canUseMenu } from "@/lib/menus";
import { api, HotelVoucher, HotelVoucherInput, VoucherGuest, VoucherHotel } from "@/lib/api";
import { formatDateDMY } from "@/lib/dates";
import { downloadHotelVoucherPdf, getHotelVoucherPdfBlob } from "@/lib/hotelVoucherPdf";
import Navbar from "@/components/Navbar";
import Modal from "@/components/Modal";
import RefreshButton from "@/components/RefreshButton";
import PassportScan from "@/components/PassportScan";
import AutoGrowInput from "@/components/AutoGrowInput";
import type { PassportDetails } from "@/lib/passport";
import Toast, { ToastState } from "@/components/Toast";
import dash from "../dashboard.module.css";
// Same list/table/modal shape as the ledgers — reuse their styling.
import styles from "../accounts/accounts.module.css";
import "./voucher-preview.css";

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
const ViewIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const DownloadIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 4v11m0 0 4-4m-4 4-4-4M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const RemoveIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
  </svg>
);

const emptyGuest = (): VoucherGuest => ({ name: "", passportNo: "" });
const emptyHotel = (): VoucherHotel => ({
  hotelName: "",
  address: "",
  refNo: "",
  roomType: "",
  checkIn: "",
  checkOut: "",
  rooms: "",
  nights: "",
  city: "",
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = (): HotelVoucherInput => ({
  voucherNo: "",
  date: today(),
  agent: "Ambaari Tours & Travels",
  country: "India",
  nationality: "Indian",
  adults: "",
  children: "",
  contactPerson: "",
  meetingPoint: "",
  boardName: "",
  arrival: "",
  arrivalFlight: "",
  departure: "",
  departureFlight: "",
  specialRequirements: "",
  guests: [emptyGuest()],
  hotels: [emptyHotel()],
  holidayPackage: "",
  transferDetail: "",
});

// Whole nights between two yyyy-mm-dd dates ("" if either is missing).
function nightsBetween(checkIn: string, checkOut: string): string {
  if (!checkIn || !checkOut) return "";
  const n = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
  return n > 0 ? String(n) : "";
}

function dmyTime(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(v || "");
  return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}` : formatDateDMY(v);
}

export default function HotelVouchersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  // Same role check as Sidebar's menu gate — the backend is the real
  // enforcement (routes/hotel_vouchers.py).
  const isVoucherRole = (user?.roleNames || []).some((rn) => rn.trim().toLowerCase() === "hotel voucher");
  const allowed = isAdmin || isVoucherRole || canUseMenu(user, "hotel-vouchers");

  const [vouchers, setVouchers] = useState<HotelVoucher[]>([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<HotelVoucherInput>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [pdfBusy, setPdfBusy] = useState<{ id: string; action: "view" | "download" } | null>(null);

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [perms, setPerms] = useState({ create: true, edit: true, delete: true });

  useEffect(() => {
    if (user && !allowed) router.replace("/dashboard");
  }, [user, allowed, router]);

  useEffect(() => {
    if (!allowed || isAdmin) return;
    api
      .getMyAccess()
      .then((info) => {
        const g = info.grants.find((g) => g.roleName.trim().toLowerCase() === "hotel voucher");
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
      setVouchers(await api.listHotelVouchers());
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load vouchers");
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
    if (!q) return vouchers;
    return vouchers.filter((v) =>
      [
        v.voucherNo,
        v.boardName,
        v.contactPerson,
        ...v.guests.map((g) => `${g.name} ${g.passportNo}`),
        ...v.hotels.map((h) => `${h.hotelName} ${h.city}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [vouchers, search]);

  async function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormErr("");
    setModalOpen(true);
    try {
      const { voucherNo } = await api.getNextVoucherNo();
      setForm((f) => ({ ...f, voucherNo }));
    } catch {
      // Leave it blank — still editable by hand.
    }
  }

  function openEdit(v: HotelVoucher) {
    // Copy just the form fields (not id/createdAt/createdBy).
    const base = emptyForm();
    const input = Object.fromEntries(
      (Object.keys(base) as (keyof HotelVoucherInput)[]).map((k) => [k, v[k] ?? base[k]])
    ) as HotelVoucherInput;
    setEditingId(v.id);
    setForm({
      ...input,
      guests: input.guests.length ? input.guests : [emptyGuest()],
      hotels: input.hotels.length ? input.hotels : [emptyHotel()],
    });
    setFormErr("");
    setModalOpen(true);
  }

  function closeModal() {
    if (!busy) setModalOpen(false);
  }

  function set<K extends keyof HotelVoucherInput>(key: K, value: HotelVoucherInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateGuest(i: number, patch: Partial<VoucherGuest>) {
    setForm((f) => ({ ...f, guests: f.guests.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
  }

  // Fills one guest from a passport scan: "Given Name Surname" + passport
  // number. Blank scan values never wipe what's already typed.
  function applyPassport(i: number, d: PassportDetails) {
    const name = [d.givenName, d.surname].filter(Boolean).join(" ");
    updateGuest(i, {
      ...(name ? { name } : {}),
      ...(d.passportNo ? { passportNo: d.passportNo } : {}),
    });
  }

  function updateHotel(i: number, patch: Partial<VoucherHotel>) {
    setForm((f) => ({
      ...f,
      hotels: f.hotels.map((h, j) => {
        if (j !== i) return h;
        const next = { ...h, ...patch };
        // Nights follow the dates; typing Nights directly still overrides.
        if ("checkIn" in patch || "checkOut" in patch) next.nights = nightsBetween(next.checkIn, next.checkOut) || next.nights;
        return next;
      }),
    }));
  }

  async function onSubmit() {
    setFormErr("");
    setBusy(true);
    try {
      const body: HotelVoucherInput = {
        ...form,
        guests: form.guests.filter((g) => g.name.trim() || g.passportNo.trim()),
        hotels: form.hotels.filter((h) => h.hotelName.trim()),
      };
      if (editingId) {
        await api.updateHotelVoucher(editingId, body);
        notify("ok", "Voucher updated");
      } else {
        await api.createHotelVoucher(body);
        notify("ok", "Voucher added");
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function onDelete(v: HotelVoucher) {
    window.clearTimeout(toastTimer.current);
    setToast({
      type: "confirm",
      text: `Delete voucher #${v.voucherNo || "—"}${v.boardName ? ` (${v.boardName})` : ""}? This cannot be undone.`,
      onCancel: () => setToast(null),
      onConfirm: async () => {
        setToast(null);
        try {
          await api.deleteHotelVoucher(v.id);
          notify("ok", "Voucher deleted");
          load();
        } catch (e) {
          notify("err", e instanceof Error ? e.message : "Failed to delete");
        }
      },
    });
  }

  async function onPdf(v: HotelVoucher, action: "view" | "download") {
    setPdfBusy({ id: v.id, action });
    try {
      if (action === "download") {
        await downloadHotelVoucherPdf(v);
      } else {
        const url = URL.createObjectURL(await getHotelVoucherPdfBlob(v));
        window.open(url, "_blank");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to build the voucher PDF");
    } finally {
      setPdfBusy(null);
    }
  }

  if (user && !allowed) return null;

  const canSubmit = !busy && (form.boardName.trim() || form.guests.some((g) => g.name.trim()));

  function text(id: string, label: string, key: keyof HotelVoucherInput, placeholder?: string, type = "text") {
    return (
      <div className={styles.field}>
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type={type}
          value={form[key] as string}
          placeholder={placeholder}
          onChange={(e) => set(key, e.target.value as never)}
        />
      </div>
    );
  }

  return (
    <>
      <Navbar title="Hotel Voucher" />
      <Toast toast={toast} />
      <div className={dash.content}>
        <section className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div className={styles.tableHeadLeft}>
              <h3>Hotel vouchers</h3>
              <span className={styles.count}>{vouchers.length} total</span>
            </div>
            <div className={styles.tableHeadRight}>
              <div className={styles.search}>
                <span className={styles.searchIcon}>{SearchIcon}</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by voucher, guest, hotel…" />
              </div>
              <RefreshButton onRefresh={load} />
              {(isAdmin || perms.create) && (
                <button className={styles.createBtn} onClick={openCreate}>
                  + Add Hotel Voucher
                </button>
              )}
            </div>
          </div>

          {!loaded ? (
            <div className={styles.empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>{search ? "No vouchers match your search." : "No vouchers yet."}</div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Voucher No</th>
                    <th>Date</th>
                    <th>Board Name</th>
                    <th>Pax</th>
                    <th>Hotels</th>
                    <th>Arrival</th>
                    <th>Departure</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => (
                    <tr key={v.id}>
                      <td>{v.voucherNo || "—"}</td>
                      <td>{formatDateDMY(v.date) || "—"}</td>
                      <td>{v.boardName || v.guests[0]?.name || "—"}</td>
                      <td>
                        {Number(v.adults) || 0}A{Number(v.children) ? ` · ${v.children}C` : ""}
                      </td>
                      <td title={v.hotels.map((h) => h.hotelName).join(", ")}>
                        {v.hotels.length ? v.hotels.map((h) => h.hotelName).join(", ") : "—"}
                      </td>
                      <td>
                        {dmyTime(v.arrival) || "—"}
                        {v.arrivalFlight && <div style={{ color: "var(--ink-dim)", fontSize: 12 }}>{v.arrivalFlight}</div>}
                      </td>
                      <td>
                        {dmyTime(v.departure) || "—"}
                        {v.departureFlight && <div style={{ color: "var(--ink-dim)", fontSize: 12 }}>{v.departureFlight}</div>}
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            className={styles.iconBtn}
                            onClick={() => onPdf(v, "view")}
                            disabled={pdfBusy?.id === v.id}
                            aria-label="View voucher PDF"
                            title="View PDF"
                          >
                            {pdfBusy?.id === v.id && pdfBusy.action === "view" ? <i className="fas fa-spinner fa-spin" /> : ViewIcon}
                          </button>
                          <button
                            className={styles.iconBtn}
                            onClick={() => onPdf(v, "download")}
                            disabled={pdfBusy?.id === v.id}
                            aria-label="Download voucher PDF"
                            title="Download PDF"
                          >
                            {pdfBusy?.id === v.id && pdfBusy.action === "download" ? (
                              <i className="fas fa-spinner fa-spin" />
                            ) : (
                              DownloadIcon
                            )}
                          </button>
                          {(isAdmin || perms.edit) && (
                            <button className={styles.iconBtn} onClick={() => openEdit(v)} aria-label="Edit voucher" title="Edit">
                              {EditIcon}
                            </button>
                          )}
                          {(isAdmin || perms.delete) && (
                            <button
                              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                              onClick={() => onDelete(v)}
                              aria-label="Delete voucher"
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

      <Modal open={modalOpen} onClose={closeModal} title={editingId ? "Edit hotel voucher" : "Add hotel voucher"} maxWidth={920}>
        <div className={styles.row3}>
          {text("v-no", "Voucher No", "voucherNo")}
          {text("v-date", "Date", "date", undefined, "date")}
          {text("v-agent", "Agent", "agent")}
        </div>
        <div className={styles.row3}>
          {text("v-country", "Country", "country")}
          {text("v-nationality", "Nationality", "nationality")}
          {text("v-adults", "Adults", "adults", "e.g. 9")}
          {text("v-children", "Children", "children", "e.g. 0")}
        </div>

        <div className={styles.sectionLabel}>Booking details</div>
        <div className={styles.row3}>
          {text("v-contact", "Contact Person", "contactPerson", "Name - phone")}
          {text("v-meeting", "Meeting Point", "meetingPoint", "e.g. BKK Airport Gate No.3")}
          {text("v-board", "Board Name", "boardName", "Name on the pickup board")}
        </div>
        <div className={styles.row3}>
          {text("v-arrival", "Arrival", "arrival", undefined, "datetime-local")}
          {text("v-arrflight", "Arrival Flight No.", "arrivalFlight", "e.g. 6E-1213")}
          {text("v-departure", "Departure", "departure", undefined, "datetime-local")}
          {text("v-depflight", "Departure Flight No.", "departureFlight", "e.g. FD-137")}
        </div>
        <div className={styles.field}>
          <label htmlFor="v-special">Special Requirements (if any)</label>
          <textarea
            id="v-special"
            rows={2}
            value={form.specialRequirements}
            onChange={(e) => set("specialRequirements", e.target.value)}
          />
        </div>

        <div className={styles.sectionLabel}>Customer&apos;s details / PP No.</div>
        {form.guests.map((g, i) => (
          <div key={i} className={styles.voucherHotel}>
            <div className={styles.voucherHotelHead}>
              <strong>Guest {i + 1}</strong>
              {form.guests.length > 1 && (
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  onClick={() => setForm((f) => ({ ...f, guests: f.guests.filter((_, j) => j !== i) }))}
                  aria-label={`Remove guest ${i + 1}`}
                  title="Remove guest"
                >
                  {RemoveIcon}
                </button>
              )}
            </div>
            {/* Same passport reader as Room List — fills Name and Passport No. */}
            <PassportScan onScanned={(d) => applyPassport(i, d)} fields={["givenName", "passportNo"]} />
            <div className={styles.row3}>
              <div className={styles.field}>
                <label htmlFor={`v-g-name-${i}`}>Name</label>
                <AutoGrowInput id={`v-g-name-${i}`} value={g.name} onChange={(v) => updateGuest(i, { name: v })} />
              </div>
              <div className={styles.field}>
                <label htmlFor={`v-g-pp-${i}`}>Passport No</label>
                <input id={`v-g-pp-${i}`} value={g.passportNo} onChange={(e) => updateGuest(i, { passportNo: e.target.value })} />
              </div>
            </div>
          </div>
        ))}
        <button type="button" className={styles.addRowBtn} onClick={() => setForm((f) => ({ ...f, guests: [...f.guests, emptyGuest()] }))}>
          + Add guest
        </button>

        <div className={styles.sectionLabel}>Hotels</div>
        {form.hotels.map((h, i) => (
          <div key={i} className={styles.voucherHotel}>
            <div className={styles.voucherHotelHead}>
              <strong>Hotel {i + 1}</strong>
              {form.hotels.length > 1 && (
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  onClick={() => setForm((f) => ({ ...f, hotels: f.hotels.filter((_, j) => j !== i) }))}
                  aria-label={`Remove hotel ${i + 1}`}
                  title="Remove hotel"
                >
                  {RemoveIcon}
                </button>
              )}
            </div>
            <div className={styles.row3}>
              <div className={styles.field}>
                <label>Hotel Name</label>
                <input value={h.hotelName} onChange={(e) => updateHotel(i, { hotelName: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label>Room Type</label>
                <input value={h.roomType} placeholder="e.g. Deluxe Room" onChange={(e) => updateHotel(i, { roomType: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label>City</label>
                <input value={h.city} onChange={(e) => updateHotel(i, { city: e.target.value })} />
              </div>
            </div>
            <div className={styles.row3}>
              <div className={styles.field}>
                <label>Address</label>
                <input value={h.address} onChange={(e) => updateHotel(i, { address: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label>Ref No.</label>
                <input value={h.refNo} onChange={(e) => updateHotel(i, { refNo: e.target.value })} />
              </div>
            </div>
            <div className={styles.row3}>
              <div className={styles.field}>
                <label>Check In</label>
                <input type="date" value={h.checkIn} onChange={(e) => updateHotel(i, { checkIn: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label>Check Out</label>
                <input type="date" value={h.checkOut} min={h.checkIn || undefined} onChange={(e) => updateHotel(i, { checkOut: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label>Rooms</label>
                <input inputMode="numeric" value={h.rooms} onChange={(e) => updateHotel(i, { rooms: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label>Nights</label>
                <input inputMode="numeric" value={h.nights} onChange={(e) => updateHotel(i, { nights: e.target.value })} />
              </div>
            </div>
          </div>
        ))}
        <button type="button" className={styles.addRowBtn} onClick={() => setForm((f) => ({ ...f, hotels: [...f.hotels, emptyHotel()] }))}>
          + Add hotel
        </button>

        <div className={styles.sectionLabel}>Package &amp; transfers</div>
        <div className={styles.row3}>
          <div className={styles.field}>
            <label htmlFor="v-holiday">Holiday Package (one per line)</label>
            <textarea
              id="v-holiday"
              rows={6}
              value={form.holidayPackage}
              placeholder={"Sriracha Tiger Zoo + Breakfast — Pattaya\nCoral Island Tour With Lunch — Pattaya"}
              onChange={(e) => set("holidayPackage", e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="v-transfer">Transfer Detail (one per line)</label>
            <textarea
              id="v-transfer"
              rows={6}
              value={form.transferDetail}
              placeholder={"Bangkok BKK Airport to Pattaya Hotel\nPattaya Hotel to Bangkok Hotel"}
              onChange={(e) => set("transferDetail", e.target.value)}
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
