import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

// Runs as a Node.js serverless function (not Edge) — nodemailer needs real
// TCP sockets (net/tls), which the Edge runtime doesn't provide.
export const runtime = "nodejs";

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://console-backend-two.vercel.app"
    : "http://localhost:8000");

type AdvancePayment = { amount: string; date: string; note: string };

type BookingOut = {
  id: string;
  clientName: string;
  clientEmail: string;
  userEmail: string;
  packageTitle: string;
  invoiceNumber: string;
  invoiceDate: string;
  travelDate: string;
  amount: string;
  adults: string;
  children: string;
  adultPrice: string;
  childPrice: string;
  advancePayments: AdvancePayment[];
};

function totalAdvancePaid(payments: AdvancePayment[] | undefined): number {
  return (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

// Same formula as computeInvoiceTotals().packagePrice in lib/invoice.ts,
// reimplemented locally rather than imported — that module pulls in
// itinerary.ts's browser-only PDF/canvas code, which isn't safe to load in
// this Node serverless function.
function packagePriceTotal(b: Pick<BookingOut, "adults" | "children" | "adultPrice" | "childPrice">): number {
  const adults = Number(b.adults) || 0;
  const children = Number(b.children) || 0;
  const adultPrice = Number(b.adultPrice) || 0;
  const childPrice = Number(b.childPrice) || 0;
  return adults * adultPrice + children * childPrice;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

const EMAIL_SUBJECT = "✅ Booking Confirmed – Your Ambaari Tours & Travels Journey Awaits!";

function invoiceEmailHtml(b: BookingOut): string {
  const detailRow = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 18px;color:#64748b;border-bottom:1px solid #e2e8f0;">${label}</td>
      <td style="padding:8px 18px;font-weight:700;color:#0f2b45;border-bottom:1px solid #e2e8f0;">${value}</td>
    </tr>`;

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.6;max-width:600px;">
      <p>Dear ${b.clientName || "Traveller"},</p>
      <p>Greetings from Ambaari Tours and Travels!</p>
      <p>
        We are delighted to confirm your booking for the <b>${b.packageTitle || "your"} Tour Package</b>.
        Thank you for choosing us to be a part of your travel experience.
      </p>
      <p>Please find your booking details below:</p>

      <h3 style="color:#0f2b45;margin:20px 0 8px;">Booking Details</h3>
      <table style="border-collapse:collapse;width:100%;max-width:420px;background:#f8fafc;border-radius:8px;overflow:hidden;">
        ${detailRow("Invoice Number", b.invoiceNumber || "—")}
        ${detailRow("Invoice Date", formatDate(b.invoiceDate))}
        ${detailRow("Travel Date", formatDate(b.travelDate))}
        ${detailRow("Package Price × Pax", `&#8377;${packagePriceTotal(b).toLocaleString("en-IN")}`)}
        ${detailRow("Total Advance Paid", `&#8377;${totalAdvancePaid(b.advancePayments).toLocaleString("en-IN")}`)}
      </table>
      <p>Your invoice has been attached to this email for your reference.</p>

      <h3 style="color:#0f2b45;margin:20px 0 8px;">What's Next?</h3>
      <ul style="padding-left:20px;">
        <li>Please review your invoice and booking details carefully.</li>
        <li>Ensure that your passport, visa, and other travel documents are valid and ready before your departure.</li>
        <li>Our travel team will contact you closer to your travel date with your final itinerary, flight details, and other important travel information.</li>
        <li>If you have any questions or require assistance, please don't hesitate to contact us. Our team is always happy to help.</li>
      </ul>

      <p>
        Thank you once again for choosing Ambaari Tours and Travels. We look forward to creating
        an unforgettable travel experience for you.
      </p>

      <p style="margin-top:24px;">
        Warm Regards,<br>
        <b>Ambaari Tours and Travels</b><br>
        &#128222; +91 96866 26428<br>
        &#128231; ambaaritoursandtravels09@gmail.com<br>
        &#127760; www.ambaaritoursandtravels.com
      </p>
      <p style="font-style:italic;color:#64748b;">"Your Journey, Our Commitment."</p>
    </div>
  `;
}

export async function POST(request: NextRequest) {
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;
  const companyEmail = process.env.COMPANY_EMAIL || "ambaaritoursandtravels19@gmail.com";
  if (!emailUser || !emailPassword) {
    return NextResponse.json(
      { detail: "Email sending isn't configured on the server (EMAIL_USER/EMAIL_PASSWORD missing)" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ detail: "Missing authorization" }, { status: 401 });
  }

  const formData = await request.formData();
  const bookingId = formData.get("bookingId");
  const file = formData.get("invoice");
  if (typeof bookingId !== "string" || !bookingId) {
    return NextResponse.json({ detail: "Missing bookingId" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ detail: "Missing invoice PDF" }, { status: 400 });
  }

  // Re-fetch the booking from the backend using the caller's own token —
  // reuses the backend's existing auth/visibility rules instead of trusting
  // client-supplied email/amount fields for what goes out over email.
  const backendRes = await fetch(`${API}/bookings/${bookingId}`, {
    headers: { Authorization: authHeader },
  });
  if (!backendRes.ok) {
    return NextResponse.json({ detail: "Booking not found or not authorized" }, { status: backendRes.status });
  }
  const booking = (await backendRes.json()) as BookingOut;

  // Client + company inbox + whichever staff account this booking is
  // assigned to (the "User" dropdown in the booking form) — same email to
  // all three. The Set dedupes in case the assigned user's email happens to
  // match the company inbox.
  const recipients = Array.from(
    new Set(
      [booking.clientEmail?.trim(), companyEmail, booking.userEmail?.trim()].filter((v): v is string =>
        Boolean(v)
      )
    )
  );
  if (recipients.length === 0) {
    return NextResponse.json({ detail: "No recipient email available" }, { status: 400 });
  }

  const pdfBuffer = Buffer.from(await file.arrayBuffer());
  const subject = EMAIL_SUBJECT;
  const html = invoiceEmailHtml(booking);

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    // Gmail shows app passwords in 4-4-4-4 groups for readability; the
    // actual credential has no spaces in it.
    auth: { user: emailUser, pass: emailPassword.replace(/\s+/g, "") },
  });

  try {
    for (const to of recipients) {
      await transporter.sendMail({
        from: `"Ambaari Tours And Travels" <${emailUser}>`,
        to,
        subject,
        html,
        attachments: [
          { filename: file.name || "invoice.pdf", content: pdfBuffer, contentType: "application/pdf" },
        ],
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send invoice email";
    return NextResponse.json({ detail: message }, { status: 502 });
  }

  return new NextResponse(null, { status: 204 });
}
