import type { User } from "@/lib/api";

// Menus an admin can grant per user on the Access page. Mirrors the
// backend's app/menus.py — a granted menu works like holding the role of
// the same name (roleName), so the per-role View/Create/Edit/Delete
// switches on the Access page apply to it too.
export type GrantableMenu = { key: string; label: string; roleName: string; href: string };

export const GRANTABLE_MENUS: GrantableMenu[] = [
  { key: "upcoming-packages", label: "Upcoming Packages", roleName: "upcoming packages", href: "/dashboard/upcoming-packages" },
  { key: "offers", label: "Offer Section", roleName: "offer section", href: "/dashboard/offers" },
  { key: "rooms", label: "Room List", roleName: "room list", href: "/dashboard/rooms" },
  { key: "accounts", label: "Account", roleName: "account", href: "/dashboard/accounts" },
  { key: "currency", label: "Currency", roleName: "currency", href: "/dashboard/currency" },
  { key: "dmc-accounts", label: "DMC Account", roleName: "dmc account", href: "/dashboard/dmc-accounts" },
  { key: "hotel-vouchers", label: "Hotel Voucher", roleName: "hotel voucher", href: "/dashboard/hotel-vouchers" },
];

// Shown on the Access page for completeness — not grantable.
export const EVERYONE_MENUS = ["Overview", "Packages", "Bookings", "Travel List"];
export const ADMIN_ONLY_MENUS = ["Users", "Roles", "Access"];

// Can this user open the menu? Admin always; otherwise the menu was granted
// on the Access page, or the user holds the role of the same name.
export function canUseMenu(user: User | null | undefined, key: string): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const menu = GRANTABLE_MENUS.find((m) => m.key === key);
  if (!menu) return false;
  if ((user.menuAccess || []).includes(key)) return true;
  return (user.roleNames || []).some((rn) => rn.trim().toLowerCase() === menu.roleName);
}
