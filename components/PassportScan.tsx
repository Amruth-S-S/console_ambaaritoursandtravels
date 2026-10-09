"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mergePassports, PassportDetails } from "@/lib/passport";
import { readPassport } from "@/lib/passportOcr";
import styles from "./PassportScan.module.css";

// "Upload passport" button — reads one or more files (photo page, or a PDF)
// right here in the browser (lib/passportOcr.ts) and hands back the merged
// fields. The uploaded pages stay visible underneath as thumbnails (click to
// enlarge) so the filled fields can be re-checked against the passport.
// Nothing is uploaded or stored — the preview lasts while the form is open.
const DEFAULT_FIELDS: (keyof PassportDetails)[] = ["givenName", "surname", "sex", "dob", "passportNo"];

export default function PassportScan({
  onScanned,
  fields = DEFAULT_FIELDS,
}: {
  onScanned: (d: PassportDetails) => void;
  // The passport fields this form actually fills — only used for the
  // "Filled N fields" message.
  fields?: (keyof PassportDetails)[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [zoomed, setZoomed] = useState<string | null>(null);

  // Free the object URLs when they're replaced or the card goes away.
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  // Esc closes just the enlarged view. Captured first and stopped, because
  // the surrounding form Modal also closes on Esc and would lose the form.
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setZoomed(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoomed]);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const results: Partial<PassportDetails>[] = [];
      const pages: Blob[] = [];
      for (const file of Array.from(files)) {
        const r = await readPassport(file, setProgress);
        results.push(r.details);
        pages.push(...r.pages);
      }
      setPreviews(pages.map((b) => URL.createObjectURL(b)));
      const merged = mergePassports(results);
      const filled = fields.filter((k) => merged[k]).length;
      if (filled === 0) {
        setMsg({ ok: false, text: "Couldn't read any details — try a clearer, straight-on photo of the page." });
        return;
      }
      onScanned(merged);
      setMsg({ ok: true, text: `Filled ${filled} field${filled === 1 ? "" : "s"} — check them against the passport below.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't read the passport" });
    } finally {
      setBusy(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <div className={styles.wrap}>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf,image/*"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        <button type="button" className={styles.btn} onClick={() => inputRef.current?.click()} disabled={busy}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={busy ? styles.spin : undefined}>
            {busy ? (
              <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
            ) : (
              <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
          {busy ? progress || "Reading passport…" : previews.length ? "Upload again" : "Upload passport"}
        </button>
        <span className={msg ? (msg.ok ? styles.ok : styles.err) : styles.hint}>
          {msg ? msg.text : "PDF or photo of the passport's photo page"}
        </span>
      </div>

      {previews.length > 0 && (
        <div className={styles.previews}>
          {previews.map((url, i) => (
            <button
              key={url}
              type="button"
              className={styles.thumb}
              onClick={() => setZoomed(url)}
              title="Click to enlarge"
              aria-label={`Enlarge uploaded passport page ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Uploaded passport page ${i + 1}`} />
              <span>Click to enlarge</span>
            </button>
          ))}
        </div>
      )}

      {/* Portaled to <body> so the form Modal's own stacking/transform can't
          clip a full-screen overlay. */}
      {zoomed &&
        createPortal(
          <div className={styles.lightbox} role="dialog" aria-label="Uploaded passport" onClick={() => setZoomed(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoomed} alt="Uploaded passport, enlarged" onClick={(e) => e.stopPropagation()} />
            <button type="button" className={styles.lightboxClose} onClick={() => setZoomed(null)} aria-label="Close">
              ×
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
