import type { PackageData, PackageDay } from "./api";
import { escapeHtml, htmlToText, sanitizeRichHtml, splitHtmlLinesRaw } from "./richtext";

export { escapeHtml };

export function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

export function splitCommas(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

export function toBulletList(text: string): string {
  const items = splitLines(text);
  if (!items.length) return "";
  return `<ul>${items.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`;
}

// The 3 legal-text fields (Cancellation Policy / Additional Information /
// Terms and Conditions) are edited as rich text (see components/RichTextField
// and lib/richtext.ts) — each "line" is one <div> (or <br> for older data),
// an HTML fragment that may contain <b>/highlight spans from the toolbar.
// Three typing conventions still control the per-line layout (tested against
// the line's PLAIN text, since a line's HTML fragment isn't guaranteed to be
// a whole well-formed match against these patterns once bold/highlight
// change its tag structure):
//   "1. Something"    -> numbered MAIN heading (bold, blue, numbered circle)
//   "Sub heading:"     -> SUB-heading (bold) - ends the line with a colon
//   "- a point"         -> bullet point (or just a short unmarked line)
//   "A full sentence."  -> stays as a bullet too (this tool renders everything
//                          that isn't a heading as a bullet row)
export function formatLegalText(html: string): string {
  if (!html || !htmlToText(html).trim()) return "";
  // splitHtmlLinesRaw (not splitHtmlLines) — keeps blank lines, which is what
  // triggers the paragraph-spacer between sections below.
  const lines = splitHtmlLinesRaw(html);
  let out = "";
  let bulletBuffer: string[] = [];

  function flushBullets() {
    if (bulletBuffer.length) {
      bulletBuffer.forEach((line) => {
        out += `<div class="legal-bullet-row"><span class="dot">•</span><span>${line}</span></div>`;
      });
      bulletBuffer = [];
    }
  }

  const mainHeadingRe = /^\s*(\d+)[.)]\s*(.+)/;
  const subHeadingRe = /^(.{1,80}):\s*$/;
  const bulletMarkerRe = /^\s*(?:[-•✔✓➤▪◦])\s*(.+)/;

  lines.forEach((rawLine) => {
    const lineHtml = sanitizeRichHtml(rawLine.trim());
    const plain = htmlToText(lineHtml).trim();
    if (plain === "") {
      flushBullets();
      out += `<div class="legal-spacer"></div>`;
      return;
    }

    const mainMatch = plain.match(mainHeadingRe);
    const bulletMatch = !mainMatch ? plain.match(bulletMarkerRe) : null;
    const subMatch = !mainMatch && !bulletMatch ? plain.match(subHeadingRe) : null;

    if (mainMatch) {
      flushBullets();
      // Best-effort: strip the leading "N. "/"N) " straight off the HTML —
      // works whenever that prefix isn't itself wrapped in a bold/highlight
      // tag, which covers ordinary use (numbering typed plain, text formatted
      // after it).
      const headingHtml = lineHtml.replace(/^\s*\d+[.)]\s*/, "");
      out += `<p class="legal-heading-main"><span class="legal-num">${escapeHtml(
        mainMatch[1]
      )}</span>${headingHtml}</p>`;
    } else if (subMatch) {
      flushBullets();
      out += `<p class="legal-heading-sub">${lineHtml}</p>`;
    } else if (bulletMatch) {
      // Strip a leading "- "/"• " etc. the same best-effort way.
      bulletBuffer.push(lineHtml.replace(/^\s*[-•✔✓➤▪◦]\s*/, ""));
    } else {
      bulletBuffer.push(lineHtml);
    }
  });
  flushBullets();
  return out;
}

export const BANK_DETAILS = {
  bankName: "Bank of Baroda",
  accountName: "Sharath Naik H O",
  accountNumber: "84300200001084",
  accountType: "Current Account",
  ifscCode: "BARB0VJHALE",
  signatureName: "SHARATH NAIK H O",
  signatureTitle: "Managing Director, Ambaari Tours and Travels",
};

function renderBankDetailsSection(scannerQr: string): string {
  return `<div class="section">
    <h3><i class="fas fa-university"></i> Bank Details</h3>
    <div class="bank-details-row">
        <div class="pricing-grid">
            <span class="label">Bank:</span><span>${escapeHtml(BANK_DETAILS.bankName)}</span>
            <span class="label">Account Name:</span><span>${escapeHtml(BANK_DETAILS.accountName)}</span>
            <span class="label">Account No.:</span><span>${escapeHtml(BANK_DETAILS.accountNumber)}</span>
            <span class="label">Account Type:</span><span>${escapeHtml(BANK_DETAILS.accountType)}</span>
            <span class="label">IFSC Code:</span><span>${escapeHtml(BANK_DETAILS.ifscCode)}</span>
        </div>
        <div class="qr-wrap">
            <img src="${scannerQr}" class="qr-img" alt="Payment QR Code">
            <p class="qr-caption">Scan to pay</p>
            <div class="upi-apps">
                <div class="upi-app-badge">
                    <div class="icon-tile" style="background:#5f259f;"><i class="fas fa-mobile-alt"></i></div>
                    <span class="app-label">PhonePe</span>
                </div>
                <div class="upi-app-badge">
                    <div class="icon-tile" style="background:#ffffff; border:1px solid #e2e8f0;"><i class="fab fa-google" style="color:#4285F4;"></i></div>
                    <span class="app-label">Google Pay</span>
                </div>
                <div class="upi-app-badge">
                    <div class="icon-tile" style="background:#f36f21;"><i class="fas fa-qrcode"></i></div>
                    <span class="app-label">BHIM UPI</span>
                </div>
                <div class="upi-app-badge">
                    <div class="icon-tile" style="background:#00baf2;"><i class="fas fa-wallet"></i></div>
                    <span class="app-label">Paytm</span>
                </div>
            </div>
        </div>
    </div>
    <p class="bank-signature">${escapeHtml(BANK_DETAILS.signatureName)} — ${escapeHtml(
    BANK_DETAILS.signatureTitle
  )}</p>
</div>`;
}

export function buildPreviewHtml(data: PackageData, scannerQr: string): string {
  let html = "";

  html += `<div class="header">`;
  if (data.logo) html += `<img src="${data.logo}" class="logo-img" alt="Logo">`;
  else if (data.companyName)
    html += `<div style="font-size:22px; font-weight:600;">${escapeHtml(data.companyName)}</div>`;
  if (data.poster) html += `<div><img src="${data.poster}" class="poster-img" alt="Poster"></div>`;
  html += `<div class="title">${escapeHtml(data.packageTitle || "Package Title")}</div>`;
  html += `<div class="sub-title">Duration: ${escapeHtml(data.duration || "N/A")}</div>`;
  html += `</div>`;

  if (data.highlights.length) {
    html += `<div class="section"><h3><i class="fas fa-star" style="color:#f59e0b;"></i> Package Highlights</h3><ul>`;
    data.highlights.forEach((h) => (html += `<li>${sanitizeRichHtml(h)}</li>`));
    html += `</ul></div>`;
  }

  const nonEmptyDays = data.days.filter(
    (d: PackageDay) => d.title !== "" || d.desc !== "" || d.images.length > 0
  );

  if (nonEmptyDays.length) {
    html += `<div class="section"><h3><i class="fas fa-calendar-day"></i> Day-by-Day Plan</h3>`;
    nonEmptyDays.forEach((day) => {
      const cols = Math.min(day.images.length, 4);
      let imagesHtml = "";
      if (day.images.length) {
        imagesHtml =
          `<div class="day-image-grid" style="grid-template-columns: repeat(${cols}, 1fr);">` +
          day.images.map((src) => `<img src="${src}" class="day-img" alt="Day image">`).join("") +
          `</div>`;
      }
      html += `<div class="day-item">
        <h4>${escapeHtml(day.title || "Day")}</h4>
        ${imagesHtml}
        ${toBulletList(day.desc)}
    </div>`;
    });
    html += `</div>`;
  }

  if (data.inclusions.length || data.exclusions.length) {
    html += `<div class="section">`;
    if (data.inclusions.length) {
      html += `<h3><i class="fas fa-check-circle" style="color:#22c55e;"></i> Inclusions</h3><ul>`;
      data.inclusions.forEach((item) => (html += `<li>${sanitizeRichHtml(item)}</li>`));
      html += `</ul>`;
    }
    if (data.exclusions.length) {
      if (data.inclusions.length)
        html += `<hr style="margin:14px 0; border:0; border-top:1px solid #e2e8f0;">`;
      html += `<h3><i class="fas fa-times-circle" style="color:#ef4444;"></i> Exclusions</h3><ul>`;
      data.exclusions.forEach((item) => (html += `<li>${sanitizeRichHtml(item)}</li>`));
      html += `</ul>`;
    }
    html += `</div>`;
  }

  html += `<div class="section"><h3><i class="fas fa-tag"></i> Pricing</h3><div class="pricing-grid">`;
  if (data.adultPrice) html += `<span class="label">Adult Price:</span><span>₹ ${escapeHtml(data.adultPrice)}</span>`;
  if (data.childPrice) html += `<span class="label">Child Price:</span><span>₹ ${escapeHtml(data.childPrice)}</span>`;
  if (data.bookingAmount)
    html += `<span class="label">Booking Amount:</span><span>₹ ${escapeHtml(data.bookingAmount)}</span>`;
  if (data.gst) html += `<span class="label">GST:</span><span>${escapeHtml(data.gst)}%</span>`;
  if (data.dates.length)
    html += `<span class="label">Available Dates:</span><span>${escapeHtml(data.dates.join(", "))}</span>`;
  html += `</div></div>`;

  if (data.cancellationPolicy && data.cancellationPolicy.trim() !== "") {
    html += `<div class="section"><h3><i class="fas fa-ban" style="color:#ef4444;"></i> Cancellation Policy</h3>
         ${formatLegalText(data.cancellationPolicy)}</div>`;
  }
  if (data.additionalInfo && data.additionalInfo.trim() !== "") {
    html += `<div class="section"><h3><i class="fas fa-info-circle" style="color:#3b82f6;"></i> Additional Information</h3>
         ${formatLegalText(data.additionalInfo)}</div>`;
  }
  if (data.termsConditions && data.termsConditions.trim() !== "") {
    html += `<div class="section"><h3><i class="fas fa-gavel" style="color:#8b5cf6;"></i> Terms and Conditions</h3>
         ${formatLegalText(data.termsConditions)}</div>`;
  }

  html += renderBankDetailsSection(scannerQr);

  return html;
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

export async function downloadItineraryPdf(
  container: HTMLElement,
  filename = "itinerary.pdf",
  mode: "download" | "blob" = "download"
): Promise<Blob | void> {
  const [{ default: html2canvas }, jspdfModule] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const { jsPDF } = jspdfModule;

  const topBlocks = Array.from(container.children) as HTMLElement[];
  if (topBlocks.length === 0) {
    throw new Error('Nothing to export yet — click "Generate Preview" first.');
  }

  const pdf = new jsPDF("p", "mm", "a4");
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const marginX = 8;
  const marginTop = 8;
  const gapMM = 4;
  const usableWidth = pdfWidth - marginX * 2;
  const usableHeight = pdfHeight - marginTop * 2;
  const mmPerPx = usableWidth / container.offsetWidth;

  function planRenderUnits(el: HTMLElement, depth: number): HTMLElement[] {
    const heightMM = el.offsetHeight * mmPerPx;
    if (heightMM <= usableHeight || depth >= 4 || el.children.length === 0) {
      return [el];
    }
    let units: HTMLElement[] = [];
    Array.from(el.children).forEach((child) => {
      units = units.concat(planRenderUnits(child as HTMLElement, depth + 1));
    });
    return units;
  }

  let renderUnits: HTMLElement[] = [];
  topBlocks.forEach((block) => {
    renderUnits = renderUnits.concat(planRenderUnits(block, 0));
  });

  const unitCanvases: HTMLCanvasElement[] = [];
  for (const el of renderUnits) {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 1200,
    });
    unitCanvases.push(canvas);
  }

  let cursorY = marginTop;
  let pageStarted = false;
  function newPage() {
    if (pageStarted) pdf.addPage();
    pageStarted = true;
    cursorY = marginTop;
  }
  newPage();

  for (const canvas of unitCanvases) {
    const scale = usableWidth / canvas.width;
    const unitHeightMM = canvas.height * scale;
    const remaining = pdfHeight - marginTop - cursorY;

    if (unitHeightMM <= remaining) {
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgData, "JPEG", marginX, cursorY, usableWidth, unitHeightMM);
      cursorY += unitHeightMM + gapMM;
    } else if (unitHeightMM <= usableHeight) {
      newPage();
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgData, "JPEG", marginX, cursorY, usableWidth, unitHeightMM);
      cursorY += unitHeightMM + gapMM;
    } else {
      newPage();
      const pageHeightPx = usableHeight / scale;
      let srcY = 0;
      let firstSlice = true;
      while (srcY < canvas.height) {
        const sliceHeightPx = Math.min(pageHeightPx, canvas.height - srcY);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeightPx;
        sliceCanvas
          .getContext("2d")!
          .drawImage(canvas, 0, srcY, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
        if (!firstSlice) newPage();
        firstSlice = false;
        const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.95);
        pdf.addImage(sliceData, "JPEG", marginX, marginTop, usableWidth, sliceHeightPx * scale);
        srcY += sliceHeightPx;
      }
      cursorY = pdfHeight;
    }
  }

  if (mode === "blob") return pdf.output("blob") as Blob;
  pdf.save(filename);
}
