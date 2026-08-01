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

type BookingOut = {
  id: string;
  clientName: string;
  clientEmail: string;
  packageTitle: string;
  invoiceNumber: string;
  invoiceDate: string;
  travelDate: string;
  amount: string;
};

function invoiceEmailHtml(b: BookingOut): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.5;">
      <h2 style="color:#0f2b45;margin-bottom:4px;">Booking Confirmed</h2>
      <p>Hi ${b.clientName || "there"},</p>
      <p>
        Thank you for booking <b>${b.packageTitle || "your package"}</b> with
        Ambaari Tours and Travels. Your invoice is attached to this email.
      </p>
      <table style="border-collapse:collapse;margin:14px 0;font-size:14px;">
        <tr><td style="padding:3px 14px 3px 0;color:#64748b;">Invoice No.</td><td><b>${b.invoiceNumber || "—"}</b></td></tr>
        <tr><td style="padding:3px 14px 3px 0;color:#64748b;">Invoice Date</td><td><b>${b.invoiceDate || "—"}</b></td></tr>
        <tr><td style="padding:3px 14px 3px 0;color:#64748b;">Travel Date</td><td><b>${b.travelDate || "—"}</b></td></tr>
        <tr><td style="padding:3px 14px 3px 0;color:#64748b;">Amount Collected</td><td><b>Rs. ${b.amount || "0"}</b></td></tr>
      </table>
      <p>We look forward to making your journey unforgettable!</p>
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

  const recipients = Array.from(
    new Set([booking.clientEmail?.trim(), companyEmail].filter((v): v is string => Boolean(v)))
  );
  if (recipients.length === 0) {
    return NextResponse.json({ detail: "No recipient email available" }, { status: 400 });
  }

  const pdfBuffer = Buffer.from(await file.arrayBuffer());
  const subject = `Booking Confirmation - Invoice #${booking.invoiceNumber || booking.id}`;
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
        from: emailUser,
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
