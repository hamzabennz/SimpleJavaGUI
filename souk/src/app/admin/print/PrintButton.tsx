"use client";
export function PrintButton() {
  return <button className="btn" onClick={() => window.print()}>🖨 Imprimer</button>;
}
