"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, AccessGrant, User } from "@/lib/api";
import Navbar from "@/components/Navbar";
import Toast, { ToastState } from "@/components/Toast";
import dash from "../dashboard.module.css";
import styles from "./access.module.css";

const PERMS: { key: keyof Omit<AccessGrant, "roleName">; label: string }[] = [
  { key: "view", label: "View" },
  { key: "create", label: "Create" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" },
];

export default function AccessPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [grants, setGrants] = useState<AccessGrant[] | null>(null);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/dashboard");
  }, [user, router]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function notify(type: "ok" | "err", text: string) {
    window.clearTimeout(toastTimer.current);
    setToast({ type, text });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  useEffect(() => {
    if (user?.role !== "admin") return;
    api
      .listUsers()
      .then((list) => setUsers(list.filter((u) => u.role !== "admin")))
      .catch((e) => notify("err", e instanceof Error ? e.message : "Failed to load users"))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Selecting a person automatically pulls in whatever custom roles are
  // already assigned to them (Account/Currency) and shows a permission
  // card per role — nothing to configure manually before that.
  useEffect(() => {
    if (!selectedId) {
      setGrants(null);
      return;
    }
    setGrantsLoading(true);
    api
      .getAccess(selectedId)
      .then((info) => setGrants(info.grants))
      .catch((e) => notify("err", e instanceof Error ? e.message : "Failed to load access"))
      .finally(() => setGrantsLoading(false));
  }, [selectedId]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedId) || null,
    [users, selectedId]
  );

  function togglePerm(roleName: string, key: keyof Omit<AccessGrant, "roleName">) {
    setGrants((list) =>
      (list || []).map((g) => (g.roleName === roleName ? { ...g, [key]: !g[key] } : g))
    );
  }

  async function onSave() {
    if (!selectedId || !grants) return;
    setBusy(true);
    try {
      const updated = await api.setAccess(selectedId, grants);
      setGrants(updated.grants);
      notify("ok", "Access updated");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to save access");
    } finally {
      setBusy(false);
    }
  }

  if (user?.role !== "admin") return null;

  return (
    <>
      <Navbar title="Access" />
      <Toast toast={toast} />
      <div className={dash.content}>
        <section className={styles.wrap}>
          <div className={styles.head}>
            <h3>Access control</h3>
            <p className={styles.hint}>
              Pick a person to see the custom roles already assigned to them (Account, Currency),
              then choose exactly which actions each role can perform.
            </p>
          </div>

          <div className={styles.body}>
            <div className={styles.field}>
              <label htmlFor="a-user">Select user</label>
              <select
                id="a-user"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                disabled={!loaded}
              >
                <option value="">{loaded ? "Choose a person…" : "Loading…"}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            {!selectedId ? null : grantsLoading ? (
              <div className={styles.empty}>Loading access…</div>
            ) : !grants || grants.length === 0 ? (
              <div className={styles.empty}>
                {selectedUser?.name || "This person"} has no Account or Currency role assigned yet.
                Assign one on the Users page first.
              </div>
            ) : (
              <>
                {grants.map((g) => (
                  <div key={g.roleName} className={styles.roleCard}>
                    <div className={styles.roleCardTitle}>{g.roleName}</div>
                    <div className={styles.permRow}>
                      {PERMS.map((p) => (
                        <label key={p.key} className={styles.permOption}>
                          <input
                            type="checkbox"
                            checked={g[p.key]}
                            onChange={() => togglePerm(g.roleName, p.key)}
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <div className={styles.actions}>
                  <button className={styles.submit} onClick={onSave} disabled={busy}>
                    {busy ? "Saving…" : "Save access"}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
