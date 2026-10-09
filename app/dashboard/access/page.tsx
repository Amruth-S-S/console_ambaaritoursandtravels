"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, AccessGrant, User } from "@/lib/api";
import Navbar from "@/components/Navbar";
import Toast, { ToastState } from "@/components/Toast";
import { ADMIN_ONLY_MENUS, EVERYONE_MENUS, GRANTABLE_MENUS } from "@/lib/menus";
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
  // Menu access for the selected person — the saved list and the edits.
  const [savedMenus, setSavedMenus] = useState<string[]>([]);
  const [menus, setMenus] = useState<string[]>([]);
  const [menusLoading, setMenusLoading] = useState(false);
  const [menusBusy, setMenusBusy] = useState(false);

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

  // Selecting a person automatically pulls in every custom role already
  // assigned to them and shows a permission card per role — nothing to
  // configure manually before that.
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
    setMenusLoading(true);
    api
      .getMenuAccess(selectedId)
      .then((r) => {
        setSavedMenus(r.menus);
        setMenus(r.menus);
      })
      .catch((e) => notify("err", e instanceof Error ? e.message : "Failed to load menu access"))
      .finally(() => setMenusLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Menus the person already reaches through an assigned role — shown as
  // ticked and locked here (remove the role on the Users page instead).
  const viaRole = useMemo(() => {
    const names = (users.find((u) => u.id === selectedId)?.roleNames || []).map((n) => n.trim().toLowerCase());
    return new Set(GRANTABLE_MENUS.filter((m) => names.includes(m.roleName)).map((m) => m.key));
  }, [users, selectedId]);

  const menusDirty = menus.length !== savedMenus.length || menus.some((m) => !savedMenus.includes(m));

  // Back to the empty "Select user" state. Unsaved menu ticks are lost, so ask first.
  function closePanel() {
    if (menusDirty && !window.confirm("You have unsaved menu changes. Close without saving?")) return;
    setSelectedId("");
    setSavedMenus([]);
    setMenus([]);
  }

  function toggleMenu(key: string) {
    setMenus((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  }

  async function onSaveMenus() {
    if (!selectedId) return;
    setMenusBusy(true);
    try {
      const r = await api.setMenuAccess(selectedId, menus);
      setSavedMenus(r.menus);
      setMenus(r.menus);
      // Newly granted menus get their own View/Create/Edit/Delete card below.
      setGrants((await api.getAccess(selectedId)).grants);
      notify("ok", "Menu access updated — it applies the next time they open or refresh a page");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to save menu access");
    } finally {
      setMenusBusy(false);
    }
  }

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
              Pick a person, choose which menus they can open, then choose exactly which actions
              they can perform in each one.
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

            {selectedId && (
              <div className={styles.menuSection}>
                <div className={styles.panelHead}>
                  <div className={styles.sectionTitle}>Menu access</div>
                  <button type="button" className={styles.closeBtn} onClick={closePanel} aria-label="Close this person's access">
                    <span aria-hidden>×</span> Close
                  </button>
                </div>
                <p className={styles.hint}>
                  Tick the menus {selectedUser?.name || "this person"} can open. A ticked menu works like
                  holding the role of the same name, and gets its own View / Create / Edit / Delete card
                  below.
                </p>
                {menusLoading ? (
                  <div className={styles.empty}>Loading menus…</div>
                ) : (
                  <>
                    <div className={styles.menuGrid}>
                      {EVERYONE_MENUS.map((label) => (
                        <label key={label} className={`${styles.menuItem} ${styles.menuItemLocked}`} title="Every user has this menu">
                          <input type="checkbox" checked disabled />
                          <span>{label}</span>
                          <em>Everyone</em>
                        </label>
                      ))}
                      {GRANTABLE_MENUS.map((m) => {
                        const locked = viaRole.has(m.key);
                        return (
                          <label
                            key={m.key}
                            className={`${styles.menuItem} ${locked ? styles.menuItemLocked : ""} ${
                              menus.includes(m.key) || locked ? styles.menuItemOn : ""
                            }`}
                            title={locked ? "Already given through an assigned role (Users page)" : undefined}
                          >
                            <input
                              type="checkbox"
                              checked={locked || menus.includes(m.key)}
                              disabled={locked}
                              onChange={() => toggleMenu(m.key)}
                            />
                            <span>{m.label}</span>
                            {locked && <em>Via role</em>}
                          </label>
                        );
                      })}
                      {ADMIN_ONLY_MENUS.map((label) => (
                        <label key={label} className={`${styles.menuItem} ${styles.menuItemLocked}`} title="Only admins can manage this">
                          <input type="checkbox" checked={false} disabled />
                          <span>{label}</span>
                          <em>Admin only</em>
                        </label>
                      ))}
                    </div>
                    <div className={styles.actions}>
                      <button className={styles.submit} onClick={onSaveMenus} disabled={menusBusy || !menusDirty}>
                        {menusBusy ? "Saving…" : "Save menu access"}
                      </button>
                    </div>
                  </>
                )}
                <div className={styles.sectionTitle}>Permissions</div>
              </div>
            )}

            {!selectedId ? null : grantsLoading ? (
              <div className={styles.empty}>Loading access…</div>
            ) : !grants || grants.length === 0 ? (
              <div className={styles.empty}>
                {selectedUser?.name || "This person"} has no menus or roles that need permissions yet —
                tick a menu above, or assign a role on the Users page.
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
