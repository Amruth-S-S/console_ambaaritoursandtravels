"use client";

import { useLayoutEffect, useRef } from "react";

// A single-line text field that wraps and grows taller instead of cutting
// off long values (e.g. "VIJAYKUMAR SHIVASHARANAPPA"). It's a textarea so
// it can wrap, but Enter doesn't add a line break — it behaves like an input.
export default function AutoGrowInput({
  value,
  onChange,
  id,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      id={id}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/\r?\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      style={{ display: "block", resize: "none", overflow: "hidden", lineHeight: 1.4, minHeight: 0 }}
    />
  );
}
