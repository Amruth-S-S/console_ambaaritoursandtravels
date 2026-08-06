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
  // Admin-only — the backend blanks this to "" for non-admin viewers no
  // matter what's actually stored, and it's set only via
  // api.updatePackageNetProfit, never through create/updatePackage (which
  // send PackageData, a type that deliberately has no netProfit field).
  netProfit: string;
};

export type AdvancePayment = {
  amount: string;
  date: string;
  note: string;
};

export type BookingData = {
  userId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  location: string;
  packageType: "domestic" | "international";
  packageId: string | null;
  // Internal land-vendor cost for this booking — used for margin reporting
  // on the admin Overview page, deliberately never sent to buildInvoiceHtml.
  landPackage: string;
  travelDate: string;
  finalPaymentDate: string;
  adults: string;
  children: string;
  adultPrice: string;
  childPrice: string;
  flightAmount: string;
  // Per-person land cost (mirrors adultPrice/childPrice) — used with
  // adults/children on the admin dashboard's international net-revenue
  // figure: packageNetProfit - (adultLandPrice*adults + childLandPrice*children).
  adultLandPrice: string;
  childLandPrice: string;
  advancePayments: AdvancePayment[];
  invoiceNumber: string;
  invoiceDate: string;
  amount: string;
  transactionId: string;
};

export type Booking = BookingData & {
  id: string;
  createdAt: string;
  userName: string;
  packageTitle: string;
};

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
    try {
      const data = await res.json();
      message = data.detail || message;
    } catch {}
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
  updatePackageNetProfit: (id: string, netProfit: string) =>
    request<Package>(`/packages/${id}/net-profit`, {
      method: "PUT",
      body: JSON.stringify({ netProfit }),
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
