"use client";

import { api, AccountEntry } from "@/lib/api";
import { formatDateDMY } from "@/lib/dates";
import EntryDetailsModal, { dateTime } from "./EntryDetailsModal";

// Stored amounts are free text and may contain commas ("1,50,000") —
// strip them before formatting, or Number() gives NaN.
export function money(v: string): string {
  const n = Number((v || "").replace(/[^0-9.-]/g, ""));
  return v && !Number.isNaN(n) ? `₹ ${n.toLocaleString("en-IN")}` : "—";
}

const accountFileApi = { get: api.getAccountAttachment };

// Account ledger's View modal — the Account fields on the shared details shell.
export default function ViewEntryModal({
  entry,
  onClose,
  onManageFiles,
}: {
  entry: AccountEntry | null;
  onClose: () => void;
  onManageFiles: (entry: AccountEntry) => void;
}) {
  return (
    <EntryDetailsModal
      entry={entry}
      fileApi={accountFileApi}
      onClose={onClose}
      onManageFiles={onManageFiles}
      approved={!!entry?.approved}
      amounts={
        entry
          ? [
              { label: "Debit", value: money(entry.debit), tone: "debit" },
              { label: "Credit", value: money(entry.credit), tone: "credit" },
              { label: "Balance", value: money(entry.balance) },
            ]
          : []
      }
      details={
        entry
          ? [
              ["Sl No", entry.slNo],
              ["Date", formatDateDMY(entry.date)],
              ["Invoice No", entry.invoiceNo],
              ["Agent", entry.agent],
              ["Client Name", entry.clientName],
              ["Name", entry.name],
              ["Destination", entry.destination],
              ["Hand Over To", entry.handOverTo],
              ["Payment Mode", entry.paymentMode],
              ["Created", dateTime(entry.createdAt)],
            ]
          : []
      }
      wide={entry ? [["Description", entry.description]] : []}
    />
  );
}
