import { escapeHtml, BANK_DETAILS, downloadItineraryPdf } from "@/lib/itinerary";
import { buildUpiScannerDataUrl, UPI_PAYEE_ID } from "@/lib/upiQr";
import { AMBAARI_LOGO_BASE64 } from "@/lib/ambaariLogo";
import { formatDateDMY } from "@/lib/dates";
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
  infants: string;
  adultPrice: string;
  childPrice: string;
  infantPrice: string;
  advancePayments: AdvancePayment[];
  invoiceNumber: string;
  invoiceDate: string;
  // Shown on page 2, above the hardcoded terms & conditions.
  specialRequirements?: string;
};

function money(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// packagePrice was adults*adultPrice + children*childPrice only — infants
// were never part of this formula at all, so entering an infant price never
// moved the total anywhere this gets used: this summary box, the Package
// Amount column, the downloadable/emailed invoice, and the admin
// dashboard's revenue figures (all of which call this same function).
export function computeInvoiceTotals(input: {
  adults: string;
  children: string;
  infants: string;
  adultPrice: string;
  childPrice: string;
  infantPrice: string;
  advancePayments: AdvancePayment[];
}) {
  const adults = parseFloat(input.adults) || 0;
  const children = parseFloat(input.children) || 0;
  const infants = parseFloat(input.infants) || 0;
  const adultPrice = parseFloat(input.adultPrice) || 0;
  const childPrice = parseFloat(input.childPrice) || 0;
  const infantPrice = parseFloat(input.infantPrice) || 0;
  const packagePrice = adults * adultPrice + children * childPrice + infants * infantPrice;
  const totalAdvance = input.advancePayments.reduce(
    (sum, p) => sum + (parseFloat(p.amount) || 0),
    0
  );
  return { packagePrice, totalAdvance, balanceDue: packagePrice - totalAdvance };
}

function buildInvoiceHtml(input: InvoiceInput, qrDataUrl: string): string {
  const adults = parseFloat(input.adults) || 0;
  const children = parseFloat(input.children) || 0;
  const infants = parseFloat(input.infants) || 0;
  const adultPrice = parseFloat(input.adultPrice) || 0;
  const childPrice = parseFloat(input.childPrice) || 0;
  const infantPrice = parseFloat(input.infantPrice) || 0;
  const { packagePrice, totalAdvance, balanceDue } = computeInvoiceTotals(input);

  const paxLabel = [
    `${adults}A`,
    children > 0 ? `${children}C` : "",
    infants > 0 ? `${infants}I` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const priceLine = [
    `Adults: ${adults} &times; Rs. ${money(adultPrice)}/-`,
    children > 0 ? `Children: ${children} &times; Rs. ${money(childPrice)}/-` : "",
    infants > 0 ? `Infants: ${infants} &times; Rs. ${money(infantPrice)}/-` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const paymentRows = input.advancePayments.length
    ? input.advancePayments
        .map(
          (p, i) => `<tr>
            <td class="num">${i + 1}</td>
            <td>Advance Payment ${i + 1}</td>
            <td>${escapeHtml(formatDateDMY(p.date) || "—")}</td>
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
      <div><span>Invoice Date</span><b>${escapeHtml(formatDateDMY(input.invoiceDate) || "—")}</b></div>
      <div><span>Travel Date</span><b>${escapeHtml(formatDateDMY(input.travelDate) || "—")}</b></div>
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
            <div class="pkg-sub">Travel Date: ${escapeHtml(formatDateDMY(input.travelDate) || "—")}</div>
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

// ---------- Page 2: Special Requirements + hardcoded Terms & Conditions ----------
// A fixed block of legal copy, the same on every invoice regardless of
// packageType — this is the company's one printed terms document (it
// covers domestic and international together), not something derived from
// a specific package's own Cancellation Policy/Terms rich-text fields.

type TermsBlock = { p: string } | { list: string[] };
type TermsSection = { number: string; title: string; blocks: TermsBlock[] };

const TERMS_INTRO =
  "Ambaari Tours and Travels offers both domestic and international tour packages, each governed by their own terms below — please read the section that applies to your booking. By confirming a booking with us, you agree to the relevant terms and conditions, including our cancellation and refund policy.";

// Fixed contact details for the printed terms document — deliberately
// independent of the COMPANY_EMAIL/COMPANY_PHONE used elsewhere on the
// invoice itself, in case those two ever diverge.
const COMPANY_EMAIL_TERMS = "ambaaritoursandtravels19@gmail.com";
const COMPANY_PHONE_TERMS = "+91 96866 26428";

const DOMESTIC_TERMS: TermsSection[] = [
  {
    number: "01",
    title: "Tour Operation & Responsibility",
    blocks: [
      { p: "Ambaari Tours and Travels acts only as an agent for hotels, transport operators, railways, and other independent service providers for domestic tours." },
      { p: "We are not responsible for delays, cancellations, or rescheduling of trains, flights, or buses, or for changes in itinerary due to weather, technical reasons, natural disasters, political disturbances, road blockages, or other unforeseen circumstances beyond our control." },
    ],
  },
  {
    number: "02",
    title: "Travel Insurance (Recommended)",
    blocks: [
      { p: "Travelers are strongly recommended to have valid travel insurance covering medical emergencies, trip cancellations, baggage loss, etc." },
      { p: "In the absence of travel insurance, Ambaari Tours and Travels will not be responsible for any financial loss, injury, damage, or inconvenience during travel." },
    ],
  },
  {
    number: "03",
    title: "Identification & Travel Documents",
    blocks: [
      { p: "Travelers must carry a valid government-issued photo ID (Aadhar Card, PAN Card, Voter ID, or Passport) as required for hotel check-ins and travel bookings." },
      { p: "Any delay or denial of service due to incomplete, incorrect, or invalid identification is entirely the responsibility of the customer." },
    ],
  },
  {
    number: "04",
    title: "Force Majeure / Unforeseen Events",
    blocks: [
      { p: "Ambaari Tours and Travels shall not be liable for compensation, refund, or claim for changes in itinerary or unutilized services resulting from force majeure events, including weather disruptions, strikes, natural calamities, pandemics, road or rail disruptions, or government restrictions." },
    ],
  },
  {
    number: "05",
    title: "Package Pricing",
    blocks: [
      { p: "Package cost is based on current rates and taxes at the time of booking." },
      { p: "Any increase in taxes, fuel surcharge, toll charges, or transport fares after booking shall be payable by the customer." },
    ],
  },
  {
    number: "06",
    title: "Cancellation & Refund Policy",
    blocks: [
      { p: "All cancellations must be made in writing." },
      {
        list: [
          "Cancellations made 30+ days before departure: refund of the advance minus a 10% processing fee",
          "Cancellations made 15–29 days before departure: 50% cancellation charge",
          "Cancellations made within 14 days of departure: non-refundable",
        ],
      },
      { p: "Additional cancellation charges imposed by hotels, transport operators, or other service providers will apply as per their own policies. No refund will be provided for partially used services." },
    ],
  },
  {
    number: "07",
    title: "Customer Declaration",
    blocks: [
      { p: "I/We have read, understood, and agree to abide by the above terms and conditions. I/We acknowledge that Ambaari Tours and Travels is acting as a facilitator/agent and is not responsible for circumstances beyond its control." },
    ],
  },
];

const INTERNATIONAL_TERMS: TermsSection[] = [
  {
    number: "01",
    title: "Tour Operation & Responsibility",
    blocks: [
      { p: "Ambaari Tours and Travels acts only as an agent for airlines, hotels, transport operators, and other independent service providers." },
      { p: "We are not responsible for flight delays, cancellations, rescheduling, or changes in itinerary due to weather, technical reasons, natural disasters, political disturbances, or other unforeseen circumstances beyond our control." },
    ],
  },
  {
    number: "02",
    title: "Travel Insurance (Mandatory)",
    blocks: [
      { p: "All travelers must have valid travel insurance covering medical emergencies, trip cancellations, baggage loss, etc." },
      { p: "In the absence of travel insurance, Ambaari Tours and Travels will not be responsible for any financial loss, injury, damage, or inconvenience during travel." },
    ],
  },
  {
    number: "03",
    title: "Passport, Visa & Immigration",
    blocks: [
      { p: "Travelers must ensure they hold a valid passport (with required minimum validity), visa, and necessary travel documents." },
      { p: "Any delay, deportation, or denial of entry due to incomplete, incorrect, or invalid documents is entirely the responsibility of the customer." },
    ],
  },
  {
    number: "04",
    title: "Force Majeure / Unforeseen Events",
    blocks: [
      { p: "Ambaari Tours and Travels shall not be liable for compensation, refund, or claim for changes in itinerary or unutilized services resulting from force majeure events, including weather disruptions, strikes, natural calamities, pandemics, or government restrictions." },
    ],
  },
  {
    number: "05",
    title: "Package Pricing",
    blocks: [
      { p: "Package cost is based on current rates, taxes, and currency exchange rates at the time of booking." },
      { p: "Any increase in taxes, fuel surcharge, visa fees, or currency exchange fluctuation after booking shall be payable by the customer." },
    ],
  },
  {
    number: "06",
    title: "Cancellation & Refund Policy",
    blocks: [
      { p: "All cancellations must be made in writing." },
      {
        list: [
          "Cancellations made 30+ days before departure: refund of the advance minus a 10% processing fee",
          "Cancellations made 15–29 days before departure: 50% cancellation charge",
          "Cancellations made within 14 days of departure: non-refundable",
        ],
      },
      { p: "Applicable cancellation charges as per company policy and those imposed by airlines, hotels, and other service providers will apply. No refund will be provided for partially used services." },
    ],
  },
  {
    number: "07",
    title: "Customer Declaration",
    blocks: [
      { p: "I/We have read, understood, and agree to abide by the above terms and conditions. I/We acknowledge that Ambaari Tours and Travels is acting as a facilitator/agent and is not responsible for circumstances beyond its control. I/We confirm that valid travel insurance has been purchased; otherwise, I/we accept full responsibility for any issues or losses arising from non-purchase of travel insurance." },
    ],
  },
  {
    number: "08",
    title: "Questions About These Terms?",
    blocks: [
      { p: "For any questions about our terms, cancellation policy, or a specific booking, reach out to us:" },
      { list: [`Email: ${COMPANY_EMAIL_TERMS}`, `Phone: ${COMPANY_PHONE_TERMS}`] },
    ],
  },
];

function renderTermsBlock(block: TermsBlock): string {
  if ("list" in block) {
    return `<ul class="terms-list">${block.list.map((li) => `<li>${escapeHtml(li)}</li>`).join("")}</ul>`;
  }
  return `<p>${escapeHtml(block.p)}</p>`;
}

function renderTermsSection(section: TermsSection): string {
  return `<div class="terms-section">
    <div class="terms-num">${section.number}</div>
    <div class="terms-section-body">
      <h4>${escapeHtml(section.title)}</h4>
      ${section.blocks.map(renderTermsBlock).join("")}
    </div>
  </div>`;
}

function buildTermsPageHtml(input: InvoiceInput): string {
  const special = (input.specialRequirements || "").trim();
  const specialBlock = special
    ? `<div class="invoice-block-title">Special Requirements</div>
       <div class="terms-special">${escapeHtml(special).replace(/\n/g, "<br>")}</div>`
    : "";

  return `<div class="invoice-doc terms-doc">
    ${specialBlock}
    <div class="invoice-block-title">Terms &amp; Conditions</div>
    <div class="terms-intro"><p>${escapeHtml(TERMS_INTRO)}</p></div>

    <div class="terms-group-heading">Domestic Tour Packages</div>
    ${DOMESTIC_TERMS.map(renderTermsSection).join("")}

    <div class="terms-group-heading">International Tour Packages</div>
    ${INTERNATIONAL_TERMS.map(renderTermsSection).join("")}
  </div>`;
}

async function renderInvoicePdf(
  input: InvoiceInput,
  filename: string,
  mode: "download" | "blob"
): Promise<Blob | void> {
  const { balanceDue } = computeInvoiceTotals(input);
  const qrDataUrl = await buildUpiScannerDataUrl(String(balanceDue > 0 ? balanceDue : 0));
  // Two top-level blocks — downloadItineraryPdf measures/paginates each
  // top-level child of the container independently, so the terms doc
  // (much taller than one page) naturally starts on its own page after the
  // invoice doc fills page 1, without any manual page-break bookkeeping.
  const html = buildInvoiceHtml(input, qrDataUrl) + buildTermsPageHtml(input);

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
