"use client";

import { useAuth } from "@/context/AuthContext";
import styles from "./Navbar.module.css";

export default function Navbar({ title }: { title: string }) {
  const { user, logout } = useAuth();
  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className={styles.bar}>
      <div className={styles.title}>{title}</div>
      <div className={styles.right}>
        <div className={styles.user}>
          <div className={styles.avatar}>{initials}</div>
          <div className={styles.meta}>
            <span className={styles.name}>{user.name}</span>
            <span className={styles.email}>{user.email}</span>
          </div>
        </div>
        <button className={styles.logout} onClick={logout}>
          Log out
        </button>
      </div>
    </header>
  );
}
