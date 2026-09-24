"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, Role } from "@/lib/api";
import Navbar from "@/components/Navbar";
import Modal from "@/components/Modal";
import Toast, { ToastState } from "@/components/Toast";
import dash from "../dashboard.module.css";
// Reusing the Users page's table/modal styling rather than duplicating it —
// this page is the same shape (search, create button, table, edit/delete,
// single-field modal), just for a different, simpler entity.
import styles from "../users/users.module.css";

const SearchIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" strokeLinecap="round" />
  </svg>
);

const EditIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path
      d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DeleteIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path
      d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function RolesPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  // Guard: non-admins cannot see this page, same as Users.
  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/dashboard");
  }, [user, router]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function notify(type: "ok" | "err", text: string) {
    window.clearTimeout(toastTimer.current);
    setToast({ type, text });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  async function load() {
    try {
      setRoles(await api.listRoles());
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load roles");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => r.name.toLowerCase().includes(q));
  }, [roles, search]);

  function openCreate() {
    setMode("create");
    setEditingId(null);
    setName("");
    setFormErr("");
    setModalOpen(true);
  }

  function openEdit(r: Role) {
    setMode("edit");
    setEditingId(r.id);
    setName(r.name);
    setFormErr("");
    setModalOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
  }

  async function onSubmit() {
    setFormErr("");
    setBusy(true);
    try {
      if (mode === "create") {
        const created = await api.createRole(name.trim());
        notify("ok", `Created "${created.name}"`);
      } else if (editingId) {
        const updated = await api.updateRole(editingId, name.trim());
        notify("ok", `Updated "${updated.name}"`);
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function onDelete(id: string, roleName: string) {
    window.clearTimeout(toastTimer.current);
    setToast({
      type: "confirm",
      text: `Delete "${roleName}"? This cannot be undone.`,
      onCancel: () => setToast(null),
      onConfirm: async () => {
        setToast(null);
        try {
          await api.deleteRole(id);
          notify("ok", `Deleted "${roleName}"`);
          load();
        } catch (e) {
          notify("err", e instanceof Error ? e.message : "Failed to delete");
        }
      },
    });
  }

  if (user?.role !== "admin") return null;

  const canSubmit = name.trim().length > 0 && !busy;

  return (
    <>
      <Navbar title="Roles" />
      <Toast toast={toast} />
      <div className={dash.content}>
        <section className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div className={styles.tableHeadLeft}>
              <h3>All roles</h3>
              <span className={styles.count}>{roles.length} total</span>
            </div>
            <div className={styles.tableHeadRight}>
              <div className={styles.search}>
                <span className={styles.searchIcon}>{SearchIcon}</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by role name…"
                />
              </div>
              <button className={styles.createBtn} onClick={openCreate}>
                + Create role
              </button>
            </div>
          </div>

          {!loaded ? (
            <div className={styles.empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              {search ? "No roles match your search." : "No roles yet."}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className={styles.uName}>
                        <span className={styles.uAvatar}>{r.name.slice(0, 2).toUpperCase()}</span>
                        {r.name}
                      </div>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          className={styles.iconBtn}
                          onClick={() => openEdit(r)}
                          aria-label={`Edit ${r.name}`}
                          title="Edit"
                        >
                          {EditIcon}
                        </button>
                        <button
                          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          onClick={() => onDelete(r.id, r.name)}
                          aria-label={`Delete ${r.name}`}
                          title="Delete"
                        >
                          {DeleteIcon}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={mode === "create" ? "Create role" : "Edit role"}>
        <div className={styles.field}>
          <label htmlFor="m-role-name">Role name</label>
          <input
            id="m-role-name"
            value={name}
            placeholder="e.g. Manager"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {formErr && <div className={`${styles.msg} ${styles.err}`}>{formErr}</div>}

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={closeModal} disabled={busy}>
            Cancel
          </button>
          <button className={styles.submit} onClick={onSubmit} disabled={!canSubmit}>
            {busy
              ? mode === "create"
                ? "Creating…"
                : "Saving…"
              : mode === "create"
              ? "Create role"
              : "Save changes"}
          </button>
        </div>
      </Modal>
    </>
  );
}
