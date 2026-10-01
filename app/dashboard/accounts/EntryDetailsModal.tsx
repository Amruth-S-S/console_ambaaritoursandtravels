"use client";

import { useEffect, useState } from "react";
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

export type DetailAmount = { label: string; value: string; tone?: "debit" | "credit" };

export function dateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Loaded = { url: string } | { error: string };

// Full details of one ledger entry plus inline previews of its uploaded
// files. Ledger-agnostic: each page passes the amounts and fields to show
// and its own file endpoint (fileApi.get).
export default function EntryDetailsModal<E extends AttachableEntry>({
  entry,
  amounts,
  approved,
  details,
  wide,
  fileApi,
  onClose,
  onManageFiles,
}: {
  entry: E | null;
  amounts: DetailAmount[];
  approved: boolean;
  details: [string, string][];
  wide: [string, string][];
  fileApi: Pick<AttachmentApi<E>, "get">;
  onClose: () => void;
  onManageFiles: (entry: E) => void;
}) {
  // Blob URL per attachment id, fetched when the modal opens so previews
  // render inline — the list endpoint only carries metadata.
  const [files, setFiles] = useState<Record<string, Loaded>>({});
  const attKey = entry ? `${entry.id}:${entry.attachments.map((a) => a.id).join(",")}` : "";

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    const urls: string[] = [];
    setFiles({});
    for (const att of entry.attachments) {
      fileApi
        .get(entry.id, att.id)
        .then((full) => {
          const url = URL.createObjectURL(dataUrlToBlob(full.data));
          urls.push(url);
          if (!cancelled) setFiles((f) => ({ ...f, [att.id]: { url } }));
        })
        .catch((e) => {
          if (!cancelled)
            setFiles((f) => ({ ...f, [att.id]: { error: e instanceof Error ? e.message : "Failed to load" } }));
        });
    }
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attKey]);

  if (!entry) return null;

  function preview(att: AccountAttachmentMeta) {
    const f = files[att.id];
    if (!f) return <div className={styles.viewPreviewMsg}>Loading preview…</div>;
    if ("error" in f) return <div className={styles.viewPreviewMsg}>{f.error}</div>;
    if (att.type.startsWith("image/")) return <img src={f.url} alt={att.name} className={styles.viewPreviewImg} />;
    if (att.type === "application/pdf")
      return <iframe src={f.url} title={att.name} className={styles.viewPreviewPdf} />;
    return (
      <div className={styles.viewPreviewMsg}>
        <span className={styles.fileKind}>{kindLabel(att.type)}</span>
        Word documents can’t be previewed — download to open.
      </div>
    );
  }

  return (
    <Modal open onClose={onClose} title={`Entry details — Sl No ${entry.slNo || "—"}`} maxWidth={860}>
      <div className={styles.viewAmounts}>
        {amounts.map((a) => (
          <div key={a.label}>
            <span>{a.label}</span>
            <strong className={a.tone === "debit" ? styles.viewDebit : a.tone === "credit" ? styles.viewCredit : undefined}>
              {a.value}
            </strong>
          </div>
        ))}
        <div>
          <span>Approval</span>
          <strong>
            <span className={`${styles.approveBadge} ${approved ? styles.approveBadgeOn : styles.approveBadgeOff}`}>
              {approved ? "Approved" : "Pending"}
            </span>
          </strong>
        </div>
      </div>

      <dl className={styles.viewGrid}>
        {details.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v || "—"}</dd>
          </div>
        ))}
        {wide.map(([k, v]) => (
          <div key={k} className={styles.viewWide}>
            <dt>{k}</dt>
            <dd>{v || "—"}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.viewFilesHead}>
        <h4>
          Uploaded files <span className={styles.count}>{entry.attachments.length}</span>
        </h4>
        <button className={styles.cancelBtn} onClick={() => onManageFiles(entry)}>
          Upload / manage files
        </button>
      </div>

      {entry.attachments.length === 0 ? (
        <div className={styles.fileEmpty}>No files uploaded for this entry yet.</div>
      ) : (
        <div className={styles.viewFiles}>
          {entry.attachments.map((att) => {
            const f = files[att.id];
            const url = f && "url" in f ? f.url : null;
            return (
              <div key={att.id} className={styles.viewFile}>
                <div className={styles.viewPreview}>{preview(att)}</div>
                <div className={styles.viewFileInfo}>
                  <div className={styles.fileName} title={att.name}>
                    {att.name}
                  </div>
                  <dl className={styles.viewFileMeta}>
                    <div>
                      <dt>Type</dt>
                      <dd>
                        {kindLabel(att.type)} · {att.type || "unknown"}
                      </dd>
                    </div>
                    <div>
                      <dt>Size</dt>
                      <dd>{formatSize(att.size)}</dd>
                    </div>
                    <div>
                      <dt>Uploaded</dt>
                      <dd>{dateTime(att.uploadedAt)}</dd>
                    </div>
                    <div>
                      <dt>Uploaded by</dt>
                      <dd>{att.uploadedByName || "—"}</dd>
                    </div>
                  </dl>
                  <div className={styles.viewFileActions}>
                    {isPreviewable(att.type) && (
                      <button className={styles.cancelBtn} disabled={!url} onClick={() => url && window.open(url, "_blank")}>
                        Open full size
                      </button>
                    )}
                    <button className={styles.submit} disabled={!url} onClick={() => url && triggerDownload(url, att.name)}>
                      Download
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.modalActions}>
        <button className={styles.cancelBtn} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
