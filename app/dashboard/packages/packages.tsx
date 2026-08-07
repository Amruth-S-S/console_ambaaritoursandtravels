"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, DayImage, Package, PackageData } from "@/lib/api";
import { SCANNER_QR_BASE64 } from "@/lib/scannerQr";
import { buildPreviewHtml, downloadItineraryPdf, readFileAsDataURL, splitCommas } from "@/lib/itinerary";
import { joinHtmlLines, splitHtmlLines } from "@/lib/richtext";
import Navbar from "@/components/Navbar";
import Modal from "@/components/Modal";
import RichTextField from "@/components/RichTextField";
import Toast, { ToastState } from "@/components/Toast";
import "./itinerary-preview.css";
import styles from "./packages.module.css";

type DayState = { title: string; desc: string; images: DayImage[] };

type FormState = {
  companyName: string;
  logo: string | null;
  poster: string | null;
  packageTitle: string;
  packageType: "domestic" | "international";
  duration: string;
  highlightsText: string;
  days: DayState[];
  inclusionsText: string;
  exclusionsText: string;
  adultPrice: string;
  childPrice: string;
  bookingAmount: string;
  gst: string;
  datesText: string;
  cancellationPolicy: string;
  additionalInfo: string;
  termsConditions: string;
};

const emptyForm: FormState = {
  companyName: "",
  logo: null,
  poster: null,
  packageTitle: "",
  packageType: "domestic",
  duration: "",
  highlightsText: "",
  days: [],
  inclusionsText: "",
  exclusionsText: "",
  adultPrice: "",
  childPrice: "",
  bookingAmount: "",
  gst: "",
  datesText: "",
  cancellationPolicy: "",
  additionalInfo: "",
  termsConditions: "",
};

function toPackageData(f: FormState): PackageData {
  return {
    companyName: f.companyName,
    logo: f.logo,
    poster: f.poster,
    packageTitle: f.packageTitle,
    packageType: f.packageType,
    duration: f.duration,
    // highlights/inclusions/exclusions are edited as rich text (RichTextField)
    // — each line is an HTML fragment (possibly containing <b>/highlight
    // spans) joined with <br>, not plain "\n" text.
    highlights: splitHtmlLines(f.highlightsText),
    days: f.days.map((d) => ({ title: d.title.trim(), desc: d.desc.trim(), images: d.images })),
    inclusions: splitHtmlLines(f.inclusionsText),
    exclusions: splitHtmlLines(f.exclusionsText),
    adultPrice: f.adultPrice,
    childPrice: f.childPrice,
    bookingAmount: f.bookingAmount,
    gst: f.gst,
    dates: splitCommas(f.datesText),
    cancellationPolicy: f.cancellationPolicy,
    additionalInfo: f.additionalInfo,
    termsConditions: f.termsConditions,
  };
}

function fromPackageData(p: PackageData): FormState {
  return {
    companyName: p.companyName,
    logo: p.logo,
    poster: p.poster,
    packageTitle: p.packageTitle,
    packageType: p.packageType,
    duration: p.duration,
    highlightsText: joinHtmlLines(p.highlights),
    days: p.days.map((d) => ({ title: d.title, desc: d.desc, images: d.images })),
    inclusionsText: joinHtmlLines(p.inclusions),
    exclusionsText: joinHtmlLines(p.exclusions),
    adultPrice: p.adultPrice,
    childPrice: p.childPrice,
    bookingAmount: p.bookingAmount,
    gst: p.gst,
    datesText: p.dates.join(", "),
    cancellationPolicy: p.cancellationPolicy,
    additionalInfo: p.additionalInfo,
    termsConditions: p.termsConditions,
  };
}

const EXAMPLE_DAYS: DayState[] = [
  {
    title: "Day 1: Gorakhpur → Lumbini",
    desc: "Pickup from Gorakhpur\nScenic drive to Nepal\nHotel check-in & relaxation",
    images: [],
  },
  {
    title: "Day 2: Lumbini → Pokhara",
    desc: "Visit Maya Devi Temple (Birthplace of Lord Buddha)\nDrive to Pokhara with scenic views",
    images: [],
  },
  {
    title: "Day 3: Pokhara Sightseeing",
    desc:
      "Visit Bindhyabasini Temple\nExplore Devi's Fall & Gupteshwor Mahadev Cave\nView Seti River Gorge\nEnjoy Phewa Lake & Tal Barahi Temple",
    images: [],
  },
  {
    title: "Day 4: Pokhara → Jomsom",
    desc: "Scenic Himalayan drive to Jomsom\nExperience breathtaking mountain landscapes",
    images: [],
  },
  {
    title: "Day 5: Jomsom → Muktinath → Pokhara",
    desc: "Darshan at Muktinath Temple\nHoly 108 Dhara Snan\nReturn journey to Pokhara",
    images: [],
  },
];

// Written as plain "\n"-separated text for readability, then converted to
// "<br>"-separated below — that's the line-break format RichTextField and
// splitHtmlLines() actually expect for the 6 rich-text fields.
const EXAMPLE_FORM_RAW: FormState = {
  companyName: "Ambaari Tours & Travels",
  logo: null,
  poster: null,
  packageTitle: "Divine Triveni Yatra: Nepal - Ayodhya - Varanasi",
  packageType: "international",
  duration: "10N/11D",
  highlightsText:
    "Sacred Darshan at Muktinath Temple\nDivine Blessings at Pashupatinath Temple\nScenic Beauty of Pokhara\nVisit to Ram Janmabhoomi\nMesmerizing Ganga Aarti at Dashashwamedh Ghat",
  days: EXAMPLE_DAYS,
  inclusionsText:
    "Gorakhpur pickup & Varanasi drop\n10 Nights accommodation in 3★ basic hotels\nDouble sharing rooms\nDaily breakfast & dinner\nPrivate AC vehicle for entire tour",
  exclusionsText:
    "Lunch\nManakamana cable car ticket (optional)\nEntry fees at monuments & sightseeing places\nBoating charges in Pokhara\nLocal auto charges in Janakpur, Ayodhya & Varanasi",
  adultPrice: "60000",
  childPrice: "",
  bookingAmount: "35000",
  gst: "0",
  datesText: "August 25-30, September 25-30",
  cancellationPolicy: `Refund Policy - Cambodia

General Policy
- Booking confirmed only after full payment
- Refunds processed after deducting cancellation & service charges
Cancellation Charges
- 45+ days: As per airline/hotel policy + service fee
- 30-44 days: 25% deduction
- 15-29 days: 50% deduction
- 7-14 days: 75% deduction
- Less than 7 days / No-show: No refund
Flights & Visa
- Air tickets: Non-refundable / partially refundable (as per airline rules)
- Visa charges: Non-refundable
- Visa rejection: Refund (if any) as per airline & hotel policy
Other Conditions
- No refund for unused services
- Not responsible for visa / immigration issues
- Company may cancel/modify due to unavoidable situations
Refund Timeline
- Refund processed within 15-30 working days
- Amount credited to original payment mode
Important Note
- Date/name change = Cancellation & rebooking
- All disputes under company jurisdiction`,
  additionalInfo: `- Passport must be valid for 6 months from date of arrival.
- Visa on arrival available for Indian passport holders (subject to change).
- Travel insurance is recommended.`,
  termsConditions: `Nepal - Ayodhya - Varanasi Tour: Terms & Conditions

1. ID & Travel Document Requirements
Indian travelers must carry a valid government ID (Aadhar Card / Voter ID)
For travel to Nepal, passport is optional for Indian citizens but recommended
Non-Indian travelers must carry a valid passport (minimum 6 months validity)
Keep multiple photocopies of ID documents

2. Entry & Permit Regulations
Indian citizens do not require a visa for Nepal
Entry is subject to local immigration rules at the Indo-Nepal border
Travelers must comply with all border security procedures
Final entry decision rests with immigration authorities

3. Mandatory Documents
Valid ID proof (Passport / Aadhar / Voter ID)
Confirmed hotel bookings & tour voucher
Travel itinerary details
Passport-size photographs (recommended)

4. Currency & Payments
Indian currency is widely accepted in Nepal (except Rs 500 & Rs 2000 notes may have restrictions)
Carry sufficient cash for personal expenses
Digital payments may not be available everywhere

5. Entry & Travel Responsibility
Entry and movement across borders are subject to government regulations
The company is not responsible for denied entry, delays due to document issues, or any personal compliance failure.
No refund in such cases.

6. Travel Delays & Conditions
Mountain routes (e.g., Jomsom / Muktinath) are weather-dependent
Delays due to landslides, traffic, or weather may occur
Itinerary may be adjusted for safety reasons

7. Health & Fitness
High-altitude travel (like Muktinath Temple) requires basic fitness
Travelers with medical conditions should consult a doctor before travel
Carry personal medicines

8. Prohibited Items & Conduct
Strictly avoid carrying illegal substances
Follow local customs and temple rules at places like Pashupatinath Temple and Kashi Vishwanath Temple
Dress modestly and maintain respectful behavior

9. Hotel & Transport Policy
Standard check-in/check-out as per hotel rules
Rooms on double sharing basis
Vehicle provided as per itinerary only
AC may not operate in hilly regions

10. Cancellation & Refund
Cancellation charges apply as per company policy
No refund for unused services.`,
};

const nl2br = (s: string) => s.replace(/\n/g, "<br>");

const EXAMPLE_FORM: FormState = {
  ...EXAMPLE_FORM_RAW,
  highlightsText: nl2br(EXAMPLE_FORM_RAW.highlightsText),
  days: EXAMPLE_FORM_RAW.days.map((d) => ({ ...d, desc: nl2br(d.desc) })),
  inclusionsText: nl2br(EXAMPLE_FORM_RAW.inclusionsText),
  exclusionsText: nl2br(EXAMPLE_FORM_RAW.exclusionsText),
  cancellationPolicy: nl2br(EXAMPLE_FORM_RAW.cancellationPolicy),
  additionalInfo: nl2br(EXAMPLE_FORM_RAW.additionalInfo),
  termsConditions: nl2br(EXAMPLE_FORM_RAW.termsConditions),
};

function coverImage(p: Package): string | null {
  if (p.poster) return p.poster;
  if (p.logo) return p.logo;
  for (const d of p.days) {
    if (d.images.length) return d.images[0].src;
  }
  return null;
}

export default function PackagesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [view, setView] = useState<"list" | "builder">("list");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [savedPackages, setSavedPackages] = useState<Package[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeTab, setTypeTab] = useState<"all" | "domestic" | "international">("all");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  // Which card's Preview/Edit/Download button is mid-fetch — the list only
  // carries lightweight package data now (see backend list_packages), so
  // opening a specific package for real means fetching its full detail
  // (day images included) first.
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const previewRef = useRef<HTMLDivElement>(null);

  // Quick preview/download straight from a card, without opening the builder.
  const [quickPreview, setQuickPreview] = useState<Package | null>(null);
  const [downloadTarget, setDownloadTarget] = useState<Package | null>(null);
  const downloadRef = useRef<HTMLDivElement>(null);

  // Admin-only net profit note per package — separate from the builder form
  // entirely, so it never touches PackageData/toPackageData/buildPreviewHtml
  // and can't end up in the itinerary preview or PDF. Split per pax category
  // (adult/child/infant) to match the per-category land price fields on
  // bookings — see the dashboard's net-revenue tables.
  const [netProfitTarget, setNetProfitTarget] = useState<Package | null>(null);
  const [adultNetProfitValue, setAdultNetProfitValue] = useState("");
  const [childNetProfitValue, setChildNetProfitValue] = useState("");
  const [infantNetProfitValue, setInfantNetProfitValue] = useState("");
  const [netProfitBusy, setNetProfitBusy] = useState(false);

  function notify(type: "ok" | "err", text: string) {
    window.clearTimeout(toastTimer.current);
    setToast({ type, text });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  async function loadPackages() {
    setListLoading(true);
    try {
      setSavedPackages(await api.listPackages());
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load packages");
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    loadPackages();
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handlePosterChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    updateField("poster", file ? await readFileAsDataURL(file) : null);
  }

  function addDay() {
    setForm((f) => ({ ...f, days: [...f.days, { title: "", desc: "", images: [] }] }));
  }

  function removeDay(idx: number) {
    setForm((f) => ({ ...f, days: f.days.filter((_, i) => i !== idx) }));
  }

  function updateDay(idx: number, patch: Partial<DayState>) {
    setForm((f) => ({
      ...f,
      days: f.days.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    }));
  }

  async function handleDayImagesChange(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const srcs = await Promise.all(files.map(readFileAsDataURL));
    updateDay(idx, { images: srcs.map((src) => ({ src, caption: "" })) });
  }

  function updateDayImageCaption(dayIdx: number, imageIdx: number, caption: string) {
    setForm((f) => ({
      ...f,
      days: f.days.map((d, i) =>
        i !== dayIdx
          ? d
          : { ...d, images: d.images.map((img, j) => (j === imageIdx ? { ...img, caption } : img)) }
      ),
    }));
  }

  function generatePreview() {
    setPreviewHtml(buildPreviewHtml(toPackageData(form), SCANNER_QR_BASE64));
  }

  async function handleDownloadPdf() {
    generatePreview();
    setPdfBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      if (!previewRef.current) return;
      const filename = `${form.packageTitle.trim() || "itinerary"}.pdf`;
      await downloadItineraryPdf(previewRef.current, filename);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  function loadExample() {
    setForm(EXAMPLE_FORM);
    setEditingId(null);
    setPreviewHtml(buildPreviewHtml(toPackageData(EXAMPLE_FORM), SCANNER_QR_BASE64));
  }

  function newPackage() {
    setForm(emptyForm);
    setEditingId(null);
    setPreviewHtml(null);
  }

  function openCreate() {
    newPackage();
    setView("builder");
  }

  async function openEdit(p: Package) {
    setOpeningId(p.id);
    try {
      const full = await api.getPackage(p.id);
      loadPackage(full);
      setView("builder");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load package");
    } finally {
      setOpeningId(null);
    }
  }

  async function savePackage() {
    setBusy(true);
    try {
      const data = toPackageData(form);
      if (editingId) {
        await api.updatePackage(editingId, data);
        notify("ok", "Package updated");
      } else {
        const created = await api.createPackage(data);
        setEditingId(created.id);
        notify("ok", "Package saved");
      }
      loadPackages();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to save package");
    } finally {
      setBusy(false);
    }
  }

  function loadPackage(p: Package) {
    setForm(fromPackageData(p));
    setEditingId(p.id);
    setPreviewHtml(buildPreviewHtml(p, SCANNER_QR_BASE64));
  }

  async function openQuickPreview(p: Package) {
    setOpeningId(p.id);
    try {
      setQuickPreview(await api.getPackage(p.id));
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load package");
    } finally {
      setOpeningId(null);
    }
  }

  function closeQuickPreview() {
    setQuickPreview(null);
  }

  function openNetProfit(p: Package) {
    setNetProfitTarget(p);
    setAdultNetProfitValue(p.adultNetProfit || "");
    setChildNetProfitValue(p.childNetProfit || "");
    setInfantNetProfitValue(p.infantNetProfit || "");
  }

  function closeNetProfit() {
    if (netProfitBusy) return;
    setNetProfitTarget(null);
    setAdultNetProfitValue("");
    setChildNetProfitValue("");
    setInfantNetProfitValue("");
  }

  async function saveNetProfit() {
    if (!netProfitTarget) return;
    setNetProfitBusy(true);
    try {
      const updated = await api.updatePackageNetProfit(netProfitTarget.id, {
        adultNetProfit: adultNetProfitValue.trim(),
        childNetProfit: childNetProfitValue.trim(),
        infantNetProfit: infantNetProfitValue.trim(),
      });
      setSavedPackages((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      notify("ok", "Net profit saved");
      setNetProfitTarget(null);
      setAdultNetProfitValue("");
      setChildNetProfitValue("");
      setInfantNetProfitValue("");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to save net profit");
    } finally {
      setNetProfitBusy(false);
    }
  }

  useEffect(() => {
    if (!downloadTarget) return;
    (async () => {
      try {
        // Give the hidden render below a tick to paint before we capture it.
        await new Promise((r) => setTimeout(r, 50));
        if (!downloadRef.current) return;
        const filename = `${downloadTarget.packageTitle.trim() || "itinerary"}.pdf`;
        await downloadItineraryPdf(downloadRef.current, filename);
      } catch (e) {
        notify("err", e instanceof Error ? e.message : "Failed to generate PDF");
      } finally {
        setPdfBusy(false);
        setDownloadTarget(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadTarget]);

  async function downloadPackagePdf(p: Package) {
    setOpeningId(p.id);
    try {
      const full = await api.getPackage(p.id);
      setPdfBusy(true);
      setDownloadTarget(full);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load package");
    } finally {
      setOpeningId(null);
    }
  }

  function deletePackage(id: string, title: string) {
    window.clearTimeout(toastTimer.current);
    setToast({
      type: "confirm",
      text: `Delete "${title || "Untitled package"}"? This cannot be undone.`,
      onCancel: () => setToast(null),
      onConfirm: async () => {
        setToast(null);
        try {
          await api.deletePackage(id);
          if (editingId === id) newPackage();
          notify("ok", "Package deleted");
          loadPackages();
        } catch (e) {
          notify("err", e instanceof Error ? e.message : "Failed to delete");
        }
      },
    });
  }

  const filteredPackages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return savedPackages.filter((p) => {
      if (typeTab !== "all" && p.packageType !== typeTab) return false;
      if (!q) return true;
      return (
        p.packageTitle.toLowerCase().includes(q) ||
        p.companyName.toLowerCase().includes(q) ||
        p.duration.toLowerCase().includes(q)
      );
    });
  }, [savedPackages, search, typeTab]);

  return (
    <>
      <Navbar title="Packages" />
      <Toast toast={toast} />
      {pdfBusy && (
        <div className={styles.loadingOverlay}>
          <i className="fas fa-spinner" />
          <span>Generating PDF, please wait...</span>
        </div>
      )}

      {quickPreview && (
        <div className={styles.quickPreviewOverlay} onClick={closeQuickPreview}>
          <div className={styles.quickPreviewModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.quickPreviewHeader}>
              <h2>{quickPreview.packageTitle || "Untitled package"}</h2>
              <div className={styles.quickPreviewHeaderActions}>
                <button className={styles.btn} onClick={() => downloadPackagePdf(quickPreview)} disabled={pdfBusy}>
                  <i className="fas fa-download" /> Download PDF
                </button>
                <button className={styles.iconBtn} onClick={closeQuickPreview} title="Close">
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>
            <div className={styles.previewBox}>
              <div
                className="itinerary-content"
                dangerouslySetInnerHTML={{ __html: buildPreviewHtml(quickPreview, SCANNER_QR_BASE64) }}
              />
            </div>
          </div>
        </div>
      )}

      {downloadTarget && (
        <div className={styles.offscreenRender}>
          <div
            ref={downloadRef}
            className="itinerary-content"
            dangerouslySetInnerHTML={{ __html: buildPreviewHtml(downloadTarget, SCANNER_QR_BASE64) }}
          />
        </div>
      )}

      {isAdmin && (
        <Modal open={!!netProfitTarget} onClose={closeNetProfit} title="Net profit">
          <div className={styles.npField}>
            <label>{netProfitTarget?.packageTitle || "Untitled package"}</label>
          </div>
          <div className={styles.npField}>
            <label htmlFor="np-adult">Adult net profit</label>
            <input
              id="np-adult"
              type="text"
              value={adultNetProfitValue}
              placeholder="e.g. 15000"
              onChange={(e) => setAdultNetProfitValue(e.target.value)}
              autoFocus
            />
          </div>
          <div className={styles.npField}>
            <label htmlFor="np-child">Child net profit</label>
            <input
              id="np-child"
              type="text"
              value={childNetProfitValue}
              placeholder="e.g. 8000"
              onChange={(e) => setChildNetProfitValue(e.target.value)}
            />
          </div>
          <div className={styles.npField}>
            <label htmlFor="np-infant">Infant net profit</label>
            <input
              id="np-infant"
              type="text"
              value={infantNetProfitValue}
              placeholder="e.g. 3000"
              onChange={(e) => setInfantNetProfitValue(e.target.value)}
            />
          </div>
          <div className={styles.npActions}>
            <button className={styles.npCancelBtn} onClick={closeNetProfit} disabled={netProfitBusy}>
              Cancel
            </button>
            <button className={styles.npSaveBtn} onClick={saveNetProfit} disabled={netProfitBusy}>
              {netProfitBusy ? "Saving…" : "Save"}
            </button>
          </div>
        </Modal>
      )}

      <div className={styles.page}>
        {view === "list" ? (
          <>
            <div className={styles.listHeader}>
              <span className={styles.count}>{savedPackages.length} total</span>
              <div className={styles.listHeaderRight}>
                <div className={styles.search}>
                  <i className="fas fa-search" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by title, company or duration…"
                  />
                </div>
                <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={openCreate}>
                  <i className="fas fa-plus" /> Create Package
                </button>
              </div>
            </div>

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

            {listLoading ? (
              <div className={styles.emptyState}>
                <i className={`fas fa-spinner ${styles.spin}`} /> Loading packages…
              </div>
            ) : savedPackages.length === 0 ? (
              <div className={styles.emptyState}>
                No packages yet — click <strong>Create Package</strong> to build your first one.
              </div>
            ) : filteredPackages.length === 0 ? (
              <div className={styles.emptyState}>
                {search.trim() ? "No packages match your search." : "No packages in this category yet."}
              </div>
            ) : (
              <div className={styles.grid}>
                {filteredPackages.map((p) => {
                  const cover = coverImage(p);
                  return (
                    <div key={p.id} className={styles.card}>
                      <div className={styles.cardImage}>
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover} alt="" />
                        ) : (
                          <div className={styles.cardImagePlaceholder}>
                            <i className="fas fa-map-marked-alt" />
                          </div>
                        )}
                      </div>
                      <div className={styles.cardBody}>
                        <div className={styles.cardTitle}>{p.packageTitle || "Untitled package"}</div>
                        <div className={styles.cardMeta}>
                          {p.duration && <span>{p.duration}</span>}
                          {p.adultPrice && <span>₹ {p.adultPrice}</span>}
                        </div>
                        <div className={styles.cardActions}>
                          {isAdmin && (
                            <button
                              className={styles.iconBtn}
                              onClick={() => openNetProfit(p)}
                              title="Net profit (admin only)"
                            >
                              <i className="fas fa-chart-line" />
                            </button>
                          )}
                          <button
                            className={styles.iconBtn}
                            onClick={() => openQuickPreview(p)}
                            title="Preview"
                            disabled={openingId === p.id}
                          >
                            <i className={openingId === p.id ? `fas fa-spinner ${styles.spin}` : "fas fa-eye"} />
                          </button>
                          <button
                            className={styles.iconBtn}
                            onClick={() => openEdit(p)}
                            title="Edit"
                            disabled={openingId === p.id}
                          >
                            <i
                              className={openingId === p.id ? `fas fa-spinner ${styles.spin}` : "fas fa-pencil-alt"}
                            />
                          </button>
                          <button
                            className={styles.iconBtn}
                            onClick={() => downloadPackagePdf(p)}
                            title="Download PDF"
                            disabled={pdfBusy || openingId === p.id}
                          >
                            <i className={openingId === p.id ? `fas fa-spinner ${styles.spin}` : "fas fa-download"} />
                          </button>
                          <button
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                            onClick={() => deletePackage(p.id, p.packageTitle)}
                            title="Delete"
                          >
                            <i className="fas fa-trash" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
        <div className={styles.builderWrap}>
        <div className={styles.builderBar}>
          <button className={`${styles.btn} ${styles.btnOutline} ${styles.btnSm}`} onClick={() => setView("list")}>
            <i className="fas fa-arrow-left" /> Back to Packages
          </button>
          {editingId && <span className={styles.editingBadge}>Editing saved package</span>}
        </div>

        <div className={styles.container}>
          <div className={styles.formPanel}>
            <h2 className={styles.formPanelHeader}>
              <i className="fas fa-pencil-alt" /> Itinerary Details
            </h2>
            <div className={styles.formPanelBody}>

            <div className={`${styles.formGroup} ${styles.fileUpload}`}>
              <label>
                <i className="fas fa-image" /> Poster Image (optional)
              </label>
              <input type="file" accept="image/*" onChange={handlePosterChange} />
            </div>

            <div className={styles.formGroup}>
              <label>Package Type</label>
              <select
                value={form.packageType}
                onChange={(e) => updateField("packageType", e.target.value as FormState["packageType"])}
              >
                <option value="domestic">Domestic</option>
                <option value="international">International</option>
              </select>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Package Title</label>
                <input
                  type="text"
                  value={form.packageTitle}
                  placeholder="e.g. Thailand 4N/5D"
                  onChange={(e) => updateField("packageTitle", e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Duration</label>
                <input
                  type="text"
                  value={form.duration}
                  placeholder="e.g. 5 Days 4 Nights"
                  onChange={(e) => updateField("duration", e.target.value)}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Package Highlights (one per line)</label>
              <RichTextField
                value={form.highlightsText}
                onChange={(html) => updateField("highlightsText", html)}
                placeholder="Enter each highlight on a new line..."
                rows={5}
              />
            </div>

            <div className={styles.formGroup}>
              <label>
                Day-by-Day Plan{" "}
                <button className={`${styles.btn} ${styles.btnSm} ${styles.btnSuccess}`} type="button" onClick={addDay}>
                  <i className="fas fa-plus" /> Add Day
                </button>
              </label>
              <div>
                {form.days.map((day, idx) => (
                  <div key={idx} className={styles.dayBlock}>
                    <button
                      className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm} ${styles.removeDay}`}
                      type="button"
                      onClick={() => removeDay(idx)}
                    >
                      <i className="fas fa-times" />
                    </button>
                    <div className={styles.formGroup}>
                      <label>Day Title</label>
                      <input
                        type="text"
                        value={day.title}
                        placeholder="e.g. Day 1: Bangkok Arrival"
                        onChange={(e) => updateDay(idx, { title: e.target.value })}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Description (one activity per line)</label>
                      <RichTextField
                        value={day.desc}
                        onChange={(html) => updateDay(idx, { desc: html })}
                        placeholder="Activities..."
                        rows={3}
                      />
                    </div>
                    <div className={`${styles.formGroup} ${styles.fileUpload}`}>
                      <label>
                        <i className="fas fa-images" /> Day Images (optional — select multiple, shown up to 4 per row)
                      </label>
                      <input type="file" accept="image/*" multiple onChange={(e) => handleDayImagesChange(idx, e)} />
                      {day.images.length > 0 && (
                        <div className={styles.dayImageThumbs}>
                          {day.images.map((img, i) => (
                            <div key={i} className={styles.dayImageThumb}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img.src} alt="" />
                              <input
                                type="text"
                                value={img.caption}
                                placeholder="Caption (optional)"
                                onChange={(e) => updateDayImageCaption(idx, i, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Inclusions (one per line)</label>
              <RichTextField
                value={form.inclusionsText}
                onChange={(html) => updateField("inclusionsText", html)}
                placeholder="Enter each inclusion on a new line..."
                rows={5}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Exclusions (one per line)</label>
              <RichTextField
                value={form.exclusionsText}
                onChange={(html) => updateField("exclusionsText", html)}
                placeholder="Enter each exclusion on a new line..."
                rows={5}
              />
            </div>

            <div className={styles.sectionTitle}>Pricing Details</div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Adult Price (₹)</label>
                <input
                  type="text"
                  value={form.adultPrice}
                  placeholder="59,999"
                  onChange={(e) => updateField("adultPrice", e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Child Price (₹)</label>
                <input
                  type="text"
                  value={form.childPrice}
                  placeholder="Optional"
                  onChange={(e) => updateField("childPrice", e.target.value)}
                />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Booking Amount (₹)</label>
                <input
                  type="text"
                  value={form.bookingAmount}
                  placeholder="20,000"
                  onChange={(e) => updateField("bookingAmount", e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label>GST (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.gst}
                  placeholder="5"
                  onChange={(e) => updateField("gst", e.target.value)}
                />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Available Dates (comma separated)</label>
              <input
                type="text"
                value={form.datesText}
                placeholder="e.g. Apr 30, 2026 - May 5, 2026"
                onChange={(e) => updateField("datesText", e.target.value)}
              />
            </div>

            <div className={styles.sectionTitle} style={{ marginTop: 24 }}>
              Legal &amp; Additional Info
            </div>
            <div className={styles.formGroup}>
              <label>Cancellation Policy</label>
              <RichTextField
                value={form.cancellationPolicy}
                onChange={(html) => updateField("cancellationPolicy", html)}
                placeholder="Enter your cancellation policy..."
                rows={4}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Additional Information</label>
              <RichTextField
                value={form.additionalInfo}
                onChange={(html) => updateField("additionalInfo", html)}
                placeholder="Enter any extra info..."
                rows={4}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Terms and Conditions</label>
              <RichTextField
                value={form.termsConditions}
                onChange={(html) => updateField("termsConditions", html)}
                placeholder="Enter your T&C..."
                rows={4}
              />
            </div>

            <div style={{ marginTop: 25, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button className={styles.btn} onClick={generatePreview}>
                <i className="fas fa-eye" /> Generate Preview
              </button>
              <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={handleDownloadPdf} disabled={pdfBusy}>
                <i className="fas fa-file-pdf" /> Download PDF
              </button>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={loadExample}>
                <i className="fas fa-undo-alt" /> Load Example
              </button>
              <button className={styles.btn} onClick={savePackage} disabled={busy}>
                <i className="fas fa-save" /> {busy ? "Saving…" : editingId ? "Update Package" : "Save Package"}
              </button>
            </div>
            </div>
          </div>

          <div className={styles.previewPanel}>
            <div className={styles.previewPanelHeader}>
              <h2>
                <i className="fas fa-print" /> Live Preview
              </h2>
              <div className={styles.previewActions}>
                <button className={styles.btn} onClick={generatePreview}>
                  <i className="fas fa-sync-alt" /> Refresh
                </button>
              </div>
            </div>
            <div className={styles.previewBox}>
              <div
                className="itinerary-content"
                ref={previewRef}
                dangerouslySetInnerHTML={{
                  __html:
                    previewHtml ||
                    `<p class="${styles.previewEmpty}">Fill in the form and click <strong>Generate Preview</strong></p>`,
                }}
              />
            </div>
          </div>
        </div>
        </div>
        )}
      </div>
    </>
  );
}
