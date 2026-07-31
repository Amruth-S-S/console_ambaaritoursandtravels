import QRCode from "qrcode";

// Fixed collection UPI ID (same person as BANK_DETAILS.accountName in itinerary.ts)
// — this is who the scanner pays into, not something entered per booking.
export const UPI_PAYEE_ID = "sharathnaik2021-1@okaxis";
export const UPI_PAYEE_NAME = "Sharath Naik H O";

export async function buildUpiScannerDataUrl(amount: string): Promise<string> {
  const uri =
    `upi://pay?pa=${encodeURIComponent(UPI_PAYEE_ID)}` +
    `&pn=${encodeURIComponent(UPI_PAYEE_NAME)}` +
    `&am=${encodeURIComponent(amount)}` +
    `&cu=INR`;
  return QRCode.toDataURL(uri, { width: 220, margin: 1 });
}
