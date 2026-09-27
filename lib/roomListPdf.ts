import { escapeHtml, downloadItineraryPdf } from "@/lib/itinerary";
import { COMPANY_ADDRESS, COMPANY_PHONE, COMPANY_EMAIL } from "@/lib/invoice";
import { AMBAARI_LOGO_BASE64 } from "@/lib/ambaariLogo";
import { formatDateDMY } from "@/lib/dates";
import type { RoomEntry } from "@/lib/api";

// Same visual language as the booking invoice PDF (dark navy header, gold
// accents) — see room-list-preview.css, imported once in the Room List
// page so these plain (unscoped) classes apply when this HTML is injected
// via innerHTML into an off-screen container for html2canvas to rasterize.
function roomListHeader(): string {
  return `<div class="room-header">
    <img src="${AMBAARI_LOGO_BASE64}" class="room-logo" alt="Ambaari Tours and Travels" />
    <div class="room-header-right">
      <span class="room-badge">Room List</span>
      <div class="room-contact">${escapeHtml(COMPANY_PHONE)} &middot; ${escapeHtml(COMPANY_EMAIL)}</div>
      <div class="room-address">${escapeHtml(COMPANY_ADDRESS)}</div>
    </div>
  </div>`;
}

function roomListFooter(): string {
  return `<div class="room-thankyou">Ambaari Tours and Travels &middot; Room Allocation List</div>`;
}

function buildRoomListHtml(entry: RoomEntry): string {
  const travelers = entry.travelers;
  const rowCount = travelers.length || 1;

  const rows = travelers.length
    ? travelers
        .map((t, i) => {
          // Room Type / No. of Rooms are one value for the whole entry, not
          // per traveler — shown once via rowspan rather than repeated on
          // every row, matching the reference room-list layout.
          const roomCells =
            i === 0
              ? `<td class="rt" rowspan="${rowCount}">${escapeHtml(entry.roomType || "—")}</td>
                 <td class="num rt" rowspan="${rowCount}">${escapeHtml(entry.numberOfRooms || "—")}</td>`
              : "";
          return `<tr>
            <td class="num">${i + 1}</td>
            ${roomCells}
            <td>${escapeHtml(t.gender || "—")}</td>
            <td>${escapeHtml(t.givenName || "—")}</td>
            <td>${escapeHtml(t.surname || "—")}</td>
            <td>${escapeHtml(t.passportNo || "—")}</td>
            <td>${escapeHtml(formatDateDMY(t.dob) || "—")}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="7" class="muted">No travelers added yet.</td></tr>`;

  return `<div class="room-doc">
    ${roomListHeader()}
    <table class="room-table">
      <thead>
        <tr>
          <th>Sl.No</th>
          <th>Room Type</th>
          <th>No. of Rooms</th>
          <th>Gender</th>
          <th>Given Name</th>
          <th>Sur Name</th>
          <th>Passport No</th>
          <th>DOB</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${roomListFooter()}
  </div>`;
}

// The combined, multi-booking master sheet for a whole package/departure —
// every entry's travelers concatenated under one running Sl.No, each
// entry's Client/Room Type/No. of Rooms shown once via rowspan across its
// own traveler block, same as the per-entry PDF above but stacked.
function buildCombinedRoomListHtml(entries: RoomEntry[], packageTitle: string): string {
  let slNo = 0;
  const rows = entries
    .filter((entry) => entry.travelers.length > 0)
    .map((entry, groupIndex) => {
      const travelers = entry.travelers;
      const rowCount = travelers.length;
      // Alternates the whole row's background per CLIENT (not per row) —
      // with rowspan already merging the Client/Room Type/No. of Rooms
      // cells down the block, it's otherwise hard to tell at a glance
      // where one client's travelers end and the next one's begin.
      const groupClass = groupIndex % 2 === 0 ? "grp-a" : "grp-b";
      return travelers
        .map((t, i) => {
          slNo++;
          const groupCells =
            i === 0
              ? `<td class="rt" rowspan="${rowCount}">${escapeHtml(entry.clientName || "—")}</td>
                 <td class="rt" rowspan="${rowCount}">${escapeHtml(entry.roomType || "—")}</td>
                 <td class="num rt" rowspan="${rowCount}">${escapeHtml(entry.numberOfRooms || "—")}</td>`
              : "";
          return `<tr class="${groupClass}">
            <td class="num">${slNo}</td>
            ${groupCells}
            <td>${escapeHtml(t.gender || "—")}</td>
            <td>${escapeHtml(t.givenName || "—")}</td>
            <td>${escapeHtml(t.surname || "—")}</td>
            <td>${escapeHtml(t.passportNo || "—")}</td>
            <td>${escapeHtml(formatDateDMY(t.dob) || "—")}</td>
          </tr>`;
        })
        .join("");
    })
    .join("");

  return `<div class="room-doc">
    ${roomListHeader()}
    <div class="room-package-title">${escapeHtml(packageTitle || "All Packages")}</div>
    <table class="room-table">
      <thead>
        <tr>
          <th>Sl.No</th>
          <th>Client</th>
          <th>Room Type</th>
          <th>No. of Rooms</th>
          <th>Gender</th>
          <th>Given Name</th>
          <th>Sur Name</th>
          <th>Passport No</th>
          <th>DOB</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="9" class="muted">No travelers found.</td></tr>`}</tbody>
    </table>
    ${roomListFooter()}
  </div>`;
}

async function renderHtmlToPdf(
  html: string,
  filename: string,
  mode: "download" | "blob"
): Promise<Blob | void> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "900px";
  container.innerHTML = html;
  document.body.appendChild(container);
  try {
    return await downloadItineraryPdf(container, filename, mode);
  } finally {
    document.body.removeChild(container);
  }
}

export async function downloadRoomListPdf(entry: RoomEntry, filename = "room-list.pdf") {
  await renderHtmlToPdf(buildRoomListHtml(entry), filename, "download");
}

// Same render, but returns the PDF bytes instead of triggering a browser
// download — used to open it in a new tab for the "View" button.
export async function getRoomListPdfBlob(entry: RoomEntry, filename = "room-list.pdf"): Promise<Blob> {
  return (await renderHtmlToPdf(buildRoomListHtml(entry), filename, "blob")) as Blob;
}

// One combined PDF for every room-list entry under a given package — the
// "download all room lists for that package" master sheet.
export async function downloadCombinedRoomListPdf(
  entries: RoomEntry[],
  packageTitle: string,
  filename = "room-list.pdf"
) {
  await renderHtmlToPdf(buildCombinedRoomListHtml(entries, packageTitle), filename, "download");
}
