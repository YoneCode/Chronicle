// Formatting + domain-derivation helpers for the Chronicle Omega console.

export const ATTO = 10n ** 18n;
export const BPS = 10000;

export function toBig(v: bigint | number | string | undefined): bigint {
  if (v === undefined || v === null) return 0n;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

// GEN with adaptive precision; compact for large values.
export function gen(atto: bigint | number | undefined, opts: { compact?: boolean } = {}): string {
  const v = toBig(atto);
  const whole = v / ATTO;
  const milli = (v % ATTO) / (ATTO / 1000n);
  if (opts.compact && whole >= 1000n) {
    const n = Number(whole);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    return `${(n / 1000).toFixed(1)}k`;
  }
  return `${whole.toString()}.${milli.toString().padStart(3, "0")}`;
}

export function pct(part: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number((part * 10000n) / total) / 100;
}

export function bpsToPct(b: number | undefined): number {
  return (b ?? 0) / 100;
}

export function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function shortAddr(a: string | undefined): string {
  if (!a) return "—";
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// Covenant health: combines trust gradient, divergence vs tolerance, and reeval flag.
export type Health = { score: number; label: "Healthy" | "Watch" | "At Risk"; tone: "ok" | "warn" | "bad" };

export function health(c: { trust_gradient_bps: number; divergence_bps: number; reeval: boolean; status: string }, toleranceBps: number): Health {
  if (c.status === "closed") return { score: 0, label: "Watch", tone: "warn" };
  const trust = (c.trust_gradient_bps ?? 0) / BPS; // 0..1
  const divergenceOver = toleranceBps > 0 ? Math.min(1, (c.divergence_bps ?? 0) / toleranceBps) : 0;
  let score = Math.round((trust * 0.7 + (1 - divergenceOver) * 0.3) * 100);
  if (c.reeval) score = Math.min(score, 62);
  if (score >= 70) return { score, label: "Healthy", tone: "ok" };
  if (score >= 45) return { score, label: "Watch", tone: "warn" };
  return { score, label: "At Risk", tone: "bad" };
}
