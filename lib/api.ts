// NEXT_PUBLIC_API_URL overrides this if it's ever set (e.g. in the Vercel
// dashboard), but that's no longer required — production builds (NODE_ENV
// set automatically by `next build`) default to the deployed backend, local
// dev defaults to localhost, with no env var configuration needed either way.
const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://console-backend-two.vercel.app"
    : "http://localhost:8000");

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "admin" | "user";
};

export type DayImage = {
  src: string;
  caption: string;
};

export type PackageDay = {
  title: string;
  desc: string;
  images: DayImage[];
};

export type PackageData = {
  companyName: string;
  logo: string | null;
  poster: string | null;
  packageTitle: string;
  packageType: "domestic" | "international";
  duration: string;
  highlights: string[];
  days: PackageDay[];
  inclusions: string[];
  exclusions: string[];
  adultPrice: string;
  childPrice: string;
  bookingAmount: string;
  gst: string;
  dates: string[];
  cancellationPolicy: string;
  additionalInfo: string;
  termsConditions: string;
};

export type Package = PackageData & {
  id: string;
  createdAt: string;
  // Admin-only — the backend blanks these to "" for non-admin viewers no
  // matter what's actually stored, and they're set only via
  // api.updatePackageNetProfit, never through create/updatePackage (which
  // send PackageData, a type that deliberately has no net-profit fields).
  adultNetProfit: string;
  childNetProfit: string;
  infantNetProfit: string;
};

export type AdvancePayment = {
  amount: string;
  date: string;
  note: string;
};

export type BookingDocument = {
  name: string;
  type: string;
  data: string;
};

export type BookingData = {
  userId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  location: string;
  packageType: "domestic" | "international";
  packageId: string | null;
  // Legacy flat land-vendor cost field — superseded by the per-category
  // adult/child/infant land price fields below, which is what Overview's
  // net revenue reporting actually uses now. No longer editable in the
  // booking form; optional here purely so old callers building this object
  // don't need to pass it.
  landPackage?: string;
  travelDate: string;
  finalPaymentDate: string;
  adults: string;
  children: string;
  infants: string;
  adultPrice: string;
  childPrice: string;
  infantPrice: string;
  flightAmount: string;
  // Per-person land cost (mirrors adultPrice/childPrice/infantPrice) — used
  // with adults/children/infants on the admin dashboard's net-revenue
  // figures: categoryNetProfit - (categoryLandPrice * categoryCount).
  adultLandPrice: string;
  childLandPrice: string;
  infantLandPrice: string;
  advancePayments: AdvancePayment[];
  invoiceNumber: string;
  invoiceDate: string;
  amount: string;
  transactionId: string;
  // Free-text notes from the client — shown on page 2 of the invoice
  // alongside the hardcoded terms & conditions.
  specialRequirements?: string;
  // ID document uploads — excluded from listBookings() (see the backend
  // route) so getBooking(id) must be used to see/edit them.
  aadharDoc?: BookingDocument | null;
  panDoc?: BookingDocument | null;
  passportDoc?: BookingDocument | null;
  otherDocs?: BookingDocument[];
};

export type Booking = BookingData & {
  id: string;
  createdAt: string;
  userName: string;
  userEmail: string;
  packageTitle: string;
};

// FastAPI's error body is `{"detail": ...}`, but `detail` isn't always a
// plain string — a 422 validation failure (e.g. a required field missing)
// sends an ARRAY of {loc, msg, type} objects instead. Passing that straight
// to `new Error(...)` stringified it to a useless "[object Object]" toast
// with no indication of which field was the problem. This turns any shape
// FastAPI sends into one readable line per field.
function formatErrorDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const lines = detail
      .map((item) => {
        if (item && typeof item === "object") {
          const rec = item as { loc?: unknown; msg?: unknown };
          const loc = Array.isArray(rec.loc) ? rec.loc : [];
          // Pydantic's loc is like ["body", "packageTitle"] — "body" isn't
          // meaningful to a user, just the field name after it.
          const field = loc.filter((p) => p !== "body" && p !== "query").join(".");
          const msg = typeof rec.msg === "string" ? rec.msg : "Invalid value";
          return field ? `${field}: ${msg}` : msg;
        }
        return typeof item === "string" ? item : null;
      })
      .filter((s): s is string => Boolean(s));
    return lines.length ? lines.join("; ") : null;
  }

  if (detail && typeof detail === "object") {
    const msg = (detail as { msg?: unknown }).msg;
    if (typeof msg === "string") return msg;
    try {
      return JSON.stringify(detail);
    } catch {
      return null;
    }
  }

  return null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const res = await fetch(`${API}${path}`, {
    ...options,
    // Every response here is live, mutable app data (users/packages/bookings)
    // — never cache it, or an edit can appear not to "take" until a hard
    // reload flushes a stale cached GET.
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = "Something went wrong";
    if (res.status === 413) {
      // Vercel's own platform limit on a serverless function's request body
      // (~4.5MB), not something this app's code can raise — hit when a
      // package's photos (all embedded as base64, all sent together in one
      // save) add up past it. This response comes straight from Vercel's
      // edge layer as plain text, not from the API, so there's no `detail`
      // JSON to read here the way there is for a normal 4xx/5xx.
      message =
        "This package's photos are too large to save in one go (over the server's upload limit). Try removing an image or two, or use smaller/fewer photos, then save again.";
    } else {
      try {
        const data = await res.json();
        message = formatErrorDetail(data.detail) || message;
      } catch {}
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  listUsers: () => request<User[]>("/users"),
  createUser: (name: string, email: string, phone: string, password: string) =>
    request<User>("/users", {
      method: "POST",
      body: JSON.stringify({ name, email, phone: phone || null, password }),
    }),
  updateUser: (id: string, body: { name: string; email: string; phone: string; password?: string }) =>
    request<User>(`/users/${id}`, {
      method: "PUT",
      // Omit password entirely when blank — the backend only resets it when
      // the field is actually present in the request body.
      body: JSON.stringify({
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        ...(body.password ? { password: body.password } : {}),
      }),
    }),
  deleteUser: (id: string) =>
    request<void>(`/users/${id}`, { method: "DELETE" }),

  listPackages: () => request<Package[]>("/packages"),
  getPackage: (id: string) => request<Package>(`/packages/${id}`),
  createPackage: (body: PackageData) =>
    request<Package>("/packages", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePackage: (id: string, body: PackageData) =>
    request<Package>(`/packages/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  updatePackageNetProfit: (
    id: string,
    body: { adultNetProfit: string; childNetProfit: string; infantNetProfit: string }
  ) =>
    request<Package>(`/packages/${id}/net-profit`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deletePackage: (id: string) =>
    request<void>(`/packages/${id}`, { method: "DELETE" }),

  // Hits this Next.js app's own /api route (Node runtime, nodemailer) rather
  // than the Python backend, which 502'd in production (worked on localhost)
  // — outbound SMTP from serverless functions is unreliable on Vercel.
  sendBookingInvoiceEmail: async (bookingId: string, pdf: Blob, filename = "invoice.pdf") => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const form = new FormData();
    form.append("bookingId", bookingId);
    form.append("invoice", pdf, filename);
    const res = await fetch(`/api/send-invoice-email`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) {
      let message = "Failed to send invoice email";
      try {
        const data = await res.json();
        message = data.detail || message;
      } catch {}
      throw new Error(message);
    }
  },

  listBookings: () => request<Booking[]>("/bookings"),
  // Full record including ID documents, which listBookings() excludes for
  // list-view performance — used before opening the edit form so previously
  // uploaded Aadhar/PAN/Passport/other files are visible again.
  getBooking: (id: string) => request<Booking>(`/bookings/${id}`),
  // Computed server-side against ALL bookings (not just what this account
  // can see) so the sequence stays continuous and collision-free across
  // every user — see the backend route for why a client-side computation
  // isn't safe here.
  getNextInvoiceNumber: () =>
    request<{ invoiceNumber: string }>("/bookings/next-invoice-number"),
  createBooking: (body: BookingData) =>
    request<Booking>("/bookings", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateBooking: (id: string, body: BookingData) =>
    request<Booking>(`/bookings/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteBooking: (id: string) =>
    request<void>(`/bookings/${id}`, { method: "DELETE" }),
};
