import { useEffect, useMemo, useRef, useState } from "react";
import { api, CONTRACT_ADDRESS, type Covenant } from "./genlayer";
import { gen, fmtPct, bpsToPct, shortAddr, toBig } from "./format";
import { Sigil, Strata } from "./charts";
import { useCountUp } from "./useCountUp";
import { ConsensusField } from "./ConsensusField";
import { addrUrl, buildLifecycle, txUrl, VAULT_DEPLOY_TX } from "./lifecycle";

const EXPLORER = `https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESS}`;
const ATTO = 10n ** 18n;

type Line = { pip?: "ok"; method: string; value: string };

function buildStream(admin: any, covenants: Covenant[] | null, latencyMs: number): Line[] {
  const lines: Line[] = [];
  if (admin) {
    lines.push({ pip: "ok", method: "gen_call get_admin", value: `tolerance ${fmtPct(bpsToPct(admin.tolerance_bps), 2)}` });
    lines.push({ method: "gen_call get_admin", value: `covenants ${admin.covenant_count} · checkpoints ${admin.checkpoint_count}` });
  }
  if (covenants && covenants.length) {
    const c = covenants[0];
    lines.push({ pip: "ok", method: "gen_call list_covenants", value: `${c.covenant_id} · ${gen(c.capital_committed, { compact: true })} GEN · trust ${fmtPct(bpsToPct(c.trust_gradient_bps), 0)}` });
    lines.push({ method: "gen_call get_covenant", value: `epoch ${c.epoch} · ${c.status}` });
  }
  lines.push({ pip: "ok", method: "vault", value: `${shortAddr(CONTRACT_ADDRESS)} · Bradbury · chain 4221` });
  lines.push({ method: "rpc latency", value: `${Math.max(1, Math.round(latencyMs))}ms` });
  return lines;
}

export default function Landing() {
  const [admin, setAdmin] = useState<any>(null);
  const [covenants, setCovenants] = useState<Covenant[] | null>(null);
  const [fetchMs, setFetchMs] = useState<number>(0);
  const t0 = useRef(performance.now());

  useEffect(() => {
    let on = true;
    (async () => {
      const start = performance.now();
      const [a, list] = await Promise.all([api.getAdmin().catch(() => null), api.listCovenants().catch(() => [])]);
      const dur = performance.now() - start;
      if (!on) return;
      setAdmin(a);
      setCovenants(Array.isArray(list) ? list : []);
      setFetchMs(dur);
    })();
    return () => { on = false; };
  }, []);

  const committedAtto = (covenants ?? []).reduce((s, c) => s + toBig(c.capital_committed), 0n);
  const releasedAtto = (covenants ?? []).reduce((s, c) => s + toBig(c.capital_released), 0n);
  const lockedAtto = committedAtto - releasedAtto;
  // Animate the headline number — divide by 10^15 first to keep it a Number
  const committedDisplay = Number(committedAtto / (ATTO / 1000n)) / 1000;
  const animatedCommitted = useCountUp(covenants === null ? null : committedDisplay, fetchMs);
  const animatedCovenants = useCountUp(covenants === null ? null : covenants.length, fetchMs, { min: 500, max: 1400 });
  const animatedTolerance = useCountUp(admin === null ? null : Number(admin?.tolerance_bps) / 100, fetchMs, { min: 500, max: 1400 });
  const featured = (covenants ?? []).slice().sort((a, b) => (toBig(b.capital_committed) > toBig(a.capital_committed) ? 1 : -1))[0] ?? null;

  const stream = useMemo(() => buildStream(admin, covenants, fetchMs), [admin, covenants, fetchMs]);

  const enter = (e?: React.MouseEvent) => {
    e?.preventDefault();
    window.location.hash = "#/console";
  };

  const formatNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

  return (
    <div className="lp">
      {/* C · live RPC stream — duplicated track for seamless loop */}
      <div className="lp-stream" aria-hidden>
        <div className="lp-stream-track">
          {[...stream, ...stream].map((l, i) => (
            <span key={i} className="lp-stream-line">
              <span className={`pip${l.pip === "ok" ? " ok" : ""}`} />
              {l.method} <span className="arrow">→</span> <span className="v">{l.value}</span>
            </span>
          ))}
        </div>
      </div>

      <nav className="lp-nav">
        <div className="lp-nav-in">
          <div className="lp-brand">
            <img className="seal-img" src="/logo.svg" alt="Chronicle Omega" width="40" height="40" />
            <div><b>Chronicle Omega</b><span>Covenant Vault</span></div>
          </div>
          <div className="lp-nav-links">
            <a href="#how">How it works</a>
            <a href={EXPLORER} target="_blank" rel="noreferrer">Explorer ↗</a>
            <a className="lp-icon" href="https://github.com/YoneCode/Chronicle" target="_blank" rel="noreferrer" aria-label="GitHub">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-1.96c-3.2.69-3.88-1.54-3.88-1.54-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18.91-.25 1.89-.38 2.86-.38.97 0 1.95.13 2.86.38 2.18-1.49 3.14-1.18 3.14-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.07.78 2.16v3.2c0 .31.21.68.8.56C20.71 21.39 24 17.08 24 12 24 5.65 18.85.5 12 .5z"/></svg>
            </a>
            <a className="lp-icon" href="https://x.com/YoneCode" target="_blank" rel="noreferrer" aria-label="X / Twitter">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2H21l-6.522 7.453L22 22h-6.844l-5.36-7.012L3.6 22H1l7.04-8.043L1.6 2h7.02l4.85 6.41L18.244 2zm-2.4 18.4h1.86L7.243 3.51H5.27l10.575 16.89z"/></svg>
            </a>
            <button className="btn primary" onClick={enter}>Enter the Vault</button>
          </div>
        </div>
      </nav>

      <div className="lp-inner">
        <header className="lp-hero">
          <ConsensusField
            trustBps={featured ? featured.trust_gradient_bps : (admin?.tolerance_bps ?? 5000)}
            allocationBps={committedAtto > 0n ? Math.round((Number(releasedAtto) / Number(committedAtto)) * 10000) : 0}
            converged={covenants !== null && covenants.length > 0}
          />
          <div>
            <span className="lp-eyebrow"><span className="dot" /> Live on GenLayer Bradbury · 4221</span>
            <h1 className="lp-h1">Capital governed by an <em>evolving mandate</em>, not by frozen code.</h1>
            <p className="lp-sub">
              Chronicle Omega locks capital under a long-horizon, natural-language covenant. Each
              epoch, GenLayer validators independently re-interpret the mandate with an LLM and
              converge on how much to release — recorded on-chain as an auditable attestation.
            </p>
            <div className="lp-cta-row">
              <button className="btn primary" onClick={enter}>Open the console</button>
              <a className="btn ghost" href={EXPLORER} target="_blank" rel="noreferrer">View the vault</a>
            </div>
            <div className="lp-figs">
              <div className="lp-fig">
                <div className="l">Covenants in force</div>
                <div className="v tnum-counter">{covenants === null ? "—" : Math.round(animatedCovenants)}</div>
              </div>
              <div className="lp-fig">
                <div className="l">Under mandate</div>
                <div className="v brass tnum-counter">
                  {covenants === null ? "—" : formatNum(animatedCommitted)}
                  <span style={{ fontSize: 12 }}> GEN</span>
                </div>
              </div>
              <div className="lp-fig">
                <div className="l">Tolerance band</div>
                <div className="v tnum-counter">{admin === null ? "—" : `±${animatedTolerance.toFixed(0)}%`}</div>
              </div>
            </div>
          </div>

          <aside className="lp-instrument flagship">
            <span className="fl-live"><span className="pulse-dot" /> Live · Bradbury 4221</span>

            <div className="fl-header">
              <Sigil
                allocationBps={featured ? Math.round((Number(releasedAtto) / Math.max(1, Number(committedAtto))) * 10000) : 0}
                converged={covenants !== null && covenants.length > 0}
                size={72}
                drawOn
                vtName="seal"
              />
              <div className="fl-id">
                <h3 className="name">{featured ? featured.covenant_id : "no covenant yet"}</h3>
                <div className="row">
                  {featured && <span className={`pill ${featured.status}`}>{featured.status}</span>}
                  <a href={addrUrl(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer" className="muted" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                    {shortAddr(CONTRACT_ADDRESS)} ↗
                  </a>
                </div>
              </div>
              <div className="fl-quorum" title="3-validator quorum">
                <span className="fl-quorum-dots"><span /><span /><span /></span>
                3 validators
              </div>
            </div>

            {featured ? (
              <p className="fl-mandate">{featured.mandate}</p>
            ) : (
              <p className="fl-mandate" style={{ color: "var(--vellum-2)" }}>
                {covenants === null ? "Reading the ledger…" : "Open the console to draft the first mandate and put capital under it."}
              </p>
            )}

            <div className="fl-metrics">
              <div className="fl-metric">
                <span className="l">Capital committed</span>
                <span className="v brass">{featured ? gen(featured.capital_committed, { compact: true }) : "0.000"} <small>GEN</small></span>
              </div>
              <div className="fl-metric">
                <span className="l">Capital released</span>
                <span className="v dim">{featured ? gen(featured.capital_released, { compact: true }) : "0.000"} <small>GEN</small></span>
              </div>
              <div className="fl-metric">
                <span className="l">Trust gradient</span>
                <span className="v">{featured ? fmtPct(bpsToPct(featured.trust_gradient_bps), 0) : "—"}</span>
              </div>
              <div className="fl-metric">
                <span className="l">Epoch</span>
                <span className="v">
                  {featured ? featured.epoch : "—"}
                  <small>{featured?.reeval ? "re-eval queued" : "active"}</small>
                </span>
              </div>
            </div>

            {featured && (
              <div className="fl-progress">
                <div className="fl-progress-row">
                  <span>Allocation deployed</span>
                  <span className="tnum-counter">
                    {fmtPct(committedAtto > 0n ? (Number(releasedAtto) / Number(committedAtto)) * 100 : 0, 1)}
                  </span>
                </div>
                <div className="fl-progress-bar">
                  <div
                    className="fl-progress-fill"
                    style={{ width: `${committedAtto > 0n ? Math.min(100, (Number(releasedAtto) / Number(committedAtto)) * 100) : 0}%` }}
                  />
                </div>
                <div className="fl-progress-row">
                  <span style={{ color: "var(--vellum-3)" }}>{gen(releasedAtto, { compact: true })} GEN released of {gen(committedAtto, { compact: true })} GEN</span>
                  <span style={{ color: "var(--vellum-3)" }}>±{fmtPct(bpsToPct(admin?.tolerance_bps ?? 1500), 0)} band</span>
                </div>
              </div>
            )}

            <div className="fl-activity">
              <div className="fl-activity-head">
                <span>On-chain lifecycle</span>
                <a href={addrUrl(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">all txs ↗</a>
              </div>
              {buildLifecycle({
                hasCovenants: !!(covenants && covenants.length),
                capitalCommittedAtto: committedAtto,
                epoch: featured?.epoch ?? 0,
              }).map((step) => (
                <a key={step.key} className={`fl-act ${step.status}`} href={step.href} target="_blank" rel="noreferrer">
                  <span className="dot" />
                  <div className="body">
                    <div className="title">{step.label}</div>
                    <div className="meta">
                      {step.txHash ? `${shortAddr(step.txHash)} · ` : ""}{step.meta}
                    </div>
                  </div>
                  <span className="arrow">↗</span>
                </a>
              ))}
            </div>

            <div className="fl-footer">
              <button className="btn primary" onClick={enter}>Authorize next epoch</button>
              <a className="btn ghost" href={txUrl(VAULT_DEPLOY_TX)} target="_blank" rel="noreferrer">Deploy tx ↗</a>
            </div>
          </aside>
        </header>

        <section className="lp-section">
          <span className="lp-kicker">A new primitive</span>
          <h2 className="lp-h2">Recursive Semantic Capital</h2>
          <p className="lp-lead">Release conditions that cannot be written in Solidity — adjudicated by model-diverse validators, bounded by an explicit tolerance band, and anchored as on-chain checkpoints.</p>
          <div className="lp-cards">
            <div className="lp-card"><Sigil allocationBps={6800} converged size={40} /><h3>Mandates, not predicates</h3><p>Capital is committed under a natural-language covenant. Its meaning is re-read each epoch rather than frozen at deploy time.</p></div>
            <div className="lp-card"><Sigil allocationBps={4200} converged={false} size={40} /><h3>Consensus on meaning</h3><p>Validators independently interpret the mandate with an LLM and must agree on an allocation within a tolerance band, or rotate.</p></div>
            <div className="lp-card"><Sigil allocationBps={9000} converged size={40} /><h3>Auditable attestations</h3><p>Every epoch records an allocation, a rationale, and a convergence seal — a permanent, inspectable history.</p></div>
          </div>
        </section>

        <section className="lp-section" id="how">
          <span className="lp-kicker">Lifecycle</span>
          <h2 className="lp-h2">From mandate to release</h2>
          <div className="lp-steps">
            <div className="lp-step"><div className="sn">i.</div><h4>Draft covenant</h4><p>Commit capital under a long-horizon mandate written in plain language.</p></div>
            <div className="lp-step"><div className="sn">ii.</div><h4>Endow</h4><p>Deposit GEN into the covenant; funds are held at atto-scale precision.</p></div>
            <div className="lp-step"><div className="sn">iii.</div><h4>Authorize epoch</h4><p>Validators re-interpret the mandate against fresh context and converge on a ratio.</p></div>
            <div className="lp-step"><div className="sn">iv.</div><h4>Release &amp; attest</h4><p>The released portion and a consensus checkpoint are sealed on-chain.</p></div>
          </div>
        </section>

        <section className="lp-section">
          <span className="lp-kicker">Live on-chain</span>
          <h2 className="lp-h2">Not a demo dataset</h2>
          <p className="lp-lead">Every figure on this page is read directly from the deployed vault on GenLayer Bradbury.</p>
          <div className="lp-live">
            <div className="lp-live-figs">
              <div><div className="l">Vault</div><div className="v addr"><code>{shortAddr(CONTRACT_ADDRESS)}</code></div></div>
              <div><div className="l">Network</div><div className="v">Bradbury · 4221</div></div>
              <div><div className="l">Covenants</div><div className="v">{covenants ? covenants.length : "—"}</div></div>
              <div><div className="l">Committed</div><div className="v brass">{covenants ? `${gen(committedAtto, { compact: true })} GEN` : "—"}</div></div>
              <div><div className="l">Operator</div><div className="v addr"><code>{shortAddr(admin?.operator)}</code></div></div>
            </div>
            <button className="btn primary" onClick={enter}>Enter the Vault</button>
          </div>
        </section>

        <footer className="lp-foot">
          <span className="serif">Chronicle Omega · sealed on GenLayer Bradbury</span>
          <a href={EXPLORER} target="_blank" rel="noreferrer">{shortAddr(CONTRACT_ADDRESS)} ↗</a>
        </footer>
      </div>
    </div>
  );
}
