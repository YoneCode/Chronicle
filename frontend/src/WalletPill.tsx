import { useEffect, useRef, useState } from "react";
import { useWalletAuth } from "./useWalletAuth";
import { CHAIN_ID } from "./genlayer";
import { addrUrl } from "./lifecycle";

const RPC_URL = "https://rpc-bradbury.genlayer.com";
const ATTO = 10n ** 18n;

function shortAddr(a: string | undefined): string {
  if (!a) return "—";
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function gen(atto: bigint): string {
  const whole = atto / ATTO;
  const milli = (atto % ATTO) / (ATTO / 1000n);
  return `${whole.toString()}.${milli.toString().padStart(3, "0")}`;
}

/* Deterministic avatar: gradient seeded by the address. Returns inline-style background. */
function avatarStyle(addr: string | undefined): React.CSSProperties {
  if (!addr) return { background: "var(--ink-2)" };
  const hex = addr.replace("0x", "");
  const h1 = parseInt(hex.slice(0, 6) || "0", 16);
  const h2 = parseInt(hex.slice(6, 12) || "0", 16);
  const a = h1 % 360;
  const b = (h2 % 360 + 70) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 75% 45%))`,
  };
}

async function fetchBalance(addr: string): Promise<bigint | null> {
  try {
    const r = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [addr, "latest"] }),
    });
    const j = await r.json();
    if (j?.result) return BigInt(j.result);
    return null;
  } catch {
    return null;
  }
}

async function fetchChainId(): Promise<number | null> {
  try {
    const r = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const j = await r.json();
    if (j?.result) return Number(BigInt(j.result));
    return null;
  } catch {
    return null;
  }
}

export function WalletPill() {
  const w = useWalletAuth();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [walletChain, setWalletChain] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Resolve a real EVM address: prefer the connected wallet, then any linked
  // EOA the Privy user object exposes. Never fall through to the did:privy:…
  // identifier — that should never appear in UI.
  const resolveAddress = (): string | undefined => {
    const a = (w.wallet as any)?.address;
    if (typeof a === "string" && a.startsWith("0x")) return a;
    const u: any = w.user;
    if (u?.wallet?.address && String(u.wallet.address).startsWith("0x")) return u.wallet.address;
    if (Array.isArray(u?.linkedAccounts)) {
      const first = u.linkedAccounts.find((la: any) => typeof la?.address === "string" && la.address.startsWith("0x"));
      if (first?.address) return first.address;
    }
    return undefined;
  };
  const addr = resolveAddress();

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Poll balance + chain id every 30s while connected
  useEffect(() => {
    if (!w.authenticated || !addr) { setBalance(null); return; }
    let cancelled = false;
    const tick = async () => {
      const [b, cid] = await Promise.all([fetchBalance(addr), fetchChainId()]);
      if (!cancelled) { setBalance(b); setWalletChain(cid); }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [w.authenticated, addr]);

  // Try to switch the wallet to Bradbury if it's on a different chain
  async function switchToBradbury() {
    try { await w.wallet?.switchChain?.(CHAIN_ID); } catch { /* ignore */ }
  }

  if (!w.enabled) {
    return (
      <span className="wp-disabled" title="Set VITE_PRIVY_APP_ID to enable wallet connect">
        wallet disabled
      </span>
    );
  }

  if (!w.authenticated) {
    return (
      <button className="btn primary wp-connect" onClick={() => w.login()} disabled={!w.ready}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
          <path d="M11.5 8.5h-2a1.5 1.5 0 0 0 0 3" />
        </svg>
        {w.ready ? "Connect Wallet" : "Loading…"}
      </button>
    );
  }

  const onWrongChain = walletChain !== null && walletChain !== CHAIN_ID;

  return (
    <div className="wp" ref={ref}>
      <button className={`wp-trigger ${onWrongChain ? "warn" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="wp-avatar" style={avatarStyle(addr)} />
        <span className="wp-info">
          <span className="wp-bal tnum-counter">
            {balance === null ? "—" : `${gen(balance).split(".")[0]}.${gen(balance).split(".")[1]}`} <small>GEN</small>
          </span>
          <span className="wp-addr">{shortAddr(addr)}</span>
        </span>
        <span className={`wp-chain ${onWrongChain ? "warn" : "ok"}`} title={onWrongChain ? "Wrong network" : "Bradbury · 4221"}>
          <span className="wp-chain-dot" />
        </span>
        <svg className={`wp-caret ${open ? "open" : ""}`} width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3.5 6l4.5 4 4.5-4" />
        </svg>
      </button>

      {open && (
        <div className="wp-menu" role="menu">
          <div className="wp-menu-head">
            <span className="wp-avatar lg" style={avatarStyle(addr)} />
            <div>
              <div className="wp-fullname">Steward</div>
              <div className="wp-fulladdr" onClick={() => { if (addr) { navigator.clipboard?.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1200); } }}>
                {shortAddr(addr)}
                <span className="wp-copy">{copied ? "copied" : "copy"}</span>
              </div>
            </div>
          </div>

          <div className="wp-menu-stats">
            <div>
              <span className="wp-mlabel">Balance</span>
              <span className="wp-mval brass tnum-counter">{balance === null ? "—" : `${gen(balance)} GEN`}</span>
            </div>
            <div>
              <span className="wp-mlabel">Network</span>
              <span className={`wp-mval ${onWrongChain ? "warn" : ""}`}>
                {walletChain === null ? "checking…" : onWrongChain ? `wrong (${walletChain})` : "Bradbury · 4221"}
              </span>
            </div>
          </div>

          {onWrongChain && (
            <button className="wp-menu-row warn-row" onClick={switchToBradbury}>
              <span>Switch to Bradbury</span><span>↻</span>
            </button>
          )}
          <a className="wp-menu-row" href={addr ? addrUrl(addr) : "#"} target="_blank" rel="noreferrer">
            <span>View on explorer</span><span>↗</span>
          </a>
          <a className="wp-menu-row" href="https://testnet-faucet.genlayer.foundation/" target="_blank" rel="noreferrer">
            <span>Faucet</span><span>↗</span>
          </a>
          <button className="wp-menu-row danger" onClick={() => { w.logout(); setOpen(false); }}>
            <span>Disconnect</span><span>×</span>
          </button>
        </div>
      )}
    </div>
  );
}
