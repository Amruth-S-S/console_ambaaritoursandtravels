import { escapeHtml, downloadItineraryPdf } from "@/lib/itinerary";
import { COMPANY_ADDRESS, COMPANY_PHONE, COMPANY_EMAIL } from "@/lib/invoice";
import { AMBAARI_LOGO_BASE64 } from "@/lib/ambaariLogo";
import type { HotelVoucher } from "@/lib/api";
import {
  TermsBlock,
  VOUCHER_TERMS,
  VOUCHER_TERMS_CONTACT,
  VOUCHER_TERMS_NOTE,
  VOUCHER_TERMS_SUBTITLE,
  VOUCHER_TERMS_TITLE,
} from "@/lib/voucherTerms";

// Same visual language as the invoice / room-list PDFs (navy header, gold
// accents). Styles live in voucher-preview.css, imported by the Hotel
// Voucher page so these plain classes apply when this HTML is rendered
// off-screen for html2canvas.

const e = (v: string | undefined) => escapeHtml(v || "");

function dmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(iso || "");
  if (!m) return iso || "";
  return `${m[3]}-${m[2]}-${m[1]}${m[4] ? ` ${m[4]}` : ""}`;
}

function lines(text: string): string {
  const items = (text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean);
  return items.length ? `<ul>${items.map((l) => `<li>${e(l)}</li>`).join("")}</ul>` : `<div class="hv-muted">—</div>`;
}

function buildVoucherHtml(v: HotelVoucher): string {
  const guests = v.guests.filter((g) => g.name || g.passportNo);
  const guestRows = guests.length
    ? guests
        .map((g, i) => `<li><span class="hv-num">${i + 1}.</span> ${e(g.name)}${g.passportNo ? ` <span class="hv-pp">/ ${e(g.passportNo)}</span>` : ""}</li>`)
        .join("")
    : `<li class="hv-muted">—</li>`;

  const hotels = v.hotels.filter((h) => h.hotelName);
  const hotelRows = hotels.length
    ? hotels
        .map(
          (h) => `<tr>
            <td class="hv-hotel">
              <strong>${e(h.hotelName)}</strong>
              ${h.address ? `<div class="hv-sub">${e(h.address)}</div>` : ""}
              ${h.refNo ? `<div class="hv-ref">Ref No.: ${e(h.refNo)}</div>` : ""}
            </td>
            <td>${e(h.roomType) || "—"}</td>
            <td class="hv-nowrap">${dmy(h.checkIn) || "—"}</td>
            <td class="hv-nowrap">${dmy(h.checkOut) || "—"}</td>
            <td class="hv-c">${e(h.rooms) || "—"}</td>
            <td class="hv-c">${e(h.nights) || "—"}</td>
            <td>${e(h.city) || "—"}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="7" class="hv-muted hv-c">No hotels added.</td></tr>`;

  return `<div class="hv-doc">
    <div class="hv-header">
      <img src="${AMBAARI_LOGO_BASE64}" class="hv-logo" alt="Ambaari Tours and Travels" />
      <div class="hv-header-right">
        <span class="hv-badge">Hotel Voucher</span>
        <div class="hv-contact">${e(COMPANY_PHONE)} &middot; ${e(COMPANY_EMAIL)}</div>
        <div class="hv-address">${e(COMPANY_ADDRESS)}</div>
      </div>
    </div>

    <div class="hv-bar">
      <span>Voucher No: <strong>${e(v.voucherNo) || "—"}</strong></span>
      <span>Date: <strong>${dmy(v.date) || "—"}</strong></span>
    </div>

    <div class="hv-meta">
      <div><span>Agent</span>${e(v.agent) || "—"}</div>
      <div><span>Country</span>${e(v.country) || "—"}</div>
      <div><span>Nationality</span>${e(v.nationality) || "—"}</div>
      <div><span>Adults</span>${e(v.adults) || "0"}</div>
      <div><span>Children</span>${e(v.children) || "0"}</div>
    </div>

    <div class="hv-two">
      <div class="hv-box">
        <div class="hv-box-title">Booking Details</div>
        <table class="hv-kv">
          <tr><th>Contact Person</th><td>${e(v.contactPerson) || "—"}</td></tr>
          <tr><th>Meeting Point</th><td>${e(v.meetingPoint) || "—"}</td></tr>
          <tr><th>Board Name</th><td>${e(v.boardName) || "—"}</td></tr>
          <tr><th>Arrival</th><td>${dmy(v.arrival) || "—"}${v.arrivalFlight ? ` &nbsp;·&nbsp; Flight ${e(v.arrivalFlight)}` : ""}</td></tr>
          <tr><th>Departure</th><td>${dmy(v.departure) || "—"}${v.departureFlight ? ` &nbsp;·&nbsp; Flight ${e(v.departureFlight)}` : ""}</td></tr>
          <tr><th>Special Requirements</th><td class="hv-pre">${e(v.specialRequirements) || "—"}</td></tr>
        </table>
      </div>
      <div class="hv-box">
        <div class="hv-box-title">Customer's Details / PP No.</div>
        <ol class="hv-guests">${guestRows}</ol>
      </div>
    </div>

    <table class="hv-hotels">
      <thead>
        <tr><th>Hotel Name</th><th>Room Type</th><th>Check In</th><th>Check Out</th><th>Rooms</th><th>Nights</th><th>City</th></tr>
      </thead>
      <tbody>${hotelRows}</tbody>
    </table>

    <div class="hv-two">
      <div class="hv-box"><div class="hv-box-title">Holiday Package</div>${lines(v.holidayPackage)}</div>
      <div class="hv-box"><div class="hv-box-title">Transfer Detail</div>${lines(v.transferDetail)}</div>
    </div>

    <div class="hv-sign">
      <div><span></span>Booking Agent's Signature</div>
      <div><span></span>Service Agent's Signature</div>
    </div>

    <div class="hv-footer">Ambaari Tours and Travels &middot; Hotel Voucher</div>
  </div>`;
}

// Terms & Conditions — its own top-level block starting on a new page
// (data-page-break, see lib/itinerary.ts). Each section is a direct child so
// long terms split between sections, never through one.
function buildTermsHtml(): string {
  const block = (b: TermsBlock) =>
    "p" in b ? `<p>${e(b.p)}</p>` : `<ul>${b.list.map((li) => `<li>${e(li)}</li>`).join("")}</ul>`;
  return `<div class="hv-terms" data-page-break="before">
    <div class="hv-header">
      <img src="${AMBAARI_LOGO_BASE64}" class="hv-logo" alt="Ambaari Tours and Travels" />
      <div class="hv-header-right">
        <span class="hv-badge">Terms &amp; Conditions</span>
        <div class="hv-contact">${e(COMPANY_PHONE)} &middot; ${e(COMPANY_EMAIL)}</div>
      </div>
    </div>
    <div class="hv-terms-title">
      <h2>${e(VOUCHER_TERMS_TITLE)}</h2>
      <div>${e(VOUCHER_TERMS_SUBTITLE)}</div>
    </div>
    ${VOUCHER_TERMS.map(
      (s, i) => `<div class="hv-terms-sec">
        <h3><span>${i + 1}</span>${e(s.title)}</h3>
        ${s.blocks.map(block).join("")}
      </div>`
    ).join("")}
    <div class="hv-terms-contact">${VOUCHER_TERMS_CONTACT.map((l, i) => (i === 0 ? `<strong>${e(l)}</strong>` : `<div>${e(l)}</div>`)).join("")}</div>
    <div class="hv-terms-note">${e(VOUCHER_TERMS_NOTE)}</div>
    <div class="hv-footer">Ambaari Tours and Travels &middot; Standard Terms &amp; Conditions</div>
  </div>`;
}

async function render(v: HotelVoucher, filename: string, mode: "download" | "blob") {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "1000px";
  container.innerHTML = buildVoucherHtml(v) + buildTermsHtml();
  document.body.appendChild(container);
  try {
    return await downloadItineraryPdf(container, filename, mode);
  } finally {
    document.body.removeChild(container);
  }
}

export function voucherFilename(v: HotelVoucher): string {
  const who = (v.boardName || v.guests[0]?.name || "voucher").replace(/[^a-z0-9]+/gi, "-");
  return `hotel-voucher-${v.voucherNo || "draft"}-${who}.pdf`;
}

export async function downloadHotelVoucherPdf(v: HotelVoucher) {
  await render(v, voucherFilename(v), "download");
}

export async function getHotelVoucherPdfBlob(v: HotelVoucher): Promise<Blob> {
  return (await render(v, voucherFilename(v), "blob")) as Blob;
}
