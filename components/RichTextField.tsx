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
