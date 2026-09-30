"use client";

import { useRef, useState } from "react";
import { mergePassports, PassportDetails } from "@/lib/passport";
import { readPassport } from "@/lib/passportOcr";
import styles from "./PassportScan.module.css";

// "Upload passport" button — reads one or more files (e.g. the photo page
// and the address page) right here in the browser (lib/passportOcr.ts) and
// hands back the merged fields. Nothing is uploaded or stored; the caller
// fills its form and the user checks and saves.
export default function PassportScan({ onScanned }: { onScanned: (d: PassportDetails) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const results: Partial<PassportDetails>[] = [];
      for (const file of Array.from(files)) {
        results.push(await readPassport(file, setProgress));
      }
      const merged = mergePassports(results);
      const filled = Object.values(merged).filter(Boolean).length;
      if (filled === 0) {
        setMsg({ ok: false, text: "Couldn't read any details — try a clearer, straight-on photo of the page." });
        return;
      }
      onScanned(merged);
      setMsg({ ok: true, text: `Filled ${filled} field${filled === 1 ? "" : "s"} — please check them before saving.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't read the passport" });
    } finally {
      setBusy(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
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
        {busy ? progress || "Reading passport…" : "Upload passport"}
      </button>
      <span className={msg ? (msg.ok ? styles.ok : styles.err) : styles.hint}>
        {msg ? msg.text : "PDF or photo — select both pages to fill the address too"}
      </span>
    </div>
  );
}
