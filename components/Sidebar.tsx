"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { AMBAARI_LOGO_BASE64 } from "@/lib/ambaariLogo";
import styles from "./Sidebar.module.css";

type Item = {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
};

const HomeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const UsersIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 20a5.5 5.5 0 0 0-2-4.3" strokeLinecap="round" />
  </svg>
);

const PackagesIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path
      d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M3 7.5V16.5L12 21l9-4.5V7.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 12v9" strokeLinecap="round" />
  </svg>
);

const BookingsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="18" height="15" rx="2.5" />
    <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 14.5h3M8 17.5h5" strokeLinecap="round" />
  </svg>
);

const ChevronIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const items: Item[] = [
  { label: "Overview", href: "/dashboard", icon: HomeIcon },
  { label: "Packages", href: "/dashboard/packages", icon: PackagesIcon },
  { label: "Bookings", href: "/dashboard/bookings", icon: BookingsIcon },
  { label: "Users", href: "/dashboard/users", icon: UsersIcon, adminOnly: true },
];

export default function Sidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const isAdmin = user?.role === "admin";
  const [collapsed, setCollapsed] = useState(false);

  // Read the saved preference after mount only — keeps server and first
  // client render identical (always expanded) so hydration never mismatches.
  useEffect(() => {
    if (localStorage.getItem("sidebarCollapsed") === "1") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
      return next;
    });
  }

  const visible = items.filter((i) => !i.adminOnly || isAdmin);

  return (
    <nav className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
      <div className={styles.markRow}>
        {!collapsed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={AMBAARI_LOGO_BASE64}
            alt="Ambaari Tours and Travels"
            className={styles.logo}
          />
        )}
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className={collapsed ? styles.chevronFlipped : undefined}>{ChevronIcon}</span>
        </button>
      </div>

      <div className={styles.group}>Menu</div>
      {visible.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.item} ${active ? styles.active : ""}`}
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}

      <div className={styles.spacer} />

      <div className={styles.badge}>
        Signed in as
        <strong>{user?.role}</strong>
      </div>
    </nav>
  );
}
