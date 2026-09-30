// Reads a passport entirely in the browser — no server, no API key.
//
// 1. PDF pages are rendered to images (pdf.js); photos are used as-is.
// 2. Tesseract OCR turns each image into text.
// 3. The two machine-readable (MRZ, "P<IND…<<<") lines are parsed with
//    check digits — reliable for passport no, names, DOB, sex, nationality
//    and expiry.
// 4. Everything else (place/date of issue, parents, spouse, address, file
//    no) is found by the English label printed above each value — best
//    effort, so the form always lets the user correct it before saving.
import { parse as parseMrz } from "mrz";
import type { PassportDetails } from "@/lib/passport";

const PDF_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

async function pdfToImages(file: File): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: HTMLCanvasElement[] = [];
  // A passport scan is 1-2 pages; cap it so a wrong upload can't hang the tab.
  for (let n = 1; n <= Math.min(doc.numPages, 4); n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not render the PDF");
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(canvas);
  }
  return pages;
}

async function ocr(images: (HTMLCanvasElement | File)[], onProgress?: (text: string) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  onProgress?.("Loading text reader…");
  const worker = await createWorker("eng");
  try {
    const texts: string[] = [];
    for (let i = 0; i < images.length; i++) {
      onProgress?.(images.length > 1 ? `Reading page ${i + 1} of ${images.length}…` : "Reading passport…");
      const { data } = await worker.recognize(images[i]);
      texts.push(data.text);
    }
    return texts.join("\n");
  } finally {
    await worker.terminate();
  }
}

// ---- MRZ -----------------------------------------------------------------

function fit44(s: string): string {
  return (s + "<".repeat(44)).slice(0, 44);
}

// OCR commonly reads the MRZ filler "<" as «, ‹, K or spaces — normalise.
function cleanMrzLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/[«‹]/g, "<<")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9<]/g, "");
}

function findMrzLines(text: string): [string, string] | null {
  const lines = text.split(/\r?\n/).map(cleanMrzLine).filter((l) => l.length >= 30);
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^P[<A-Z][A-Z<]{3}/.test(lines[i]) && lines[i].includes("<<") && /^[A-Z0-9<]{9}\d/.test(lines[i + 1])) {
      return [fit44(lines[i]), fit44(lines[i + 1])];
    }
  }
  return null;
}

function mrzDate(yymmdd: string | null | undefined, kind: "birth" | "expiry"): string {
  if (!yymmdd || !/^\d{6}$/.test(yymmdd)) return "";
  const yy = Number(yymmdd.slice(0, 2));
  const nowYY = new Date().getFullYear() % 100;
  // Birth dates can't be in the future; expiry dates are always this century.
  const century = kind === "birth" && yy > nowYY ? 1900 : 2000;
  return `${century + yy}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

const NATIONALITY: Record<string, string> = { IND: "INDIAN" };

function fromMrz(text: string): Partial<PassportDetails> {
  const lines = findMrzLines(text);
  if (!lines) return {};
  let result;
  try {
    result = parseMrz(lines, { autocorrect: true });
  } catch {
    return {};
  }
  const f = result.fields;
  // Only trust fields whose own check digit passed (names have none).
  const ok = (name: string) => result.details.every((d) => d.field !== name || d.valid);
  const sex = f.sex === "male" ? "M" : f.sex === "female" ? "F" : f.sex ? "X" : "";
  return {
    surname: f.lastName || "",
    givenName: f.firstName || "",
    passportNo: ok("documentNumberCheckDigit") ? f.documentNumber || "" : "",
    dob: ok("birthDateCheckDigit") ? mrzDate(f.birthDate, "birth") : "",
    dateOfExpiry: ok("expirationDateCheckDigit") ? mrzDate(f.expirationDate, "expiry") : "",
    sex,
    nationality: f.nationality ? NATIONALITY[f.nationality] || f.nationality : "",
  };
}

// ---- Printed labels (Indian passport layout) -------------------------------

// A line that is mostly an English/Hindi label rather than a value.
// Whole words only — values like "…KARNATAKA,INDIA" must not count as labels.
const LABEL_RE =
  /(surname|given name|nationality|date of birth|\bsex\b|place of|date of|name of|father|mother|spouse|\baddress\b|old passport|file no|\btype\b|\bcode\b|passport no|republic of)/i;

function valueLines(lines: string[], labelIndex: number, max: number): string[] {
  const out: string[] = [];
  for (let i = labelIndex + 1; i < lines.length && out.length < max; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (LABEL_RE.test(l)) break;
    // Values are printed in capitals — skip OCR noise from the Hindi labels.
    const caps = l.replace(/[^A-Z0-9,./\-: ]/g, "").trim();
    if (caps.length >= 2 && caps.length >= l.replace(/\s/g, "").length * 0.6) out.push(caps);
  }
  return out;
}

function afterLabel(lines: string[], label: RegExp, max = 1): string {
  const i = lines.findIndex((l) => label.test(l));
  return i === -1 ? "" : valueLines(lines, i, max).join(", ");
}

function dmyToIso(dmy: string): string {
  const m = /(\d{2})[/.\-](\d{2})[/.\-](\d{4})/.exec(dmy);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function fromLabels(text: string): Partial<PassportDetails> {
  const lines = text.split(/\r?\n/);
  const out: Partial<PassportDetails> = {
    placeOfBirth: afterLabel(lines, /place of birth/i),
    placeOfIssue: afterLabel(lines, /place of issue/i),
    fatherName: afterLabel(lines, /father|legal guardian/i),
    motherName: afterLabel(lines, /name of mother|\bmother\b/i),
    spouseName: afterLabel(lines, /spouse/i),
    address: afterLabel(lines, /\baddress\b/i, 4),
  };
  // Date of Issue and Date of Expiry share one printed line.
  const issueIdx = lines.findIndex((l) => /date of issue/i.test(l));
  if (issueIdx !== -1) {
    const dates = lines
      .slice(issueIdx, issueIdx + 3)
      .join(" ")
      .match(/\d{2}[/.\-]\d{2}[/.\-]\d{4}/g);
    if (dates?.[0]) out.dateOfIssue = dmyToIso(dates[0]);
    if (dates?.[1]) out.dateOfExpiry = dmyToIso(dates[1]);
  }
  const file = /\b([A-Z]{2}\d{10,14})\b/.exec(text.replace(/[Oo](?=\d)/g, "0"));
  if (file) out.fileNo = file[1];
  return out;
}

// ---------------------------------------------------------------------------

export async function readPassport(file: File, onProgress?: (text: string) => void): Promise<Partial<PassportDetails>> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf && !file.type.startsWith("image/")) {
    throw new Error(`${file.name}: upload the passport as a PDF or an image`);
  }
  if (isPdf) onProgress?.("Opening PDF…");
  const images = isPdf ? await pdfToImages(file) : [file];
  const text = await ocr(images, onProgress);
  // MRZ values win over label guesses (they're check-digit verified).
  const labels = fromLabels(text);
  const mrz = fromMrz(text);
  const merged: Partial<PassportDetails> = { ...labels };
  for (const [k, v] of Object.entries(mrz)) if (v) (merged as Record<string, string>)[k] = v;
  return merged;
}
