"use client";
import { useEffect, useState } from "react";

/** Fixed end date, or a rolling window of N hours (restarts per visitor, a common landing-page pattern). */
export function Countdown({ endsAt, hours, units = ["J", "H", "M", "S"] }: { endsAt?: string; hours: number; units?: string[] }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    let end = endsAt ? new Date(endsAt + "T23:59:59").getTime() : 0;
    if (!end || end < Date.now()) {
      const key = "cd_end"; let v = 0;
      try { v = Number(localStorage.getItem(key)) || 0; } catch {}
      if (v < Date.now()) { v = Date.now() + hours * 3600_000; try { localStorage.setItem(key, String(v)); } catch {} }
      end = v;
    }
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [endsAt, hours]);
  if (left === null) return <div style={{ height: 64 }} />;
  const s = Math.floor(left / 1000);
  const parts = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
  return (
    <div className="row" style={{ justifyContent: "center", gap: 10 }} dir="ltr">
      {parts.map((n, i) => (
        <div key={i} style={{ background: "var(--c-danger)", color: "#fff", borderRadius: 10, minWidth: 64, padding: "10px 6px", fontSize: "1.6rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {String(n).padStart(2, "0")}<div style={{ fontSize: ".65rem", fontWeight: 500, opacity: .85 }}>{units[i]}</div>
        </div>
      ))}
    </div>
  );
}
