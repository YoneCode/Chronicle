import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWalletAuth } from "./useWalletAuth";
import { api, writeContract, getTxStatus, CONTRACT_ADDRESS, type Covenant, type Checkpoint } from "./genlayer";
import { gen, pct, fmtPct, bpsToPct, shortAddr, toBig, health } from "./format";
import { txUrl } from "./lifecycle";
import { Sigil, Strata, Engraving, Strand, MiniStrata } from "./charts";
import { WalletPill } from "./WalletPill";
import { WalletNotice } from "./WalletNotice";

const I = {
  docket: <svg className="rail-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 1.5h7l3 3v10H3z" /><path d="M10 1.5v3h3M5.5 8h5M5.5 11h5" /></svg>,
  ledger: <svg className="rail-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="2" width="12" height="12" rx="1.5" /><path d="M2 6h12M6 6v8" /></svg>,
  seal: <svg className="rail-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="6.5" r="4" /><path d="M5.5 10l-1 4 3.5-1.8L11.5 14l-1-4" /></svg>,
  shield: <svg className="rail-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M8 1.5l5.5 2v4c0 3-2.3 5.3-5.5 6.5C4.8 12.8 2.5 10.5 2.5 7.5v-4z" /></svg>,
  search: <svg className="f-ico" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5" /><path d="M11 11l3 3" /></svg>,
  plus: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M8 3v10M3 8h10" /></svg>,
};

const SEED = [
  "Deploy this treasury to maximize ecosystem resilience during systemic stress.",
  "Allocate funds toward projects that most meaningfully advance decentralized AI safety.",
  "Support communities under authentic socio-economic crisis.",
];

function resolveStewardAddress(w: ReturnType<typeof useWalletAuth>): string | undefined {
  const a = (w.wallet as any)?.address;
  if (typeof a === "string" && a.startsWith("0x")) return a;
  const u: any = w.user;
  if (u?.wallet?.address && String(u.wallet.address).startsWith("0x")) return u.wallet.address;
  if (Array.isArray(u?.linkedAccounts)) {
    const first = u.linkedAccounts.find((la: any) => typeof la?.address === "string" && la.address.startsWith("0x"));
    if (first?.address) return first.address;
  }
  return undefined;
}

export default function App() {
  const w = useWalletAuth();
  const [admin, setAdmin] = useState<any>(null);
  const [covenants, setCovenants] = useState<Covenant[]>([]);
  const [checks, setChecks] = useState<Record<string, Checkpoint[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ type: "register" | "fund"; id?: string } | null>(null);
  const [nav, setNav] = useState("docket");
  const inFlight = useRef(false);

  const configured = Boolean(CONTRACT_ADDRESS);
  const tolBps = admin?.tolerance_bps ?? 1500;

  const refresh = useCallback(async () => {
    if (!configured || inFlight.current) return;
    inFlight.current = true; setLoading(true); setError(null);
    try {
      const [a, list] = await Promise.all([api.getAdmin(), api.listCovenants()]);
      setAdmin(a);
      const cs = Array.isArray(list) ? list : [];
      setCovenants(cs);
      const entries = await Promise.all(cs.map(async (c) => [c.covenant_id, await api.getCheckpoints(c.covenant_id).catch(() => [])] as const));
      setChecks(Object.fromEntries(entries));
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setLoading(false); inFlight.current = false; }
  }, [configured]);

  useEffect(() => { refresh(); }, [refresh]);

  const latest = useCallback((id: string): { alloc: number; converged: boolean } => {
    const list = checks[id];
    if (list && list.length) { const k = list[list.length - 1]; return { alloc: k.allocation_bps, converged: k.converged }; }
    const c = covenants.find((x) => x.covenant_id === id);
    return { alloc: c ? pct(toBig(c.capital_released), toBig(c.capital_committed)) * 100 : 0, converged: true };
  }, [checks, covenants]);

  const m = useMemo(() => {
    const committed = covenants.reduce((s, c) => s + toBig(c.capital_committed), 0n);
    const released = covenants.reduce((s, c) => s + toBig(c.capital_released), 0n);
    const locked = committed - released;
    const active = covenants.filter((c) => c.status === "active").length;
    const paused = covenants.filter((c) => c.status === "paused").length;
    const allChecks = Object.values(checks).flat();
    const converged = allChecks.filter((k) => k.converged).length;
    const convergenceRate = allChecks.length ? (converged / allChecks.length) * 100 : 0;
    const avgTrust = covenants.length ? covenants.reduce((s, c) => s + (c.trust_gradient_bps ?? 0), 0) / covenants.length / 100 : 0;
    const breaches = covenants.filter((c) => (c.divergence_bps ?? 0) > tolBps);
    const reevalQ = covenants.filter((c) => c.reeval);
    const epochs = admin?.checkpoint_count ?? allChecks.length;
    return { committed, released, locked, active, paused, convergenceRate, avgTrust, breaches, reevalQ, epochs, allChecks };
  }, [covenants, checks, tolBps, admin]);

  const timeline = useMemo(() => {
    const items: Array<{ id: string; cp: Checkpoint }> = [];
    for (const [id, list] of Object.entries(checks)) for (const cp of list) items.push({ id, cp });
    return items.sort((a, b) => b.cp.epoch - a.cp.epoch).slice(0, 7);
  }, [checks]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? covenants.filter((c) => c.covenant_id.toLowerCase().includes(q) || c.mandate.toLowerCase().includes(q)) : covenants;
  }, [covenants, filter]);

  const active = useMemo(() => {
    if (!covenants.length) return null;
    if (selected) { const s = covenants.find((c) => c.covenant_id === selected); if (s) return s; }
    return [...covenants].sort((a, b) => (toBig(b.capital_committed) > toBig(a.capital_committed) ? 1 : -1))[0];
  }, [covenants, selected]);

  async function pollTx(hash: string, label: string) {
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      const s = await getTxStatus(hash);
      if (s === "ACCEPTED" || s === "FINALIZED") {
        setNotice(`${label} ${s.toLowerCase()} ✓`);
        await refresh();
        return;
      }
      if (s === "UNDETERMINED" || s === "CANCELED" || s === "LEADER_TIMEOUT") {
        setNotice(null);
        setError(`${label} didn't reach consensus (${s}). You can retry.`);
        return;
      }
      setNotice(`${label} · ${s.toLowerCase()}…`);
    }
    setNotice(`${label} still pending — track it on the explorer.`);
  }

  async function runWrite(fn: () => Promise<string>, label: string) {
    setError(null); setNotice(null); setTxHash(null);
    if (!w.authenticated || !w.wallet) { w.login(); return; }
    setBusy(true);
    setNotice(`Confirm "${label}" in your wallet…`);
    let hash: string;
    try {
      hash = await fn();
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      const rejected = /reject|denied|4001/i.test(raw);
      const idBug = /unmarshal string into|Request\.id of type int|RPC submit/i.test(raw);
      setError(
        rejected
          ? "Signature was rejected in your wallet."
          : idBug
            ? "Your wallet sent a request the GenLayer node rejected. Approve the GenLayer Snap when MetaMask prompts, or use Rabby."
            : raw,
      );
      setNotice(null);
      setBusy(false);
      return;
    }
    setBusy(false);
    setTxHash(hash);
    setNotice(`${label} submitted — pending consensus`);
    setDrawer(null);
    pollTx(hash, label).catch(() => {});
  }

  return (
    <div className="app">
      <aside className="rail">
        <div className="rail-brand" style={{ cursor: "pointer" }} onClick={() => { window.location.hash = ""; }}><div className="seal vt-seal">Ω</div><div><b>Chronicle</b><span>Chancery</span></div></div>
        <div className="rail-section">
          <div className="rail-label">Console</div>
          <NavLink id="docket" label="The Docket" icon={I.docket} active={nav} set={setNav} />
          <NavLink id="ledger" label="Covenant Ledger" icon={I.ledger} active={nav} set={setNav} />
          <NavLink id="activity" label="Attestations" icon={I.seal} active={nav} set={setNav} />
          <NavLink id="risk" label="Risk & Governance" icon={I.shield} active={nav} set={setNav} />
        </div>
        <div className="rail-foot">
          <div className="standing"><span className="ember" /> Bradbury · 4221 · standing</div>
          <div className="office">
            <div className="o-row"><span className="o-cap">{w.authenticated ? "Steward" : "Unattested"}</span>
              {w.authenticated ? <button className="btn tiny ghost" onClick={() => w.logout()}>Step down</button> : <button className="btn tiny primary" onClick={() => w.login()} disabled={!w.ready}>Attest</button>}</div>
            <div className="o-id">{w.authenticated ? shortAddr(resolveStewardAddress(w)) : "—"}</div>
            <div className="o-sub">Seal of office · {shortAddr(admin?.admin)}</div>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <div className="wrap">
          <WalletNotice />
          <header className="cmdbar" id="docket">
            <div className="cmd-title">
              <h1>The Covenant Chancery</h1>
              <p>{configured ? <>Vault <code>{shortAddr(CONTRACT_ADDRESS)}</code> · capital governed by evolving mandate</> : <>Configure <code>VITE_CONTRACT_ADDRESS</code></>}</p>
            </div>
            <div className="cmd-tools">
              <div className="figures">
                <div className="fig"><span className="fl">Epochs</span><span className="fv">{m.epochs}</span></div>
                <div className="fig"><span className="fl">Tolerance</span><span className="fv">±{fmtPct(bpsToPct(tolBps), 0)}</span></div>
              </div>
              <div className="filter">{I.search}<input placeholder="Search covenants" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
              <button className="btn ghost" onClick={() => refresh()} disabled={loading}>{loading ? "Syncing…" : "Sync"}</button>
              <button className="btn primary" onClick={() => setDrawer({ type: "register" })}>{I.plus} Draft Covenant</button>
              <WalletPill />
            </div>
          </header>

          {!w.enabled && <div className="banner info">Observation only — set <code>VITE_PRIVY_APP_ID</code> in <code>frontend/.env</code> to attest as steward and authorize epochs.</div>}
          {error && <div className="banner error">{error}</div>}
          {notice && (
            <div className="banner info">
              {busy && <span className="spin" aria-hidden />}
              <span>{notice}</span>
              {txHash && (
                <a className="banner-link" href={txUrl(txHash)} target="_blank" rel="noreferrer">
                  view on explorer ↗
                </a>
              )}
            </div>
          )}

          {/* ---- Docket: treasury vessel + active covenant instrument ---- */}
          <section className="docket">
            <div className="vessel">
              <Strata released={Number(m.released / (10n ** 15n)) / 1000} locked={Number(m.locked / (10n ** 15n)) / 1000} />
              <div className="vessel-figures">
                <div className="vf"><span className="l">Under mandate</span><span className="v tnum">{gen(m.committed, { compact: true })}</span></div>
                <div className="vf"><span className="l">Released</span><span className="v brass tnum">{gen(m.released, { compact: true })}</span></div>
                <div className="vf"><span className="l">Locked</span><span className="v hatch tnum">{gen(m.locked, { compact: true })}</span></div>
              </div>
            </div>
            <div className="docket-div" />
            {active ? (
              <div className="active-cov">
                <div className="ac-top">
                  <span className="ac-kicker">Covenant in focus</span>
                  <span className="ac-id">{active.covenant_id}</span>
                  <span className={`pill ${active.status}`}>{active.status}</span>
                  {active.reeval && <span className="reeval-flag">re-evaluation queued</span>}
                </div>
                <div className="ac-mandate">{active.mandate}</div>
                <div className="ac-meta">
                  <Sigil allocationBps={latest(active.covenant_id).alloc} converged={latest(active.covenant_id).converged} size={58} />
                  <div className="ac-stat"><span className="l">Committed</span><span className="v">{gen(active.capital_committed, { compact: true })} GEN</span></div>
                  <div className="ac-stat"><span className="l">Released</span><span className="v">{gen(active.capital_released, { compact: true })} GEN · epoch {active.epoch}</span></div>
                  <div className="ac-stat"><span className="l">Trust gradient</span><span className="v">{fmtPct(bpsToPct(active.trust_gradient_bps), 0)}</span></div>
                  <div className="ac-actions">
                    <button className="btn ghost" onClick={() => setDrawer({ type: "fund", id: active.covenant_id })}>Endow</button>
                    <button className="btn primary" onClick={() => runWrite(() => writeContract(w.wallet, "evaluate_epoch", [active.covenant_id]), `Epoch · ${active.covenant_id}`)}>Authorize Epoch</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="active-cov"><span className="ac-kicker">No covenant in force</span><div className="ac-mandate">Draft the first covenant to place capital under mandate.</div></div>
            )}
          </section>

          {/* ---- Quiet figure strip ---- */}
          <div className="strip">
            <div className="strip-cell"><span className="sl">Mandates in force</span><span className="sv">{m.active}<span className="muted" style={{ fontSize: 12 }}> / {covenants.length}</span></span><span className="ss">{m.paused} paused</span></div>
            <div className="strip-cell"><span className="sl">Capital deployed</span><span className="sv brass">{fmtPct(pct(m.released, m.committed), 1)}</span><span className="ss">of treasury</span></div>
            <div className="strip-cell"><span className="sl">Avg trust gradient</span><span className="sv">{fmtPct(m.avgTrust, 0)}</span><span className="ss">across mandates</span></div>
            <div className="strip-cell"><span className="sl">Consensus</span><span className={`sv ${m.convergenceRate >= 70 ? "ok" : m.convergenceRate >= 45 ? "warn" : ""}`}>{fmtPct(m.convergenceRate, 0)}</span><span className="ss">{m.allChecks.length} attestations</span></div>
            <div className="strip-cell"><span className="sl">Tolerance breaches</span><span className={`sv ${m.breaches.length ? "bad" : "ok"}`}>{m.breaches.length}</span><span className="ss">±{fmtPct(bpsToPct(tolBps), 0)} band</span></div>
          </div>

          <div className="body">
            <div className="col">
              <section className="panel" id="ledger">
                <div className="panel-h"><h2>Covenant Ledger</h2><div className="meta">{filtered.length} entered</div></div>
                {covenants.length === 0 ? (
                  <Onboarding configured={configured} connected={w.authenticated} onNew={() => setDrawer({ type: "register" })} onConnect={() => w.login()} />
                ) : (
                  <table className="ledger">
                    <thead><tr><th>Covenant</th><th>Standing</th><th>Allocation</th><th>Trust</th><th>Capital</th><th></th></tr></thead>
                    <tbody>
                      {filtered.map((c) => {
                        const h = health(c, tolBps); const l = latest(c.covenant_id);
                        const a = pct(toBig(c.capital_released), toBig(c.capital_committed));
                        return (
                          <tr key={c.covenant_id} className={selected === c.covenant_id ? "sel" : ""} onClick={() => setSelected(c.covenant_id)}>
                            <td><div className="cov-cell"><Sigil allocationBps={l.alloc} converged={l.converged} size={30} /><div style={{ minWidth: 0 }}><div className="cov-mandate">{c.mandate}</div><div className="cov-id">{c.covenant_id}{c.reeval && <span className="reeval-flag" style={{ marginLeft: 8 }}>re-eval</span>}</div></div></div></td>
                            <td><span className={`pill ${c.status}`}>{c.status}</span></td>
                            <td><div className="alloc-wrap"><MiniStrata released={toBig(c.capital_released)} committed={toBig(c.capital_committed)} /><span className="alloc-pct tnum">{fmtPct(a, 0)}</span></div></td>
                            <td><Engraving value={bpsToPct(c.trust_gradient_bps)} marker={100 - bpsToPct(tolBps)} /></td>
                            <td className="tnum" style={{ fontSize: 12 }}>{gen(c.capital_committed, { compact: true })}<span className="muted" style={{ fontSize: 10.5, display: "block" }}>epoch {c.epoch} · {h.label}</span></td>
                            <td className="row-actions">
                              <button className="btn tiny ghost" onClick={(e) => { e.stopPropagation(); setDrawer({ type: "fund", id: c.covenant_id }); }}>Endow</button>
                              <button className="btn tiny" onClick={(e) => { e.stopPropagation(); runWrite(() => writeContract(w.wallet, "evaluate_epoch", [c.covenant_id]), `Epoch · ${c.covenant_id}`); }}>Epoch</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            </div>

            <div className="col">
              <section className="panel" id="risk">
                <div className="panel-h"><h2>Governance</h2><div className="meta">3 validators</div></div>
                <div className="panel-pad gov">
                  <div className="gov-sigil"><Sigil allocationBps={m.convergenceRate * 100} converged={m.breaches.length === 0} size={96} /></div>
                  <div className="gov-stats">
                    <div className="gv-row"><span className="k">Convergence</span><span className="v">{fmtPct(m.convergenceRate, 0)}</span></div>
                    <div className="gv-row"><span className="k">Epochs sealed</span><span className="v">{m.epochs}</span></div>
                    <div className="gv-row"><span className="k">Avg trust</span><span className="v">{fmtPct(m.avgTrust, 0)}</span></div>
                    <div className="gv-row"><span className="k">Operator</span><span className="v">{shortAddr(admin?.operator)}</span></div>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-h"><h2>Risk Watch</h2></div>
                <div>
                  <div className="risk-item"><span className={`risk-key ${m.breaches.length ? "bad" : "ok"}`} /><div className="risk-b"><div className="rt">Tolerance breaches</div><div className="rs">Divergence beyond ±{fmtPct(bpsToPct(tolBps), 0)}</div></div><span className="risk-v">{m.breaches.length}</span></div>
                  <div className="risk-item"><span className={`risk-key ${m.reevalQ.length ? "warn" : "ok"}`} /><div className="risk-b"><div className="rt">Re-evaluation queue</div><div className="rs">Mandates flagged for review</div></div><span className="risk-v">{m.reevalQ.length}</span></div>
                  <div className="risk-item"><span className={`risk-key ${m.paused ? "warn" : "ok"}`} /><div className="risk-b"><div className="rt">Paused mandates</div><div className="rs">Capital held, no epochs</div></div><span className="risk-v">{m.paused}</span></div>
                </div>
              </section>

              <section className="panel" id="activity">
                <div className="panel-h"><h2>Attestations</h2><div className="meta">latest seals</div></div>
                {timeline.length === 0 ? (
                  <div className="att-empty">No epochs attested yet. Authorize an epoch to seal the first consensus.</div>
                ) : (
                  <div className="strand-list">
                    {timeline.map((t, i) => (
                      <div className="att" key={i}>
                        <Sigil allocationBps={t.cp.allocation_bps} converged={t.cp.converged} size={44} />
                        <div>
                          <div className="att-head"><b>{t.id}</b><span className="muted" style={{ fontSize: 11 }}>released {fmtPct(bpsToPct(t.cp.allocation_bps), 0)}</span><span className="ep">epoch {t.cp.epoch}</span></div>
                          <div className="att-sum">{t.cp.summary || (t.cp.converged ? "Validators reached consensus." : "Resolved by arbitration.")}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>

          <footer className="foot">
            <span>Chronicle Omega · sealed on GenLayer Bradbury</span>
            <a href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">View vault on explorer ↗</a>
          </footer>
        </div>
      </main>

      {drawer && (
        <Drawer drawer={drawer} covenants={covenants} onClose={() => setDrawer(null)}
          onRegister={(id, mandate) => runWrite(() => writeContract(w.wallet, "register_covenant", [id, mandate]), `Draft · ${id}`)}
          onFund={(id, amount) => runWrite(() => writeContract(w.wallet, "fund_covenant", [id], BigInt(Math.round(amount * 1000)) * (10n ** 15n)), `Endow · ${id}`)} />
      )}
    </div>
  );
}

function NavLink({ id, label, icon, active, set }: { id: string; label: string; icon: JSX.Element; active: string; set: (s: string) => void }) {
  return (
    <button className={`rail-link ${active === id ? "active" : ""}`} onClick={() => {
      set(id);
      if (id === "docket") window.scrollTo({ top: 0, behavior: "smooth" });
      else document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }}>{icon} {label}</button>
  );
}

function Onboarding({ configured, connected, onNew, onConnect }: { configured: boolean; connected: boolean; onNew: () => void; onConnect: () => void }) {
  const steps = [
    { n: 1, t: "Attest as steward", d: "Authenticate the wallet that holds the seal of office.", done: connected, active: !connected },
    { n: 2, t: "Draft a covenant", d: "Commit capital under a natural-language mandate.", done: false, active: connected },
    { n: 3, t: "Endow the mandate", d: "Deposit GEN to place capital under the covenant.", done: false, active: false },
    { n: 4, t: "Authorize an epoch", d: "Validators interpret the mandate and seal consensus.", done: false, active: false },
  ];
  return (
    <div className="onboard">
      <div><h3>No covenants entered into the ledger</h3><p>Chronicle Omega governs capital with evolving, AI-adjudicated mandates. Draft the first covenant to begin recording on-chain semantic consensus.</p></div>
      <div className="steps">{steps.map((s) => (<div key={s.n} className={`step ${s.done ? "done" : ""} ${s.active ? "active" : ""}`}><div className="s-n">{s.done ? "✓" : s.n}</div><h4>{s.t}</h4><p>{s.d}</p></div>))}</div>
      <div>{!connected ? <button className="btn primary" onClick={onConnect}>Attest as steward</button> : <button className="btn primary" onClick={onNew} disabled={!configured}>Draft first covenant</button>}</div>
    </div>
  );
}

function Drawer({ drawer, covenants, onClose, onRegister, onFund }: {
  drawer: { type: "register" | "fund"; id?: string }; covenants: Covenant[]; onClose: () => void;
  onRegister: (id: string, mandate: string) => void; onFund: (id: string, amount: number) => void;
}) {
  const [id, setId] = useState(drawer.id ?? "");
  const [mandate, setMandate] = useState("");
  const [amount, setAmount] = useState("");
  const isReg = drawer.type === "register";
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-h"><h3>{isReg ? "Draft Covenant" : "Endow Covenant"}</h3><button className="btn icon ghost x" onClick={onClose}>✕</button></div>
        <div className="drawer-b">
          {isReg ? (
            <>
              <div className="field"><label>Covenant ID</label><input value={id} onChange={(e) => setId(e.target.value)} placeholder="treasury-resilience-01" /><span className="hint">Unique identifier, up to 128 characters.</span></div>
              <div className="field"><label>Mandate</label><textarea value={mandate} onChange={(e) => setMandate(e.target.value)} placeholder="Deploy this treasury to…" /></div>
              <div className="field"><label>Precedents</label><div className="preset">{SEED.map((s, i) => <button key={i} onClick={() => setMandate(s)}>“{s}”</button>)}</div></div>
            </>
          ) : (
            <>
              <div className="field"><label>Covenant</label><select value={id} onChange={(e) => setId(e.target.value)}><option value="">Select mandate…</option>{covenants.map((c) => <option key={c.covenant_id} value={c.covenant_id}>{c.covenant_id}</option>)}</select></div>
              <div className="field"><label>Endowment (GEN)</label><input type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1.000" /><span className="hint">Sent as a payable deposit, held at atto-scale.</span></div>
            </>
          )}
        </div>
        <div className="drawer-f">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          {isReg
            ? <button className="btn primary" disabled={!id.trim() || !mandate.trim()} onClick={() => onRegister(id.trim(), mandate.trim())}>Seal covenant</button>
            : <button className="btn primary" disabled={!id || !amount || Number(amount) <= 0} onClick={() => onFund(id, Number(amount))}>Endow</button>}
        </div>
      </div>
    </>
  );
}
