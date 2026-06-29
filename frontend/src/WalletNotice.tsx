import { useState } from "react";

// A refined, dismissible advisory at the top of the console. Tells stewards how
// to connect cleanly (MetaMask works after the one-time network prompt; Rabby
// works with zero setup). Dismissal persists so it never nags.
const DISMISS_KEY = "chronicle:wallet-notice:v1";

export function WalletNotice() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — just hide for this session */
    }
    setDismissed(true);
  };

  return (
    <aside className="wallet-notice" role="note" aria-label="Wallet connection tip">
      <span className="wn-chip" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v1.5" />
          <rect x="3" y="7" width="18" height="12" rx="2.5" />
          <path d="M16.4 13.25h.01" />
        </svg>
      </span>

      <div className="wn-text">
        <span className="wn-eyebrow">Connecting a wallet</span>
        <p className="wn-body">
          <b>MetaMask is supported</b> — just approve the one-time network prompt when you connect.
          If a signature ever stalls,{" "}
          <a className="wn-link" href="https://rabby.io" target="_blank" rel="noreferrer">
            Rabby Wallet
          </a>{" "}
          works out of the box, with no extra steps.
        </p>
      </div>

      <button className="wn-close" onClick={close} aria-label="Dismiss tip" title="Dismiss">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
        </svg>
      </button>
    </aside>
  );
}
