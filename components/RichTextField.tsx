"use client";

import { useEffect, useRef } from "react";
import { escapeHtml, sanitizeRichHtml } from "@/lib/richtext";
import styles from "./RichTextField.module.css";

const HIGHLIGHT_COLOR = "#fef08a";

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
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    if (el.childNodes.length === 0) return;
    const anchorNode = sel.anchorNode;

    // Chrome only wraps a line in its own <div> once Enter has produced a
    // SECOND line — the very first line sits as loose child nodes directly
    // under the editable root until then (see splitHtmlLinesRaw in
    // lib/richtext.ts). Wrap any such loose leading content into a real
    // <div> first, so every line — first or not — is a top-level <div> by
    // the time the ancestor walk below runs. Without this, clicking the
    // bullet button while on line 1 tried to run querySelector on a bare
    // text node and silently failed.
    const looseLeading: Node[] = [];
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName === "DIV") break;
      looseLeading.push(child);
    }
    if (looseLeading.length > 0) {
      const wrapper = document.createElement("div");
      el.insertBefore(wrapper, looseLeading[0]);
      looseLeading.forEach((n) => wrapper.appendChild(n));
    }

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
          onMouseDown={(e) => e.preventDefault()}
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
