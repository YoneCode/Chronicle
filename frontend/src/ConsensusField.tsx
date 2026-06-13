import { useEffect, useRef } from "react";

interface Props {
  trustBps?: number;       // 0-10000 — drives node glow intensity
  allocationBps?: number;  // 0-10000 — drives particle density along edges
  converged?: boolean;     // converged → verdigris accent, else brass
}

/**
 * Consensus Field — three validator nodes orbit slowly, edges between them carry
 * particles whose density and brightness are driven by real on-chain trust /
 * allocation. Cursor proximity gently displaces nodes for parallax.
 *
 * Disciplined ambience: low opacity, no pointer-events, paused off-screen, and
 * a single-frame static render under prefers-reduced-motion.
 */
export function ConsensusField({ trustBps = 5000, allocationBps = 0, converged = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Resolve CSS variable colors to RGB once (canvas can't read CSS vars directly).
    const styles = getComputedStyle(canvas);
    const accentHex = (converged ? styles.getPropertyValue("--verdigris") : styles.getPropertyValue("--brass")).trim() || "#0052ff";
    const accent = parseHex(accentHex);
    const dim = parseHex(styles.getPropertyValue("--brass-dim").trim() || "#4a7dff");

    // Sizing
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Three validator nodes — equilateral arrangement around centroid.
    const nodes = Array.from({ length: 3 }, (_, i) => {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      return { baseA: a, x: 0, y: 0, glow: 0 };
    });

    // Particle pool: target count scales with allocation %, baseline 24.
    type P = { from: number; to: number; t: number; speed: number; size: number };
    const particles: P[] = [];
    const trust = Math.max(0, Math.min(1, trustBps / 10000));
    const alloc = Math.max(0, Math.min(1, allocationBps / 10000));
    const target = Math.round(24 + alloc * 60);

    const spawn = () => {
      const from = (Math.random() * 3) | 0;
      let to = (Math.random() * 3) | 0;
      while (to === from) to = (to + 1) % 3;
      particles.push({
        from, to,
        t: Math.random() * 0.2,
        speed: 0.00045 + Math.random() * 0.0006,
        size: 0.7 + Math.random() * 1.6,
      });
    };

    // Mouse — relative to canvas; only updated when visible.
    let mx = -9999, my = -9999;
    const onMouse = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mx = e.clientX - r.left; my = e.clientY - r.top;
    };
    window.addEventListener("mousemove", onMouse, { passive: true });

    let visible = true;
    let raf: number | null = null;
    let last = performance.now();
    let time = 0;

    const draw = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      time += dt;

      const cx = w / 2;
      const cy = h / 2;
      const orbitR = Math.min(w, h) * 0.34;
      const orbitSpeed = 0.00005;

      // Position nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const a = n.baseA + time * orbitSpeed;
        let x = cx + Math.cos(a) * orbitR;
        let y = cy + Math.sin(a) * orbitR * 0.78; // slight ellipse for hero proportions

        // Cursor displacement (gentle, capped)
        const dx = mx - x, dy = my - y;
        const d2 = dx * dx + dy * dy;
        const max = 220;
        if (d2 < max * max) {
          const dist = Math.sqrt(d2) || 1;
          const force = (1 - dist / max) * 14;
          x -= (dx / dist) * force;
          y -= (dy / dist) * force;
        }

        n.x = x; n.y = y;
        n.glow = 0.55 + Math.sin(time * 0.0009 + i * 1.7) * 0.25;
      }

      // Clear
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      // Edges — soft gradient strokes, brighter where trust is higher
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        const b = nodes[(i + 1) % nodes.length];
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, rgba(accent, 0.04));
        grad.addColorStop(0.5, rgba(accent, 0.16 + trust * 0.18));
        grad.addColorStop(1, rgba(accent, 0.04));
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Particles flow along edges
      while (particles.length < target) spawn();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.t += p.speed * dt;
        if (p.t >= 1) { particles.splice(i, 1); continue; }
        const a = nodes[p.from], b = nodes[p.to];
        const x = a.x + (b.x - a.x) * p.t;
        const y = a.y + (b.y - a.y) * p.t;
        const fade = Math.sin(p.t * Math.PI); // 0 → 1 → 0
        ctx.fillStyle = rgba(accent, fade * 0.65);
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Nodes — soft glow + crisp core
      for (const n of nodes) {
        const r = 70 + n.glow * 22;
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
        g.addColorStop(0,    rgba(accent, 0.36 + n.glow * 0.18));
        g.addColorStop(0.45, rgba(dim,    0.10 + n.glow * 0.04));
        g.addColorStop(1,    rgba(accent, 0));
        ctx.fillStyle = g;
        ctx.fillRect(n.x - r, n.y - r, r * 2, r * 2);

        ctx.fillStyle = rgba(accent, 0.95);
        ctx.beginPath();
        ctx.arc(n.x, n.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      raf = visible && !reduced ? requestAnimationFrame(draw) : null;
    };

    // Pause when off-screen
    const io = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible && !reduced && raf == null) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    }, { threshold: 0 });
    io.observe(canvas);

    // Pause when tab hidden
    const onVis = () => {
      visible = !document.hidden;
      if (visible && !reduced && raf == null) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    // Resize
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Boot
    if (reduced) {
      // Static fallback: pre-warm particles to mid-flight, render one frame
      for (let i = 0; i < target; i++) {
        spawn();
        particles[particles.length - 1].t = 0.2 + Math.random() * 0.6;
      }
      draw(performance.now());
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("mousemove", onMouse);
    };
  }, [trustBps, allocationBps, converged]);

  return <canvas ref={canvasRef} className="consensus-field" aria-hidden="true" />;
}

/* --- helpers --- */
function parseHex(input: string): [number, number, number] {
  const s = input.trim();
  if (s.startsWith("rgb")) {
    const m = s.match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (m) return [+m[1], +m[2], +m[3]];
  }
  let h = s.replace("#", "");
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0, 82, 255]; // fall back to coinbase blue
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgba([r,g,b]: [number, number, number], a: number): string {
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}
