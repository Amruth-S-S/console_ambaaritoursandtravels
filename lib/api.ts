const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "admin" | "user";
};

export type PackageDay = {
  title: string;
  desc: string;
  images: string[];
};

export type PackageData = {
  companyName: string;
  logo: string | null;
  poster: string | null;
  packageTitle: string;
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
  location: string;
  packageId: string | null;
  travelDate: string;
  adults: string;
  children: string;
  adultPrice: string;
  childPrice: string;
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
  updateUser: (id: string, body: { name: string; email: string; phone: string }) =>
    request<User>(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...body, phone: body.phone || null }),
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
  deletePackage: (id: string) =>
    request<void>(`/packages/${id}`, { method: "DELETE" }),

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
