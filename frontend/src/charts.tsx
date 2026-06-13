// "Covenant Chancery" signature visuals — bespoke SVG, archival/juridical.
// The attestation sigil is the recurring mark; capital strata is the treasury vessel.

/* ---- Attestation Sigil ----
   A consensus seal: hairline ring, an engraved allocation arc, quorum marks
   around the rim (verdigris when converged, amber when not), allocation % in
   the center. Recurs at three scales (row · strand · governance). */
export function Sigil({
  allocationBps,
  converged,
  quorum = 3,
  size = 44,
  drawOn = false,
  vtName,
}: {
  allocationBps: number;
  converged: boolean;
  quorum?: number;
  size?: number;
  drawOn?: boolean;
  vtName?: string;
}) {
  const stroke = Math.max(2, size * 0.055);
  const r = size / 2 - stroke * 1.4;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, allocationBps / 10000));
  const arc = c * frac;
  const cx = size / 2;
  const mark = converged ? "var(--verdigris)" : "var(--amber)";
  const rimR = r + stroke * 1.1;
  const dots = Array.from({ length: quorum }, (_, i) => {
    const a = (-90 + (360 / quorum) * i) * (Math.PI / 180);
    return { x: cx + rimR * Math.cos(a), y: cx + rimR * Math.sin(a) };
  });
  const showNum = size >= 40;
  const styleVar = drawOn ? ({ "--c": c, "--arc": arc } as React.CSSProperties) : undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`sigil${drawOn ? " sigil-draw" : ""}`}
      style={vtName ? { viewTransitionName: vtName, ...(styleVar ?? {}) } : styleVar}
    >
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--rule)" strokeWidth={stroke} className="sigil-rim" />
      <circle
        cx={cx} cy={cx} r={r} fill="none"
        pathLength="100"
        stroke={converged ? "var(--verdigris)" : "var(--brass)"}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray="100"
        transform={`rotate(-90 ${cx} ${cx})`}
        className="sigil-arc"
        style={{
          strokeDashoffset: 100 - frac * 100,
          transition: "stroke-dashoffset .5s cubic-bezier(.2,.7,.2,1)",
          ["--arc-end" as string]: `${100 - frac * 100}`,
        } as React.CSSProperties}
      />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={Math.max(1.3, size * 0.045)} fill={mark} className="sigil-dot" style={{ animationDelay: `${600 + i * 110}ms` }} />
      ))}
      {showNum && (
        <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" className="sigil-num" style={{ fontSize: size * 0.26 }}>
          {Math.round(frac * 100)}
        </text>
      )}
    </svg>
  );
}

/* ---- Capital Strata ----
   The treasury as a vertical vessel: brass "released" rises from the base,
   cross-hatched "locked" sits above, a hairline waterline marks the level. */
export function Strata({ released, locked, w = 74, h = 168, scrollFill = false }: { released: number; locked: number; w?: number; h?: number; scrollFill?: boolean }) {
  const total = released + locked;
  const frac = total > 0 ? released / total : 0;
  const pad = 3;
  const innerH = h - pad * 2;
  const fillH = innerH * frac;
  const fillY = pad + (innerH - fillH);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`strata${scrollFill ? " strata-scroll" : ""}`}>
      <defs>
        <pattern id="hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--vellum-3)" strokeWidth="1" opacity="0.5" />
        </pattern>
        <clipPath id="vessel"><rect x="1" y="1" width={w - 2} height={h - 2} rx="6" /></clipPath>
      </defs>
      <g clipPath="url(#vessel)">
        <rect x="0" y="0" width={w} height={h} fill="var(--ink-2)" />
        <rect x="0" y={pad} width={w} height={innerH - fillH} fill="url(#hatch)" />
        <rect className="strata-fill" x="0" y={fillY} width={w} height={fillH} fill="var(--brass)" opacity="0.92"
          style={{ transition: "y .6s cubic-bezier(.2,.7,.2,1), height .6s cubic-bezier(.2,.7,.2,1)" }} />
        <line x1="0" y1={fillY} x2={w} y2={fillY} stroke="var(--vellum-0)" strokeWidth="1" opacity="0.5" />
      </g>
      <rect x="1" y="1" width={w - 2} height={h - 2} rx="6" fill="none" stroke="var(--rule-2)" />
    </svg>
  );
}

export function Engraving({ value, marker }: { value: number; marker?: number }) {
  return (
    <div className="engrave">
      <div className="engrave-fill" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      {marker !== undefined && <div className="engrave-notch" style={{ left: `${Math.min(100, marker)}%` }} />}
    </div>
  );
}

export function Strand({ points, w = 150, h = 34 }: { points: number[]; w?: number; h?: number }) {
  if (!points.length) {
    return <svg width={w} height={h} className="strand"><line x1="0" y1={h - 3} x2={w} y2={h - 3} stroke="var(--rule)" strokeDasharray="2 4" /></svg>;
  }
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((p - min) / span) * (h - 6) - 3).toFixed(1)}`).join(" ");
  const lx = (points.length - 1) * step;
  const ly = h - ((points[points.length - 1] - min) / span) * (h - 6) - 3;
  return (
    <svg width={w} height={h} className="strand" viewBox={`0 0 ${w} ${h}`}>
      <path d={d} fill="none" stroke="var(--brass)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.3" fill="var(--verdigris)" />
    </svg>
  );
}

export function MiniStrata({ released, committed }: { released: bigint; committed: bigint }) {
  const frac = committed > 0n ? Number((released * 1000n) / committed) / 1000 : 0;
  return (
    <div className="ministrata">
      <div className="ministrata-fill" style={{ width: `${Math.min(100, frac * 100)}%` }} />
    </div>
  );
}
