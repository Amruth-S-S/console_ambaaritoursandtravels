import { escapeHtml, BANK_DETAILS, downloadItineraryPdf } from "@/lib/itinerary";
import { buildUpiScannerDataUrl, UPI_PAYEE_ID } from "@/lib/upiQr";
import { AMBAARI_LOGO_BASE64 } from "@/lib/ambaariLogo";
import type { AdvancePayment } from "@/lib/api";

export const COMPANY_ADDRESS =
  "1st A Main Rd, 2nd Block, Govindaraja Nagar Ward, Mudalapalya, Nagarbhavi, Bengaluru, Karnataka 560072";
export const COMPANY_PHONE = "+91-80730 97430";
export const COMPANY_EMAIL = "ambaaritoursandtravels09@gmail.com";

export type InvoiceInput = {
  companyName: string;
  clientName: string;
  clientPhone: string;
  location: string;
  packageTitle: string;
  travelDate: string;
  adults: string;
  children: string;
  adultPrice: string;
  childPrice: string;
  advancePayments: AdvancePayment[];
  invoiceNumber: string;
  invoiceDate: string;
};

function money(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function computeInvoiceTotals(input: {
  adults: string;
  children: string;
  adultPrice: string;
  childPrice: string;
  advancePayments: AdvancePayment[];
}) {
  const adults = parseFloat(input.adults) || 0;
  const children = parseFloat(input.children) || 0;
  const adultPrice = parseFloat(input.adultPrice) || 0;
  const childPrice = parseFloat(input.childPrice) || 0;
  const packagePrice = adults * adultPrice + children * childPrice;
  const totalAdvance = input.advancePayments.reduce(
    (sum, p) => sum + (parseFloat(p.amount) || 0),
    0
  );
  return { packagePrice, totalAdvance, balanceDue: packagePrice - totalAdvance };
}

function buildInvoiceHtml(input: InvoiceInput, qrDataUrl: string): string {
  const adults = parseFloat(input.adults) || 0;
  const children = parseFloat(input.children) || 0;
  const adultPrice = parseFloat(input.adultPrice) || 0;
  const childPrice = parseFloat(input.childPrice) || 0;
  const { packagePrice, totalAdvance, balanceDue } = computeInvoiceTotals(input);

  const paxLabel = children > 0 ? `${adults}A ${children}C` : `${adults}A`;
  const priceLine =
    children > 0
      ? `Adults: ${adults} &times; Rs. ${money(adultPrice)}/-, Children: ${children} &times; Rs. ${money(childPrice)}/-`
      : `Adults: ${adults} &times; Rs. ${money(adultPrice)}/-`;

  const paymentRows = input.advancePayments.length
    ? input.advancePayments
        .map(
          (p, i) => `<tr>
            <td class="num">${i + 1}</td>
            <td>Advance Payment ${i + 1}</td>
            <td>${escapeHtml(p.date || "—")}</td>
            <td>${escapeHtml(p.note || "—")}</td>
            <td class="num">Rs. ${money(parseFloat(p.amount) || 0)}/-</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="muted">No advance payments recorded.</td></tr>`;

  const paymentCountLabel =
    input.advancePayments.length === 1 ? "1 payment" : `${input.advancePayments.length} payments`;

  return `<div class="invoice-doc">
    <div class="invoice-header">
      <img src="${AMBAARI_LOGO_BASE64}" class="invoice-logo" alt="${escapeHtml(input.companyName)}" />
      <div class="invoice-header-right">
        <span class="invoice-badge">Invoice</span>
        <div class="invoice-contact">${escapeHtml(COMPANY_PHONE)} &middot; ${escapeHtml(COMPANY_EMAIL)}</div>
        <div class="invoice-address">${escapeHtml(COMPANY_ADDRESS)}</div>
      </div>
    </div>

    <div class="invoice-meta-row">
      <div><span>Invoice No.</span><b>#${escapeHtml(input.invoiceNumber || "—")}</b></div>
      <div><span>Invoice Date</span><b>${escapeHtml(input.invoiceDate || "—")}</b></div>
      <div><span>Travel Date</span><b>${escapeHtml(input.travelDate || "—")}</b></div>
    </div>

    <div class="invoice-block-title">Client Details</div>
    <div class="invoice-grid">
      <div><span>Client Name</span>${escapeHtml(input.clientName || "—")}</div>
      <div><span>Contact Number</span>${escapeHtml(input.clientPhone || "—")}</div>
      <div><span>Location</span>${escapeHtml(input.location || "—")}</div>
    </div>

    <div class="invoice-block-title">Package Details</div>
    <table class="invoice-table invoice-pkg-table">
      <thead>
        <tr>
          <th>Package</th>
          <th class="num">Price / Pax</th>
          <th class="num">Pax</th>
          <th class="num">Total Package Price</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="pkg-name">${escapeHtml(input.packageTitle || "Untitled package")}</div>
            <div class="pkg-sub">Travel Date: ${escapeHtml(input.travelDate || "—")}</div>
            <div class="pkg-sub">${priceLine}</div>
          </td>
          <td class="num">Rs. ${money(adultPrice)}/-</td>
          <td class="num">${paxLabel}</td>
          <td class="num total-price">Rs. ${money(packagePrice)}/-</td>
        </tr>
      </tbody>
    </table>

    <div class="invoice-block-title">Payment History</div>
    <table class="invoice-table invoice-pay-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Description</th>
          <th>Date</th>
          <th>Note</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${paymentRows}</tbody>
    </table>

    <div class="invoice-summary-rows">
      <div class="advance-row">
        <span>Total Advance Paid (${paymentCountLabel})</span>
        <b>Rs. ${money(totalAdvance)}/-</b>
      </div>
      <div class="balance-row">
        <span>Balance Due</span>
        <b>Rs. ${money(balanceDue)}/-</b>
      </div>
    </div>

    <div class="invoice-footer-block">
      <div class="invoice-footer-col">
        <div class="invoice-block-title">Bank Details</div>
        <div class="bank-grid">
          <div><span>Bank</span>${escapeHtml(BANK_DETAILS.bankName)}</div>
          <div><span>Account Name</span>${escapeHtml(BANK_DETAILS.accountName)}</div>
          <div><span>Account No.</span>${escapeHtml(BANK_DETAILS.accountNumber)}</div>
          <div><span>Account Type</span>${escapeHtml(BANK_DETAILS.accountType)}</div>
          <div><span>IFSC Code</span>${escapeHtml(BANK_DETAILS.ifscCode)}</div>
          <div><span>UPI ID</span>${escapeHtml(UPI_PAYEE_ID)}</div>
        </div>
      </div>
      <div class="invoice-footer-col invoice-qr-col">
        <img src="${qrDataUrl}" alt="UPI QR code" class="invoice-qr" />
        <div class="invoice-qr-caption">Scan to pay balance due</div>
        <div class="invoice-sig">
          <div class="sig-name">${escapeHtml(BANK_DETAILS.signatureName)}</div>
          <div class="sig-title">${escapeHtml(BANK_DETAILS.signatureTitle)}</div>
        </div>
      </div>
    </div>

    <div class="invoice-thankyou">
      Thank you for choosing ${escapeHtml(input.companyName)}. We look forward to making your journey unforgettable!
    </div>
  </div>`;
}

async function renderInvoicePdf(
  input: InvoiceInput,
  filename: string,
  mode: "download" | "blob"
): Promise<Blob | void> {
  const { balanceDue } = computeInvoiceTotals(input);
  const qrDataUrl = await buildUpiScannerDataUrl(String(balanceDue > 0 ? balanceDue : 0));
  const html = buildInvoiceHtml(input, qrDataUrl);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "800px";
  container.innerHTML = html;
  document.body.appendChild(container);
  try {
    return await downloadItineraryPdf(container, filename, mode);
  } finally {
    document.body.removeChild(container);
  }
}

export async function downloadInvoicePdf(input: InvoiceInput, filename = "invoice.pdf") {
  await renderInvoicePdf(input, filename, "download");
}

// Same invoice render as downloadInvoicePdf, but returns the PDF bytes
// instead of triggering a browser download — used to email the invoice.
export async function getInvoicePdfBlob(input: InvoiceInput, filename = "invoice.pdf"): Promise<Blob> {
  return (await renderInvoicePdf(input, filename, "blob")) as Blob;
}
