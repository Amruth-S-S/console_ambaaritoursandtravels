import type { PackageData, PackageDay } from "./api";
import { AMBAARI_LOGO_BASE64 } from "./ambaariLogo";
import {
  escapeHtml,
  hasForceBullet,
  htmlToText,
  sanitizeRichHtml,
  splitHtmlLines,
  splitHtmlLinesRaw,
} from "./richtext";

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

// Highlights/Inclusions/Exclusions/Day descriptions: a line only becomes a
// bullet when explicitly marked via the toolbar's bullet button (see
// hasForceBullet/RichTextField.handleBulletPoint) — nothing bullets
// automatically. Everything else renders as a plain paragraph (still bold/
// highlighted if formatted that way, just not a bullet). Consecutive
// bulleted lines share one <ul>; a plain line closes it and sits between as
// its own paragraph.
function renderMixedBulletList(items: string[], calloutClass: string): string {
  let html = "";
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      html += "</ul>";
      listOpen = false;
    }
  };
  items.forEach((item) => {
    const content = sanitizeRichHtml(item);
    if (hasForceBullet(content)) {
      if (!listOpen) {
        html += "<ul>";
        listOpen = true;
      }
      html += `<li>${content}</li>`;
    } else {
      closeList();
      html += `<p class="${calloutClass}">${content}</p>`;
    }
  });
  closeList();
  return html;
}

// Day descriptions are edited as rich text (RichTextField, bold/highlight)
// now, so this needs to handle real HTML lines — but packages saved before
// that switch still have their description stored as plain "\n"-separated
// text, so fall back to the old plain-text splitting for those.
//
// Checking only for <div>/<br> to decide "is this rich HTML" missed a real
// case: a description that's a single unbroken line (the user never
// pressed Enter) with a bold/highlighted SPAN inside it has neither tag —
// there's no line break to mark — so it was wrongly treated as legacy
// plain text and escapeHtml()'d, turning a real <b> tag into literally
// visible "<b>" text in the output. Checking for any of the tags the
// editor can actually produce (not just the line-boundary ones) covers
// that single-line-with-formatting case too.
export function toBulletList(text: string): string {
  const isRichHtml = /<(div|br|b|strong|mark|span)\b/i.test(text);
  const lines = isRichHtml ? splitHtmlLines(text) : splitLines(text).map(escapeHtml);
  if (!lines.length) return "";
  return renderMixedBulletList(lines, "day-line");
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
//   "- a point"         -> bullet point (typed marker)
//   anything else       -> plain paragraph, UNLESS forced via the toolbar's
//                          bullet button (hasForceBullet) — nothing bullets
//                          by default anymore; heading detection still takes
//                          priority over either bullet path.
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
    const forced = !mainMatch && !subMatch && hasForceBullet(lineHtml);

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
    } else if (forced) {
      bulletBuffer.push(lineHtml);
    } else {
      flushBullets();
      out += `<p class="legal-plain-line">${lineHtml}</p>`;
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
  // Every itinerary carries the same fixed Ambaari branding — no per-package
  // logo upload — so it always renders, never depends on what a package
  // happens to have saved.
  html += `<img src="${AMBAARI_LOGO_BASE64}" class="logo-img" alt="Ambaari Tours &amp; Travels">`;
  html += `<div class="brand-name">Ambaari Tours And Travels</div>`;
  if (data.poster) html += `<div><img src="${data.poster}" class="poster-img" alt="Poster"></div>`;
  html += `<div class="title">${escapeHtml(data.packageTitle || "Package Title")}</div>`;
  html += `<div class="sub-title">Duration: ${escapeHtml(data.duration || "N/A")}</div>`;
  html += `</div>`;

  if (data.highlights.length) {
    html += `<div class="section"><h3><i class="fas fa-star" style="color:#f59e0b;"></i> Package Highlights</h3>`;
    html += renderMixedBulletList(data.highlights, "callout-line");
    html += `</div>`;
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
          day.images
            .map((img) => {
              const caption = img.caption.trim();
              return (
                `<div class="day-img-wrap">` +
                `<img src="${img.src}" class="day-img" alt="${caption ? escapeHtml(caption) : "Day image"}">` +
                (caption ? `<div class="day-img-caption">${escapeHtml(caption)}</div>` : "") +
                `</div>`
              );
            })
            .join("") +
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
      html += `<h3><i class="fas fa-check-circle" style="color:#22c55e;"></i> Inclusions</h3>`;
      html += renderMixedBulletList(data.inclusions, "callout-line");
    }
    if (data.exclusions.length) {
      if (data.inclusions.length)
        html += `<hr style="margin:14px 0; border:0; border-top:1px solid #e2e8f0;">`;
      html += `<h3><i class="fas fa-times-circle" style="color:#ef4444;"></i> Exclusions</h3>`;
      html += renderMixedBulletList(data.exclusions, "callout-line");
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

// Uploaded photos (poster/day images) are embedded straight into the
// package document as base64 — an unresized upload from a phone camera can
// easily be 3-8 MB, and that weight gets shipped on *every* package list
// load, not just when viewing that one package (this is what took
// GET /packages from ~160s down to ~40s after excluding day images from
// that query, then most of the remaining weight turned out to be one 2.4 MB
// poster). Capping the longest side and re-encoding closes that off at the
// source — PNG stays PNG (preserves transparency, e.g. a logo), everything
// else re-encodes as JPEG, which is more than enough for on-screen/PDF use
// and typically an order of magnitude smaller.
//
// Tightened from 1600px/0.82 — a package with several days' worth of
// images could still add up past Vercel's ~4.5MB serverless request-body
// ceiling on save (POST/PUT /packages), since ALL of a package's images
// travel in that one request together. This roughly halves typical image
// weight (dimension cut alone is ~(1280/1600)^2 ≈ 64% of the pixel area),
// buying real headroom for a multi-day, multi-image package to still fit —
// though a package with MANY large photos can still hit that ceiling; see
// the 413 handling in lib/api.ts for what the user sees if it does.
const MAX_IMAGE_DIMENSION = 1280;
const JPEG_QUALITY = 0.72;

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const original = (e.target?.result as string) || "";
      if (!original || !file.type.startsWith("image/")) {
        resolve(original);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(original);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(
          file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", JPEG_QUALITY)
        );
      };
      img.onerror = () => resolve(original);
      img.src = original;
    };
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
