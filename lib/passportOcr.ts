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

// Phone photos are often small or soft — enlarge (up to 2.5x, so the long
// side is ~2400px) and convert to grey with a little extra contrast before
// OCR. Noticeably better at telling "<" from C/L in the MRZ lines.
async function preparePhoto(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(2.5, Math.max(1, 2400 / Math.max(bitmap.width, bitmap.height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the photo");
  ctx.filter = "grayscale(1) contrast(1.35)";
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
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
    .replace(/€/g, "C") // OCR reads the MRZ font's "C" as "€"
    .replace(/[«‹]/g, "<<")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9<]/g, "");
}

function findMrzLines(text: string): [string, string] | null {
  const lines = text.split(/\r?\n/).map(cleanMrzLine).filter((l) => l.length >= 30);
  for (let i = 0; i < lines.length - 1; i++) {
    // Line 1 may have a stray mark before "P<"; drop it so the parser sees 44 clean chars.
    const start = lines[i].search(/P[<A-Z][A-Z<]{3}/);
    if (start >= 0 && start <= 3 && lines[i].includes("<") && /^[A-Z0-9<]{9}\d/.test(lines[i + 1])) {
      return [fit44(lines[i].slice(start)), fit44(lines[i + 1])];
    }
  }
  return null;
}

// Names straight from MRZ line 1 ("P<INDPATIL<<VIJAYKUMAR<SHIVA…<<<<").
// The "<" filler after the names often comes out of OCR as junk like
// "<L<LL<KLK", and the MRZ library's autocorrect can shift those letters
// into a name ("KSHIVASHARANAPPA") — so split on "<" ourselves and stop at
// the first piece that can't be a name: empty (a "<<" run), 1-2 letters,
// or made only of K/L/C.
function mrzNames(rawLine: string): { surname: string; givenName: string } | null {
  const line = rawLine
    .replace(/[a-z]/g, "") // the MRZ font has no lowercase — stray OCR marks
    .replace(/€/g, "C")
    .replace(/[«‹]/g, "<<")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9<]/g, "");
  // OCR sometimes puts a stray mark before "P<IND", so look near the start.
  const m = /^.{0,3}?P[<A-Z][A-Z<]{3}(.*)$/.exec(line);
  if (!m) return null;
  // Surname / given-name break is "<<", but OCR often reads it as "<S<",
  // "<C<" etc. (one stray letter between the two "<"), or keeps only one
  // "<" ("NAGARAJUS<RAGHAVENDRA") — the stray letter is then trimmed off
  // the surname by reconcileWord against the printed surname.
  const sep = /<[A-Z]?</.exec(m[1]) ?? /</.exec(m[1]);
  if (!sep) return null;
  const take = (part: string) => {
    const out: string[] = [];
    for (const raw of part.split("<")) {
      const t = stripFiller(raw);
      if (t.length < 2 || /\d/.test(t)) break; // first non-name piece = start of the filler
      out.push(t);
      if (t.length < raw.length) break; // filler began inside this piece
    }
    return out.join(" ");
  };
  return { surname: take(m[1].slice(0, sep.index)), givenName: take(m[1].slice(sep.index + sep[0].length)) };
}

// The "<<<<" padding after a name often comes out of OCR as letters —
// "RAGHAVENDRALLLLLLLLLC", "…ASLCCLLLL". Cut the trailing run that is made
// (almost) entirely of those look-alikes (C, L, K, S, R, <), if it's at
// least 3 long. Over-trimming (e.g. a real final S) is put right afterwards
// against the printed name — see reconcileName.
function stripFiller(token: string): string {
  const look = "CLKSR<";
  // Earliest point where everything after is (≥85%) look-alikes, at least
  // 3 long, with at least two of the most common ones (C/L/K/<).
  for (let i = 0; i <= token.length - 3; i++) {
    const tail = token.slice(i);
    if (!look.includes(tail[0])) continue;
    const chars = Array.from(tail);
    const bad = chars.filter((ch) => !look.includes(ch)).length;
    const core = chars.filter((ch) => "CLK<".includes(ch)).length;
    if (bad <= Math.floor(tail.length * 0.15) && core >= 2) return token.slice(0, i);
  }
  return token;
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

// ICAO 9303 check digit: weights 7,3,1 repeating; 0-9 as-is, A-Z = 10-35,
// "<" = 0.
function checkDigit(s: string): number {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const v = c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55;
    sum += v * w[i % 3];
  }
  return sum % 10;
}

// DOB / sex / expiry straight from MRZ line 2's middle —
// "IND" + yymmdd + check + M/F + yymmdd + check — each verified by its own
// check digit. Works even when the passport number at the start of the
// line was misread and the full-line parse gave up on it.
function fromMrzLine2(text: string): Partial<PassportDetails> {
  for (const raw of text.split(/\r?\n/)) {
    const line = cleanMrzLine(raw);
    const m = /([A-Z<]{3})(\d{6})(\d)([MF<X])(\d{6})(\d)/.exec(line);
    if (!m) continue;
    const [, nat, dob, dobCheck, sex, exp, expCheck] = m;
    const out: Partial<PassportDetails> = {};
    if (checkDigit(dob) === Number(dobCheck)) {
      out.dob = mrzDate(dob, "birth");
      out.sex = sex === "<" ? "" : sex;
    }
    if (checkDigit(exp) === Number(expCheck)) out.dateOfExpiry = mrzDate(exp, "expiry");
    if (/^[A-Z]{3}$/.test(nat)) out.nationality = NATIONALITY[nat] || nat;
    // Passport number = the 9 characters + check digit just before "IND".
    const before = line.slice(0, m.index);
    const doc = /([A-Z0-9<]{9})(\d)$/.exec(before);
    if (doc && checkDigit(doc[1]) === Number(doc[2])) out.passportNo = doc[1].replace(/<+$/, "");
    if (out.dob || out.passportNo) return out;
  }
  return {};
}

// Last resort for DOB: the earliest dd/mm/yyyy printed on the page — date
// of birth is always older than the issue and expiry dates beside it.
function printedDob(text: string): string {
  const thisYear = new Date().getFullYear();
  const dates = (text.match(/\b(\d{2})[/.\-](\d{2})[/.\-](\d{4})\b/g) || [])
    .map(dmyToIso)
    .filter((d) => d && Number(d.slice(0, 4)) > 1900 && Number(d.slice(0, 4)) < thisYear)
    .sort();
  return dates[0] || "";
}

function fromMrz(text: string): Partial<PassportDetails> {
  // Names only need line 1, so they're read even when line 2 is unreadable.
  const nameLine = text
    .split(/\r?\n/)
    .find((l) => {
      const c = cleanMrzLine(l);
      const start = c.search(/P[<A-Z][A-Z<]{3}/);
      return c.length >= 30 && start >= 0 && start <= 3 && !/\d{5}/.test(c);
    });
  const names = nameLine ? mrzNames(nameLine) : null;
  const nameFields = { surname: names?.surname || "", givenName: names?.givenName || "" };

  const lines = findMrzLines(text);
  if (!lines) return nameFields;
  let result;
  try {
    result = parseMrz(lines, { autocorrect: true });
  } catch {
    return nameFields;
  }
  const f = result.fields;
  // Only trust fields whose own check digit passed (names have none).
  const ok = (name: string) => result.details.every((d) => d.field !== name || d.valid);
  const sex = f.sex === "male" ? "M" : f.sex === "female" ? "F" : f.sex ? "X" : "";
  return {
    ...nameFields,
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

function lettersOnly(v: string): string {
  return v.replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
}

// MRZ name when it was read; otherwise the printed name line, keeping only
// whole capitalised words (OCR surrounds it with stray marks like "Fy oF").
function pickName(printed: string | undefined, mrz: string | undefined, printedWords: string[] = []): string {
  const m = (mrz || "").trim();
  if (m) return m.split(" ").map((w) => reconcileWord(w, printedWords)).join(" ");
  return (printed || "")
    .split(" ")
    .filter((w) => w.length >= 3)
    .join(" ");
}

// Levenshtein distance, small strings only.
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// An MRZ name word, corrected against the words printed on the page: a
// garbled or over-trimmed MRZ word ("NARAJU", "THOMA") takes the closest
// printed word ("NAGARAJU", "THOMAS") when they're nearly the same.
function reconcileWord(word: string, printedWords: string[]): string {
  if (word.length < 3 || printedWords.includes(word)) return word;
  // A printed word that is the start of the MRZ word: if what's left over is
  // only filler look-alikes ("NAGARAJU" + "S"), the printed word is right;
  // otherwise the printed line got clipped ("SHIVASHARANAPP" vs "…PPA") and
  // the MRZ word is the complete one.
  const prefix = printedWords
    .filter((p) => p.length >= 3 && word.startsWith(p))
    .sort((x, y) => y.length - x.length)[0];
  if (prefix) return /^[CLKSR<]+$/.test(word.slice(prefix.length)) ? prefix : word;
  let best = word;
  let bestDist = Infinity;
  for (const p of printedWords) {
    if (Math.abs(p.length - word.length) > 3) continue;
    const d = editDistance(word, p);
    const limit = word.length >= 8 ? 3 : 2;
    if (d <= limit && d < bestDist && p.startsWith(word.slice(0, 1))) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

// Whole capitalised words printed on the page (no MRZ lines), for reconcileWord.
function printedNameWords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/\r?\n/)
        .filter((l) => !/[<«]{2}|\d{6}/.test(l))
        .flatMap((l) => {
          const words = l.match(/\b[A-Z]{2,}\b/g) || [];
          // OCR sometimes splits a printed name ("NAGARA JU") — offer each
          // neighbouring pair joined up too.
          const joined = words.slice(1).map((w, i) => words[i] + w);
          return [...words, ...joined].filter((w) => w.length >= 3);
        })
    )
  );
}

// Passport number from the printed page — one letter + 7 digits on Indian
// passports — used when the MRZ number fails its check digit.
function printedPassportNo(text: string): string {
  const printed = text
    .split(/\r?\n/)
    .filter((l) => !/[<«]{2}/.test(l))
    .join(" ");
  const m = /\b([A-Z])\s?(\d{7})\b/.exec(printed);
  return m ? m[1] + m[2] : "";
}
function fromLabels(text: string): Partial<PassportDetails> {
  const lines = text.split(/\r?\n/);
  const out: Partial<PassportDetails> = {
    surname: lettersOnly(afterLabel(lines, /\bsurname\b/i)),
    givenName: lettersOnly(afterLabel(lines, /given name/i)),
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

export type PassportReadResult = {
  details: Partial<PassportDetails>;
  // What was read — the photo itself, or each rendered PDF page — so the
  // form can show it next to the filled fields for re-checking.
  pages: Blob[];
};

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not render the page"))), "image/jpeg", 0.85)
  );
}

export async function readPassport(file: File, onProgress?: (text: string) => void): Promise<PassportReadResult> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf && !file.type.startsWith("image/")) {
    throw new Error(`${file.name}: upload the passport as a PDF or an image`);
  }
  if (isPdf) onProgress?.("Opening PDF…");
  const images = isPdf ? await pdfToImages(file) : [await preparePhoto(file)];
  const text = await ocr(images, onProgress);
  // MRZ values win over label guesses (they're check-digit verified).
  const labels = fromLabels(text);
  const mrz = fromMrz(text);
  const merged: Partial<PassportDetails> = { ...labels };
  for (const [k, v] of Object.entries(mrz)) if (v) (merged as Record<string, string>)[k] = v;
  const words = printedNameWords(text);
  merged.surname = pickName(labels.surname, mrz.surname, words);
  merged.givenName = pickName(labels.givenName, mrz.givenName, words);
  // Fallbacks when the full MRZ parse couldn't verify a field.
  const line2 = fromMrzLine2(text);
  for (const k of ["passportNo", "dob", "sex", "dateOfExpiry", "nationality"] as const) {
    if (!merged[k] && line2[k]) merged[k] = line2[k];
  }
  if (!merged.passportNo) merged.passportNo = printedPassportNo(text);
  if (!merged.dob) merged.dob = printedDob(text);
  const pages = isPdf ? await Promise.all((images as HTMLCanvasElement[]).map(canvasToBlob)) : [file];
  return { details: merged, pages };
}
