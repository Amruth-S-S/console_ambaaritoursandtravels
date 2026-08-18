"use client";

import { useEffect, useRef } from "react";
import { escapeHtml, sanitizeRichHtml } from "@/lib/richtext";
import styles from "./RichTextField.module.css";

const HIGHLIGHT_COLOR = "#fef08a";

// A "line" in this editor can be structured two different ways: Chrome's
// native Enter key wraps each new line in its own top-level <div> (see
// splitHtmlLinesRaw in lib/richtext.ts) — but pasted text (onPaste below)
// joins lines with inline <br>s instead, all sitting flat as direct
// children of the editable root with no per-line wrapper at all. The
// renderer (splitHtmlLinesRaw) already understands both forms, but the
// bullet button's "which line is the caret in" lookup only understood the
// <div> form — for <br>-joined content it walked straight to the editable
// root itself, meaning EVERY line resolved to the same one "line" and a
// bullet toggle on any of them collided with all the others. This rewrites
// the root's children into one <div> per line unconditionally (regardless
// of whether they arrived as <div>s, loose text before the first <div>, or
// <br>-joined runs), so the ancestor walk in handleBulletPoint always finds
// a distinct container per line no matter how that line was typed or
// pasted in. A no-op once the content is already clean div-per-line — which
// it stays, once normalized here the first time.
function normalizeLinesToDivs(el: HTMLElement) {
  const original = Array.from(el.childNodes);
  const alreadyClean = original.every(
    (n) => n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === "DIV"
  );
  if (alreadyClean) return;

  const lines: HTMLElement[] = [];
  let buffer: Node[] = [];
  function flushBuffer() {
    const wrapper = document.createElement("div");
    buffer.forEach((n) => wrapper.appendChild(n));
    lines.push(wrapper);
    buffer = [];
  }

  original.forEach((child) => {
    const isElement = child.nodeType === Node.ELEMENT_NODE;
    const tag = isElement ? (child as HTMLElement).tagName : "";
    if (tag === "DIV") {
      flushBuffer();
      lines.push(child as HTMLElement);
    } else if (tag === "BR") {
      flushBuffer();
      el.removeChild(child);
    } else {
      buffer.push(child);
    }
  });
  flushBuffer();

  // appendChild moves an already-in-document node rather than cloning it,
  // so this both reorders the existing <div>s (a no-op position-wise) and
  // relocates every newly-wrapped line into place — final order matches
  // `lines`, which matches the original left-to-right content order.
  lines.forEach((line) => el.appendChild(line));
}

export default function RichTextField({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Captured at mousedown, before the click — reading window.getSelection()
  // fresh inside the click handler turned out to be unreliable for which
  // line actually gets bulleted (a live Selection tied to a toolbar button
  // click, outside the editable region, isn't guaranteed to still describe
  // the line the user meant by the time the click fires). Snapshotting the
  // Range up front removes that ambiguity entirely.
  const savedRangeRef = useRef<Range | null>(null);

  function saveSelectionForBullet() {
    const sel = window.getSelection();
    const el = ref.current;
    savedRangeRef.current =
      sel && sel.rangeCount > 0 && el && el.contains(sel.anchorNode)
        ? sel.getRangeAt(0).cloneRange()
        : null;
  }

  // Keep the DOM in sync when `value` changes from OUTSIDE this component
  // (loading a saved package, "Load Example", clearing the form) — but not
  // on every keystroke, which would fight the browser's own cursor position.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  // Reads the live DOM straight through to onChange with NO re-sanitize-and-
  // reassign here — forcing el.innerHTML back to a re-serialized string on
  // every keystroke fights the browser's own cursor tracking (the sanitizer
  // round-trips through a <template>, and even a byte-identical-looking
  // result can reset the caret to the end when reassigned mid-edit). This is
  // safe: sanitizeRichHtml() still runs authoritatively at render time in
  // buildPreviewHtml/formatLegalText, which is what actually guards against
  // a payload written straight to the API bypassing this editor entirely.
  // handleBlur() below does the sanitize-and-reassign once the user is done
  // typing, when disrupting the caret no longer matters.
  function emitChange() {
    const el = ref.current;
    if (!el) return;
    onChange(el.innerHTML);
  }

  function handleBlur() {
    const el = ref.current;
    if (!el) return;
    const sanitized = sanitizeRichHtml(el.innerHTML);
    if (sanitized !== el.innerHTML) {
      el.innerHTML = sanitized;
      onChange(sanitized);
    }
  }

  // Enter is deliberately left to the browser's native behavior (no
  // preventDefault, no manual <br> insertion) — every attempt at simulating
  // it manually (execCommand("insertLineBreak"), execCommand("insertHTML",
  // "<br>") + Range surgery to reposition the caret) left the caret in the
  // wrong spot, so the next typed character landed in front of the break
  // instead of after it. Chrome's own default Enter handling wraps each new
  // line in its own <div> and gets the caret right every time — see
  // splitHtmlLinesRaw() in lib/richtext.ts, which is what actually knows how
  // to turn that <div>-per-line structure back into an array of lines.

  function handleBold() {
    ref.current?.focus();
    document.execCommand("bold");
    emitChange();
  }

  function handleHighlight() {
    ref.current?.focus();
    document.execCommand("hiliteColor", false, HIGHLIGHT_COLOR);
    emitChange();
  }

  function handleClear() {
    ref.current?.focus();
    document.execCommand("removeFormat");
    emitChange();
  }

  // Toggles a bullet on the current line — the line containing the caret, or
  // the whole line if any part of it is selected. Nothing bullets
  // automatically anywhere this field is used (Package Highlights,
  // Inclusions, Exclusions, Day descriptions, legal-text fields) — this
  // button is the only way a line becomes one, via a
  // <span data-force-bullet="1"> marker wrapping the line's content,
  // checked by hasForceBullet() at render time (lib/richtext.ts).
  function handleBulletPoint() {
    const el = ref.current;
    if (!el) return;
    const range = savedRangeRef.current;
    if (!range || !el.contains(range.startContainer)) return;
    if (el.childNodes.length === 0) return;
    const anchorNode = range.startContainer;
    el.focus();

    normalizeLinesToDivs(el);

    // The nearest ancestor that's a direct child of the editable root — that
    // IS the current line, now that every line is guaranteed to be one.
    let node: Node | null = anchorNode;
    while (node && node !== el && node.parentNode && node.parentNode !== el) node = node.parentNode;
    if (!node || node.nodeType !== Node.ELEMENT_NODE || node.parentNode !== el) return;
    const line = node as HTMLElement;

    const existing = line.querySelector('span[data-force-bullet="1"]') as HTMLElement | null;
    if (existing) {
      while (existing.firstChild) existing.parentNode?.insertBefore(existing.firstChild, existing);
      existing.parentNode?.removeChild(existing);
    } else {
      const marker = document.createElement("span");
      marker.setAttribute("data-force-bullet", "1");
      while (line.firstChild) marker.appendChild(line.firstChild);
      line.appendChild(marker);
    }
    emitChange();
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toolbarBtn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleBold}
          title="Bold selected text"
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className={styles.toolbarBtn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleHighlight}
          title="Highlight selected text"
        >
          <i className="fas fa-highlighter" />
        </button>
        <button
          type="button"
          className={styles.toolbarBtn}
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelectionForBullet();
          }}
          onClick={handleBulletPoint}
          title="Toggle a bullet point on this line"
        >
          <i className="fas fa-list-ul" />
        </button>
        <button
          type="button"
          className={styles.toolbarBtn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleClear}
          title="Clear formatting"
        >
          <i className="fas fa-eraser" />
        </button>
      </div>
      <div
        ref={ref}
        className={styles.editable}
        style={{ minHeight: `${rows * 22 + 16}px` }}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emitChange}
        onBlur={handleBlur}
        onPaste={(e) => {
          // Force plain-text paste: pasted rich HTML from elsewhere could
          // otherwise carry arbitrary tags/attributes ahead of sanitization.
          // \n -> <br> so multi-line pastes still split into separate lines
          // the same way typing Enter does (see splitHtmlLinesRaw).
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          const html = text.split("\n").map(escapeHtml).join("<br>");
          document.execCommand("insertHTML", false, html);
          emitChange();
        }}
      />
    </div>
  );
}
