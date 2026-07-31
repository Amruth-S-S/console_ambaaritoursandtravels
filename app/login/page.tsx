"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { AMBAARI_LOGO_BASE64 } from "@/lib/ambaariLogo";
import styles from "./login.module.css";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <aside className={styles.brand}>
        <span className={styles.glow} />
        <div className={styles.mark}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={AMBAARI_LOGO_BASE64} alt="Ambaari Tours and Travels" className={styles.logo} />
        </div>
        <div className={styles.pitch}>
          <h1>
            One place to manage your <em>tours</em> and bookings.
          </h1>
          <p>
            Sign in to reach your workspace. Admins manage packages and
            bookings; your team gets a clean, focused dashboard.
          </p>
        </div>
        <div className={styles.foot}>Secure access · Role-based</div>
      </aside>

      <main className={styles.panel}>
        <div className={styles.card}>
          <h2>Sign in</h2>
          <p className={styles.sub}>Enter your credentials to continue.</p>

          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              placeholder="you@company.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <div className={styles.passwordWrap}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                <i className={`fas ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
              </button>
            </div>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button className={styles.submit} onClick={onSubmit} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </main>
    </div>
  );
}
