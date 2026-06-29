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

// Use the official GenLayer Bradbury RPC, exactly like every other GenLayer
// dApp. Wallet signing goes through the GenLayer MetaMask Snap (installed by
// genlayer-js's client.connect), which handles GenLayer consensus submission.
const walletRpc = "https://rpc-bradbury.genlayer.com";

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
