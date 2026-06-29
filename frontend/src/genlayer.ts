import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS || "") as `0x${string}`;
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || "4221");

// The GenLayer node rejects string JSON-RPC ids. Wallets (MetaMask, embedded)
// broadcast `eth_sendTransaction` through whatever RPC they have saved for the
// chain — and they send string ids. The same-origin /rpc proxy (a Cloudflare
// Pages Function) normalizes every id to an integer. So the wallet must be
// pointed at /rpc for this chain. In production that's `${origin}/rpc`; locally
// there's no Function, so use the node directly.
function chainRpcUrl(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const local = origin.includes("localhost") || origin.includes("127.0.0.1");
  return !origin || local ? "https://rpc-bradbury.genlayer.com" : `${origin}/rpc`;
}

const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

/**
 * Make the connected wallet use the /rpc proxy as its RPC for the GenLayer
 * chain, so its broadcasts go through id-normalization. We (re)register the
 * network via wallet_addEthereumChain pointing at the proxy, then switch to it.
 * Injected wallets (MetaMask) keep their own per-network RPC, so this is the
 * only way to route their broadcast through the proxy.
 */
async function ensureWalletNetwork(provider: any) {
  const rpc = chainRpcUrl();
  const params = {
    chainId: CHAIN_ID_HEX,
    chainName: "GenLayer Bradbury",
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: [rpc],
    blockExplorerUrls: ["https://explorer-bradbury.genlayer.com"],
  };
  try {
    await provider.request({ method: "wallet_addEthereumChain", params: [params] });
  } catch {
    /* already added / user dismissed — continue */
  }
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
  } catch {
    /* ignore */
  }
}

export type Covenant = {
  covenant_id: string;
  owner: string;
  mandate: string;
  capital_committed: bigint;
  capital_released: bigint;
  trust_gradient_bps: number;
  divergence_bps: number;
  epoch: number;
  status: string;
  reeval: boolean;
};

export type Checkpoint = {
  epoch: number;
  allocation_bps: number;
  released_delta: bigint;
  summary: string;
  converged: boolean;
};

// A single shared read-only client (ephemeral account; no wallet needed for views).
let _reader: ReturnType<typeof createClient> | null = null;
function reader() {
  if (!_reader) _reader = createClient({ chain: testnetBradbury, account: createAccount() });
  return _reader;
}

function ensureConfigured() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("VITE_CONTRACT_ADDRESS is not set. Deploy the contract and fill frontend/.env.");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRateLimit(e: any): boolean {
  const msg = (e?.message ?? String(e ?? "")).toLowerCase();
  return msg.includes("rate limit") || msg.includes("exceeds defined limit") || msg.includes("429") || msg.includes("-32429");
}

// Serialize all gen_call reads with a minimum gap so we stay under the RPC limit,
// and back off + retry when the node signals a rate limit.
const MIN_GAP_MS = 350;
const MAX_RETRIES = 4;
let queue: Promise<unknown> = Promise.resolve();

function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await task();
      } catch (e) {
        if (isRateLimit(e) && attempt < MAX_RETRIES) {
          await sleep(800 * Math.pow(2, attempt)); // 0.8s, 1.6s, 3.2s, 6.4s
          attempt++;
          continue;
        }
        throw e;
      } finally {
        await sleep(MIN_GAP_MS);
      }
    }
  });
  // Keep the queue chain alive regardless of individual failures.
  queue = run.then(() => undefined, () => undefined);
  return run as Promise<T>;
}

async function read<T>(functionName: string, args: any[] = []): Promise<T> {
  ensureConfigured();
  return schedule(async () => {
    return (await reader().readContract({
      address: CONTRACT_ADDRESS,
      functionName,
      args,
    })) as T;
  });
}

export const api = {
  getAdmin: () => read<any>("get_admin"),
  listCovenants: () => read<Covenant[]>("list_covenants"),
  getCovenant: (id: string) => read<Covenant>("get_covenant", [id]),
  getCheckpoints: (id: string) => read<Checkpoint[]>("get_checkpoints", [id]),
};

/**
 * Build a write-capable client from a connected Privy wallet.
 * Returns a function bound to the wallet's provider.
 */
export async function getWriteClient(wallet: any) {
  ensureConfigured();
  const provider = await wallet.getEthereumProvider();
  // Point the wallet's RPC for this chain at the id-normalizing /rpc proxy so
  // its broadcast doesn't hit the node with a string id.
  await ensureWalletNetwork(provider);
  try {
    await wallet.switchChain(CHAIN_ID);
  } catch {
    /* already handled by ensureWalletNetwork */
  }
  return createClient({
    chain: testnetBradbury,
    account: wallet.address as `0x${string}`,
    provider,
  } as any);
}

export async function writeContract(
  wallet: any,
  functionName: string,
  args: any[],
  value: bigint = 0n
): Promise<string> {
  const client = await getWriteClient(wallet);
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
  });
  // Best-effort: wait for acceptance if the client supports it.
  try {
    await (client as any).waitForTransactionReceipt?.({ hash, status: "ACCEPTED" });
  } catch {
    /* non-fatal */
  }
  return hash as string;
}
