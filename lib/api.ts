// NEXT_PUBLIC_API_URL overrides this if it's ever set (e.g. in the Vercel
// dashboard), but that's no longer required — production builds (NODE_ENV
// set automatically by `next build`) default to the deployed backend, local
// dev defaults to localhost, with no env var configuration needed either way.
const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://console-backend-two.vercel.app"
    : "http://localhost:8000");

// Shared, app-wide (not per-package) currency exchange rates — one pair of
// values every user can view/update via the currency icon on any package
// card, for quick reference while quoting Thailand/Malaysia packages.
export type CurrencyRates = {
  thaiRate: string;
  malaysianRate: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "admin" | "user";
  // Admin-assigned custom roles from the Roles page — labels distinct from
  // `role` above (which stays the actual admin/user access-control value).
  // A person can hold several at once (e.g. both "Account" and "Currency");
  // empty array means unassigned.
  roleIds: string[];
  // Resolved server-side from roleIds at login/list time — e.g. ["Account"],
  // used to gate menus/pages without a separate roles fetch.
  roleNames: string[];
};

// Admin-managed role names — a separate list from the hardcoded
// admin/user access-control role above; this is just the name for now.
export type Role = {
  id: string;
  name: string;
  createdAt: string;
};

// Accounts ledger — visible on the Account menu (admin + users whose
// assigned custom role is named "Account"). Approval can only be flipped
// by an admin; everyone else who can see the ledger sees it read-only.
export type AccountEntryInput = {
  slNo: string;
  date: string;
  invoiceNo: string;
  agent: string;
  clientName: string;
  destination: string;
  handOverTo: string;
  debitCredit: string;
  balance: string;
  paymentMode: string;
  description: string;
};

export type AccountEntry = AccountEntryInput & {
  id: string;
  createdAt: string;
  createdBy: string;
  approved: boolean;
};

// Currency exchange ledger — visible on the Currency menu (admin + users
// whose assigned custom role is named "Currency"). Same approval pattern
// as AccountEntry above — admin flips it, everyone else sees it read-only.
// Distinct from CurrencyRates above (one global Thai/Malaysian rate pair) —
// this is a per-client exchange record.
export type CurrencyEntryInput = {
  slNo: string;
  travelDate: string;
  passportNumber: string;
  clientName: string;
  phoneNumber: string;
  currency: string;
  amount: string;
  clientAmount: string;
  currencyConversion: string;
  handOverTo: string;
};

export type CurrencyEntry = CurrencyEntryInput & {
  id: string;
  createdAt: string;
  createdBy: string;
  approved: boolean;
};

// Per-user, per-role granular CRUD permissions — a finer dial than just
// having the Account/Currency role at all. Only roles that gate a real
// list/create/edit/delete feature show up here (see GOVERNED_ROLES in
// routes/access.py); a role with no grant yet defaults to fully allowed.
export type AccessGrant = {
  roleName: string;
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
};

export type AccessInfo = {
  userId: string;
  userName: string;
  grants: AccessGrant[];
};

export type DayImage = {
  src: string;
  caption: string;
};

export type PackageDay = {
  title: string;
  desc: string;
  // Optional — blank means "don't show a date for this day" (the same
  // package is often reused both with and without dates per client).
  date: string;
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
  // ID document uploads — each accepts one or many files (e.g. front + back
  // of a card). Excluded from listBookings() (see the backend route) so
  // getBooking(id) must be used to see/edit them.
  aadharDoc?: BookingDocument[];
  panDoc?: BookingDocument[];
  passportDoc?: BookingDocument[];
  otherDocs?: BookingDocument[];
};

export type Booking = BookingData & {
  id: string;
  createdAt: string;
  userName: string;
  userEmail: string;
  packageTitle: string;
  createdBy: string;
};

// The handful of fields the Travel List page renders — see
// getTravelList()/routes/bookings.py's /travel-list, which is deliberately
// unfiltered by ownership (unlike Booking above) since that page is common
// to every logged-in account.
export type TravelListEntry = {
  id: string;
  travelDate: string;
  packageTitle: string;
  location: string;
  clientName: string;
  adults: string;
  children: string;
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
  createUser: (name: string, email: string, phone: string, password: string, roleIds: string[]) =>
    request<User>("/users", {
      method: "POST",
      body: JSON.stringify({ name, email, phone: phone || null, password, roleIds }),
    }),
  updateUser: (
    id: string,
    body: { name: string; email: string; phone: string; password?: string; roleIds: string[] }
  ) =>
    request<User>(`/users/${id}`, {
      method: "PUT",
      // Omit password entirely when blank — the backend only resets it when
      // the field is actually present in the request body. roleIds is
      // always sent (even []) so it can be cleared, unlike password.
      body: JSON.stringify({
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        roleIds: body.roleIds,
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
  // Name + phone only, across EVERY booking company-wide — unlike
  // listBookings() above (filtered to what this account created/is
  // assigned to for non-admins), this is what the Account and Currency
  // ledgers' client dropdowns use, since staff who only do ledger entry
  // work typically have no bookings of their own to filter down to.
  getClientDirectory: () => request<{ clientName: string; clientPhone: string }[]>("/bookings/clients"),
  // Also unfiltered by ownership, same reasoning — the Travel List page is
  // common to every logged-in account, not scoped to what this login
  // created/is assigned to like listBookings() above.
  getTravelList: () => request<TravelListEntry[]>("/bookings/travel-list"),
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

  getCurrencyRates: () => request<CurrencyRates>("/settings/currency-rates"),
  updateCurrencyRates: (body: { thaiRate: string; malaysianRate: string }) =>
    request<CurrencyRates>("/settings/currency-rates", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  listRoles: () => request<Role[]>("/roles"),
  createRole: (name: string) =>
    request<Role>("/roles", { method: "POST", body: JSON.stringify({ name }) }),
  updateRole: (id: string, name: string) =>
    request<Role>(`/roles/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteRole: (id: string) => request<void>(`/roles/${id}`, { method: "DELETE" }),

  listAccounts: () => request<AccountEntry[]>("/accounts"),
  // Computed server-side against the whole collection, same reasoning as
  // getNextInvoiceNumber — stays one continuous sequence regardless of
  // which account/admin is logged in.
  getNextSlNo: () => request<{ slNo: string }>("/accounts/next-sl-no"),
  createAccount: (body: AccountEntryInput) =>
    request<AccountEntry>("/accounts", { method: "POST", body: JSON.stringify(body) }),
  setAccountApproval: (id: string, approved: boolean) =>
    request<AccountEntry>(`/accounts/${id}/approval`, {
      method: "PUT",
      body: JSON.stringify({ approved }),
    }),
  updateAccount: (id: string, body: AccountEntryInput) =>
    request<AccountEntry>(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAccount: (id: string) => request<void>(`/accounts/${id}`, { method: "DELETE" }),

  listCurrencyEntries: () => request<CurrencyEntry[]>("/currency-entries"),
  getNextCurrencySlNo: () => request<{ slNo: string }>("/currency-entries/next-sl-no"),
  createCurrencyEntry: (body: CurrencyEntryInput) =>
    request<CurrencyEntry>("/currency-entries", { method: "POST", body: JSON.stringify(body) }),
  setCurrencyApproval: (id: string, approved: boolean) =>
    request<CurrencyEntry>(`/currency-entries/${id}/approval`, {
      method: "PUT",
      body: JSON.stringify({ approved }),
    }),
  updateCurrencyEntry: (id: string, body: CurrencyEntryInput) =>
    request<CurrencyEntry>(`/currency-entries/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteCurrencyEntry: (id: string) =>
    request<void>(`/currency-entries/${id}`, { method: "DELETE" }),

  // Self-service — any logged-in account can read its own grants, used to
  // hide buttons for actions that would just 403 anyway.
  getMyAccess: () => request<AccessInfo>("/access/me"),
  getAccess: (userId: string) => request<AccessInfo>(`/access/${userId}`),
  setAccess: (userId: string, grants: AccessGrant[]) =>
    request<AccessInfo>(`/access/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ grants }),
    }),
};
