// Rich-text helpers for the WYSIWYG bold/highlight fields (contenteditable).
// The editor produces real HTML (e.g. "<b>text</b>", "<span style=\"background-color:
// #fef08a\">text</span>") instead of the earlier plain-text "**bold**" markers.
//
// Security: sanitizeRichHtml() is the ONLY thing standing between whatever a
// user (or a direct API call bypassing the UI) puts in these fields and the
// page. It must run again at RENDER time (buildPreviewHtml/formatLegalText),
// not just when the editor saves — otherwise a payload written straight to
// the backend, skipping the editor entirely, would be injected unsanitized
// into every viewer's page.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// DIV is allowed because that's what Chrome's native (unprevented) Enter key
// actually wraps each new line in inside a contenteditable — see splitHtml-
// LinesRaw() below. BR is also allowed for backward compatibility with data
// saved before that line-splitting logic was line-per-<div>.
const ALLOWED_TAGS = new Set(["B", "STRONG", "MARK", "SPAN", "BR", "DIV"]);

export function sanitizeRichHtml(html: string): string {
  if (!html) return "";
  const template = document.createElement("template");
  template.innerHTML = html;
  sanitizeChildren(template.content);
  return template.innerHTML;
}

function sanitizeChildren(root: Node) {
  const children = Array.from(root.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) continue;

    if (child.nodeType !== Node.ELEMENT_NODE) {
      root.removeChild(child);
      continue;
    }

    const el = child as HTMLElement;

    if (!ALLOWED_TAGS.has(el.tagName)) {
      // Unwrap: keep the text/children, drop the (disallowed) wrapper tag.
      while (el.firstChild) root.insertBefore(el.firstChild, el);
      root.removeChild(el);
      continue;
    }

    for (const attr of Array.from(el.attributes)) {
      if (el.tagName === "SPAN" && attr.name === "style") {
        const bg = /background-color\s*:\s*[^;]+/i.exec(attr.value);
        if (bg) el.setAttribute("style", bg[0]);
        else el.removeAttribute("style");
      } else if (el.tagName === "SPAN" && attr.name === "data-force-bullet") {
        // Kept as-is — the manual "force a bullet on this line" marker (see
        // RichTextField's bullet button). Only meaningful with value "1".
        if (attr.value !== "1") el.removeAttribute(attr.name);
      } else {
        el.removeAttribute(attr.name);
      }
    }

    sanitizeChildren(el);
  }
}

// Plain-text version of one rich-text line, used only to test the legal-text
// heading/bullet patterns below — never used for output (that stays as HTML
// so bold/highlight survive).
export function htmlToText(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.textContent || "";
}

// A line the user has explicitly bulleted via the toolbar's bullet button
// (see RichTextField.handleBulletPoint) — this is the ONLY way a line
// becomes a bullet in the rendered itinerary/invoice output (Package
// Highlights, Inclusions, Exclusions, Day descriptions, legal-text fields).
// Nothing bullets automatically; an unmarked line always renders as a plain
// paragraph, bold/highlighted or not.
export function hasForceBullet(lineHtml: string): boolean {
  return /<span\b[^>]*data-force-bullet="1"/i.test(lineHtml);
}

// Splits rich HTML into per-line HTML fragments. A "line" boundary is either
// a <br> (older data, or a manual line break) or a <div> (what Chrome's
// native Enter key produces in a contenteditable — see RichTextField, which
// deliberately does NOT preventDefault on Enter: every attempt at manually
// inserting a <br> via execCommand/Range surgery left the caret in the wrong
// place, landing the next typed character in front of the break instead of
// after it. Letting the browser's own default behavior run avoids that
// entirely). Keeps blank lines (as "") — callers that want a bullet list
// filter those out themselves; formatLegalText() keeps them to trigger the
// paragraph-spacer between sections.
export function splitHtmlLinesRaw(html: string): string[] {
  if (!html) return [];
  const template = document.createElement("template");
  template.innerHTML = html;

  const lines: string[] = [];
  let buffer = document.createElement("div");

  function flush() {
    lines.push(buffer.innerHTML);
    buffer = document.createElement("div");
  }

  Array.from(template.content.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "DIV") {
      flush();
      lines.push((node as HTMLElement).innerHTML);
    } else if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "BR") {
      flush();
    } else {
      buffer.appendChild(node.cloneNode(true));
    }
  });
  flush();

  return lines.map((l) => l.trim()).map((l) => (l === "<br>" ? "" : l));
}

export function splitHtmlLines(html: string): string[] {
  return splitHtmlLinesRaw(html).filter((l) => l !== "");
}

export function joinHtmlLines(lines: string[]): string {
  return lines.map((l) => `<div>${l}</div>`).join("");
}
