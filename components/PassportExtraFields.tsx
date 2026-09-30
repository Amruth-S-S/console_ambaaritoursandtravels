"use client";

import { PASSPORT_EXTRA_FIELDS, PassportExtraKey } from "@/lib/passport";

// The passport fields beyond name / number / DOB / sex, laid out three per
// row. Takes the host page's own row/field classes so the inputs match
// that form's styling (Room List and Currency use different CSS modules).
export default function PassportExtraFields({
  values,
  onChange,
  idPrefix,
  rowClass,
  fieldClass,
}: {
  values: Record<PassportExtraKey, string>;
  onChange: (key: PassportExtraKey, value: string) => void;
  idPrefix: string;
  rowClass: string;
  fieldClass: string;
}) {
  const inline = PASSPORT_EXTRA_FIELDS.filter((f) => !f.wide);
  const wide = PASSPORT_EXTRA_FIELDS.filter((f) => f.wide);
  const rows: (typeof inline)[] = [];
  for (let i = 0; i < inline.length; i += 3) rows.push(inline.slice(i, i + 3));

  function field(f: (typeof PASSPORT_EXTRA_FIELDS)[number]) {
    const id = `${idPrefix}-${f.key}`;
    return (
      <div key={f.key} className={fieldClass}>
        <label htmlFor={id}>{f.label}</label>
        {f.wide ? (
          <textarea id={id} rows={2} value={values[f.key]} onChange={(e) => onChange(f.key, e.target.value)} />
        ) : (
          <input
            id={id}
            type={f.date ? "date" : "text"}
            value={values[f.key]}
            onChange={(e) => onChange(f.key, e.target.value)}
          />
        )}
      </div>
    );
  }

  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className={rowClass}>
          {r.map(field)}
        </div>
      ))}
      {wide.map(field)}
    </>
  );
}
