import { useEffect, useRef, useState } from "react";

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * Animate a numeric value from 0 → target with ease-out-quart.
 * Duration scales with the actual fetch latency that produced `target`,
 * so the count-up *feels* like the data resolving — slow reads animate longer.
 *
 * `null` target = still loading (returns 0).
 */
export function useCountUp(
  target: number | bigint | null | undefined,
  fetchMs: number = 600,
  opts: { min?: number; max?: number } = {}
): number {
  const [value, setValue] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (target === null || target === undefined) return;
    const goal = typeof target === "bigint" ? Number(target) : Number(target);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || goal === 0) {
      setValue(goal);
      return;
    }
    const dur = Math.max(opts.min ?? 700, Math.min(opts.max ?? 2200, fetchMs * 1.6));
    const start = performance.now();
    const from = 0;

    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      setValue(from + (goal - from) * easeOutQuart(k));
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, fetchMs, opts.min, opts.max]);

  return value;
}
