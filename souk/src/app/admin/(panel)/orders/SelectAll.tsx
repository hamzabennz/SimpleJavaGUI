"use client";
export function SelectAll() {
  return <input type="checkbox" style={{ width: "auto" }} onChange={(e) => document.querySelectorAll<HTMLInputElement>('#bulk input[name="ids"]').forEach((c) => (c.checked = e.target.checked))} />;
}
