"use client";
import { useTransition } from "react";
import { setOrderStatus } from "../../actions";

export function StatusButtons({ orderId, current, statuses, compact }: { orderId: string; current: string; statuses: { key: string; label: string; color: string }[]; compact?: boolean }) {
  const [pending, start] = useTransition();
  if (compact) {
    return (
      <select value={current} disabled={pending} onChange={(e) => start(() => setOrderStatus(orderId, e.target.value))}
        style={{ width: "auto", padding: "4px 8px", borderColor: statuses.find((s) => s.key === current)?.color, fontWeight: 600 }}>
        {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    );
  }
  return (
    <div className="row wrap">
      {statuses.map((s) => (
        <button key={s.key} disabled={pending || s.key === current} onClick={() => start(() => setOrderStatus(orderId, s.key))}
          className="btn sm" style={{ background: s.key === current ? s.color : "transparent", color: s.key === current ? "#fff" : s.color, borderColor: s.color }}>
          {s.label}
        </button>
      ))}
    </div>
  );
}
