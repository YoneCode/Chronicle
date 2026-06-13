import { usePrivy, useWallets } from "@privy-io/react-auth";

const rawAppId = (import.meta.env.VITE_PRIVY_APP_ID || "").trim();

// A valid Privy app id is a non-placeholder, reasonably long token.
export const PRIVY_ENABLED =
  rawAppId.length >= 20 && rawAppId !== "your_privy_app_id";

export type WalletAuth = {
  enabled: boolean;
  ready: boolean;
  authenticated: boolean;
  wallet: any | null;
  user: any | null;
  login: () => void;
  logout: () => void;
};

/**
 * Unified wallet hook. When Privy is not configured we avoid calling its hooks
 * entirely (PRIVY_ENABLED is a build-time constant, so hook order stays stable),
 * and the dashboard runs in read-only mode.
 */
export function useWalletAuth(): WalletAuth {
  if (!PRIVY_ENABLED) {
    return {
      enabled: false,
      ready: true,
      authenticated: false,
      wallet: null,
      user: null,
      login: () =>
        alert(
          "Wallet login is disabled. Set VITE_PRIVY_APP_ID in frontend/.env (from dashboard.privy.io) and reload."
        ),
      logout: () => {},
    };
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { ready, authenticated, login, logout, user } = usePrivy();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { wallets } = useWallets();
  return {
    enabled: true,
    ready,
    authenticated,
    user,
    wallet: wallets?.[0] ?? null,
    login,
    logout,
  };
}
