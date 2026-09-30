// Passport fields read by the in-browser passport reader (lib/passportOcr.ts).
// Dates are yyyy-mm-dd, ready for <input type="date">.
export type PassportDetails = {
  passportNo: string;
  surname: string;
  givenName: string;
  sex: string; // "M" | "F" | "X" as printed
  dob: string;
  nationality: string;
  placeOfBirth: string;
  placeOfIssue: string;
  dateOfIssue: string;
  dateOfExpiry: string;
  fatherName: string;
  motherName: string;
  spouseName: string;
  address: string;
  fileNo: string;
};

// The passport fields beyond name / passport no / DOB / sex — stored flat,
// under these same names, on both a Room List traveler and a Currency entry.
export type PassportExtraKey =
  | "nationality"
  | "placeOfBirth"
  | "placeOfIssue"
  | "dateOfIssue"
  | "dateOfExpiry"
  | "fatherName"
  | "motherName"
  | "spouseName"
  | "address"
  | "fileNo";

export const PASSPORT_EXTRA_FIELDS: { key: PassportExtraKey; label: string; date?: boolean; wide?: boolean }[] = [
  { key: "nationality", label: "Nationality" },
  { key: "placeOfBirth", label: "Place of Birth" },
  { key: "placeOfIssue", label: "Place of Issue" },
  { key: "dateOfIssue", label: "Date of Issue", date: true },
  { key: "dateOfExpiry", label: "Date of Expiry", date: true },
  { key: "fileNo", label: "File No" },
  { key: "fatherName", label: "Father / Legal Guardian" },
  { key: "motherName", label: "Mother" },
  { key: "spouseName", label: "Spouse" },
  { key: "address", label: "Address", wide: true },
];

export const EMPTY_PASSPORT_EXTRAS: Record<PassportExtraKey, string> = {
  nationality: "",
  placeOfBirth: "",
  placeOfIssue: "",
  dateOfIssue: "",
  dateOfExpiry: "",
  fatherName: "",
  motherName: "",
  spouseName: "",
  address: "",
  fileNo: "",
};

export function pickExtras(d: Partial<PassportDetails>): Record<PassportExtraKey, string> {
  const out = { ...EMPTY_PASSPORT_EXTRAS };
  for (const f of PASSPORT_EXTRA_FIELDS) out[f.key] = d[f.key] || "";
  return out;
}

// "M"/"F" on the passport -> the Room List's Male/Female/Other dropdown.
export function genderFromSex(sex: string): string {
  const s = sex.trim().toUpperCase();
  if (s.startsWith("M")) return "Male";
  if (s.startsWith("F")) return "Female";
  return s ? "Other" : "";
}

// Merges scans of several pages (photo page + address page) — the first
// non-empty value for each field wins.
export function mergePassports(parts: Partial<PassportDetails>[]): PassportDetails {
  const keys: (keyof PassportDetails)[] = [
    "passportNo", "surname", "givenName", "sex", "dob",
    ...PASSPORT_EXTRA_FIELDS.map((f) => f.key),
  ];
  const out = Object.fromEntries(keys.map((k) => [k, ""])) as PassportDetails;
  for (const p of parts) for (const k of keys) if (!out[k] && p[k]) out[k] = p[k] as string;
  return out;
}
