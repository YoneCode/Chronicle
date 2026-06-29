import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import App from "./App";
import Landing from "./Landing";
import { PRIVY_ENABLED } from "./useWalletAuth";
import "./styles.css";

const privyAppId = (import.meta.env.VITE_PRIVY_APP_ID || "").trim();
const chainId = Number(import.meta.env.VITE_CHAIN_ID || "4221");

// Privy's wallet talks to the chain RPC with string JSON-RPC ids, which the
// GenLayer node rejects ("cannot unmarshal string into Request.id of type int").
// In production we route Privy through the same-origin /rpc proxy (a Cloudflare
// Pages Function) that normalizes every id to an integer. Local dev has no
// Function, so fall back to the node directly there.
const origin = typeof window !== "undefined" ? window.location.origin : "";
const isLocal = origin.includes("localhost") || origin.includes("127.0.0.1");
const walletRpc = !origin || isLocal ? "https://rpc-bradbury.genlayer.com" : `${origin}/rpc`;

const bradbury = {
  id: chainId,
  name: "GenLayer Bradbury",
  network: "genlayer-bradbury",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: [walletRpc] }, public: { http: [walletRpc] } },
  blockExplorers: { default: { name: "Explorer", url: "https://explorer-bradbury.genlayer.com" } },
};

function Console() {
  return PRIVY_ENABLED ? (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#d4af6e",
          walletList: ["metamask", "wallet_connect", "coinbase_wallet", "rainbow", "rabby_wallet"],
        },
        loginMethods: ["wallet", "email"],
        defaultChain: bradbury as any,
        supportedChains: [bradbury as any],
        embeddedWallets: { createOnLogin: "users-without-wallets" },
      }}
    >
      <App />
    </PrivyProvider>
  ) : (
    <App />
  );
}

function Root() {
  const [route, setRoute] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash;
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      if (typeof doc.startViewTransition === "function") {
        doc.startViewTransition(() => { flushSync(() => setRoute(next)); });
      } else {
        setRoute(next);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route.startsWith("#/console") ? <Console /> : <Landing />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
