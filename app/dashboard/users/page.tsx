"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, User } from "@/lib/api";
import Navbar from "@/components/Navbar";
import Modal from "@/components/Modal";
import Toast, { ToastState } from "@/components/Toast";
import dash from "../dashboard.module.css";
import styles from "./users.module.css";

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

type FormState = { name: string; email: string; phone: string; password: string };
const emptyForm: FormState = { name: "", email: "", phone: "", password: "" };

export default function UsersPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  // Guard: users cannot see this admin page
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
      setUsers(await api.listUsers());
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone || "").toLowerCase().includes(q)
    );
  }, [users, search]);

  function openCreate() {
    setMode("create");
    setEditingId(null);
    setForm(emptyForm);
    setFormErr("");
    setModalOpen(true);
  }

  function openEdit(u: User) {
    setMode("edit");
    setEditingId(u.id);
    setForm({ name: u.name, email: u.email, phone: u.phone || "", password: "" });
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
        const created = await api.createUser(
          form.name.trim(),
          form.email.trim(),
          form.phone.trim(),
          form.password
        );
        notify("ok", `Created ${created.name}`);
      } else if (editingId) {
        const updated = await api.updateUser(editingId, {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
        });
        notify("ok", `Updated ${updated.name}`);
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function onDelete(id: string, uname: string) {
    window.clearTimeout(toastTimer.current);
    setToast({
      type: "confirm",
      text: `Delete ${uname}? This cannot be undone.`,
      onCancel: () => setToast(null),
      onConfirm: async () => {
        setToast(null);
        try {
          await api.deleteUser(id);
          notify("ok", `Deleted ${uname}`);
          load();
        } catch (e) {
          notify("err", e instanceof Error ? e.message : "Failed to delete");
        }
      },
    });
  }

  if (user?.role !== "admin") return null;

  const canSubmit =
    form.name.trim() &&
    form.email.trim() &&
    (mode === "edit" || form.password.length >= 6) &&
    !busy;

  return (
    <>
      <Navbar title="Users" />
      <Toast toast={toast} />
      <div className={dash.content}>
        <section className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div className={styles.tableHeadLeft}>
              <h3>All accounts</h3>
              <span className={styles.count}>{users.length} total</span>
            </div>
            <div className={styles.tableHeadRight}>
              <div className={styles.search}>
                <span className={styles.searchIcon}>{SearchIcon}</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, email or phone…"
                />
              </div>
              <button className={styles.createBtn} onClick={openCreate}>
                + Create user
              </button>
            </div>
          </div>

          {!loaded ? (
            <div className={styles.empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              {search ? "No accounts match your search." : "No accounts yet."}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className={styles.uName}>
                        <span className={styles.uAvatar}>
                          {u.name.slice(0, 2).toUpperCase()}
                        </span>
                        {u.name}
                      </div>
                    </td>
                    <td style={{ color: "var(--ink-dim)" }}>{u.email}</td>
                    <td style={{ color: "var(--ink-dim)" }}>{u.phone || "—"}</td>
                    <td>
                      <span
                        className={`${styles.role} ${
                          u.role === "admin" ? styles.roleAdmin : styles.roleUser
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          className={styles.iconBtn}
                          onClick={() => openEdit(u)}
                          aria-label={`Edit ${u.name}`}
                          title="Edit"
                        >
                          {EditIcon}
                        </button>
                        {u.role === "user" && (
                          <button
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                            onClick={() => onDelete(u.id, u.name)}
                            aria-label={`Delete ${u.name}`}
                            title="Delete"
                          >
                            {DeleteIcon}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={mode === "create" ? "Create user" : "Edit user"}
      >
        <p className={styles.modalHint}>
          {mode === "create"
            ? "New accounts are created with the user role."
            : "Update this account's details."}
        </p>

        <div className={styles.field}>
          <label htmlFor="m-name">Full name</label>
          <input
            id="m-name"
            value={form.name}
            placeholder="Jane Doe"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="m-email">Email</label>
          <input
            id="m-email"
            type="email"
            value={form.email}
            placeholder="jane@company.com"
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="m-phone">Phone number</label>
          <input
            id="m-phone"
            type="tel"
            value={form.phone}
            placeholder="+1 555 123 4567"
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        {mode === "create" && (
          <div className={styles.field}>
            <label htmlFor="m-password">Temporary password</label>
            <input
              id="m-password"
              type="password"
              value={form.password}
              placeholder="Min. 6 characters"
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
        )}

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
              ? "Create user"
              : "Save changes"}
          </button>
        </div>
      </Modal>
    </>
  );
}
