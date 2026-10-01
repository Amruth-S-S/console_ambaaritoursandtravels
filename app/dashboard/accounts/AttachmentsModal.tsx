"use client";

import { useRef, useState } from "react";
import type { AccountAttachmentMeta } from "@/lib/api";
import Modal from "@/components/Modal";
import styles from "./accounts.module.css";
import {
  AttachableEntry,
  AttachmentApi,
  dataUrlToBlob,
  formatSize,
  isPreviewable,
  kindLabel,
  triggerDownload,
} from "./attachmentUtils";

// Same limits the backend enforces (app/attachments.py) — checked here too
// so an oversized file fails instantly instead of after a long upload.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPT = "application/pdf,.pdf,.doc,.docx,image/*";
const DOC_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// Some browsers report .doc/.docx with an empty type — fall back to the
// extension and rewrite the data URL's mime so the backend accepts it.
function fixMime(file: File, dataUrl: string): { type: string; data: string } {
  let type = file.type;
  if (!type) {
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext === "doc") type = "application/msword";
    else if (ext === "docx")
      type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    else if (ext === "pdf") type = "application/pdf";
  }
  const data = dataUrl.replace(/^data:[^;,]*/, `data:${type}`);
  return { type, data };
}

// Upload / view / download / delete files on one ledger entry. Works for any
// ledger — the page passes its own endpoints (fileApi) and title.
export default function AttachmentsModal<E extends AttachableEntry>({
  entry,
  title,
  fileApi,
  onClose,
  onUpdated,
  canDelete,
}: {
  entry: E | null;
  title: string;
  fileApi: AttachmentApi<E>;
  onClose: () => void;
  onUpdated: (entry: E) => void;
  canDelete: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function onFiles(files: FileList | null) {
    if (!entry || !files || files.length === 0) return;
    setErr("");
    let current = entry;
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        failures.push(`${file.name} is larger than 5 MB`);
        continue;
      }
      setUploading(file.name);
      try {
        const { type, data } = fixMime(file, await readAsDataUrl(file));
        if (!type.startsWith("image/") && !DOC_TYPES.has(type)) {
          failures.push(`${file.name}: only PDF, Word and image files are allowed`);
          continue;
        }
        current = await fileApi.upload(current.id, { name: file.name, type, data });
        onUpdated(current);
      } catch (e) {
        failures.push(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    setUploading("");
    if (failures.length) setErr(failures.join("\n"));
    if (inputRef.current) inputRef.current.value = "";
  }

  async function open(att: AccountAttachmentMeta, download: boolean) {
    if (!entry) return;
    setBusyId(att.id);
    setErr("");
    try {
      const full = await fileApi.get(entry.id, att.id);
      const url = URL.createObjectURL(dataUrlToBlob(full.data));
      // Word files can't render in a browser tab, so they always download.
      if (download || !isPreviewable(att.type)) {
        triggerDownload(url, att.name);
      } else {
        window.open(url, "_blank");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to open file");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(att: AccountAttachmentMeta) {
    if (!entry || !window.confirm(`Delete "${att.name}"?`)) return;
    setBusyId(att.id);
    setErr("");
    try {
      onUpdated(await fileApi.remove(entry.id, att.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete file");
    } finally {
      setBusyId(null);
    }
  }

  const attachments = entry?.attachments ?? [];

  return (
    <Modal open={!!entry} onClose={uploading ? () => {} : onClose} title={`Files — ${title}`} maxWidth={560}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      <button
        type="button"
        className={styles.dropZone}
        onClick={() => inputRef.current?.click()}
        disabled={!!uploading}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <strong>{uploading ? `Uploading ${uploading}…` : "Upload files"}</strong>
        <span>PDF, Word (.doc/.docx) or images · up to 5 MB each</span>
      </button>

      {err && <div className={`${styles.msg} ${styles.err}`} style={{ whiteSpace: "pre-line" }}>{err}</div>}

      {attachments.length === 0 ? (
        <div className={styles.fileEmpty}>No files uploaded for this entry yet.</div>
      ) : (
        <ul className={styles.fileList}>
          {attachments.map((att) => (
            <li key={att.id} className={styles.fileItem}>
              <span className={styles.fileKind}>{kindLabel(att.type)}</span>
              <div className={styles.fileInfo}>
                <span className={styles.fileName} title={att.name}>{att.name}</span>
                <span className={styles.fileMeta}>
                  {formatSize(att.size)}
                  {att.uploadedAt && ` · ${new Date(att.uploadedAt).toLocaleDateString("en-GB")}`}
                </span>
              </div>
              <div className={styles.actions}>
                {isPreviewable(att.type) && (
                  <button
                    className={styles.iconBtn}
                    onClick={() => open(att, false)}
                    disabled={busyId === att.id}
                    title="View"
                    aria-label={`View ${att.name}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                )}
                <button
                  className={styles.iconBtn}
                  onClick={() => open(att, true)}
                  disabled={busyId === att.id}
                  title="Download"
                  aria-label={`Download ${att.name}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {canDelete && (
                  <button
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    onClick={() => remove(att)}
                    disabled={busyId === att.id}
                    title="Delete"
                    aria-label={`Delete ${att.name}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path
                        d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.modalActions}>
        <button className={styles.cancelBtn} onClick={onClose} disabled={!!uploading}>
          Close
        </button>
      </div>
    </Modal>
  );
}
