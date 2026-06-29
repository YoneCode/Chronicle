import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS || "") as `0x${string}`;
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || "4221");

const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

// MetaMask broadcasts with string JSON-RPC ids, which the GenLayer node rejects
// ("cannot unmarshal string into Request.id of type int"). The same-origin /rpc
// proxy (a Cloudflare Pages Function) rewrites every id to an integer before
// forwarding to the node, so the wallet's broadcast is accepted. We point the
// wallet's chain RPC at it. Locally there's no Function, so use the node.
function chainRpcUrl(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const local = origin.includes("localhost") || origin.includes("127.0.0.1");
  return !origin || local ? "https://rpc-bradbury.genlayer.com" : `${origin}/rpc`;
}

async function ensureWalletNetwork(provider: any) {
  const params = {
    chainId: CHAIN_ID_HEX,
    chainName: "GenLayer Bradbury",
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: [chainRpcUrl()],
    blockExplorerUrls: ["https://explorer-bradbury.genlayer.com"],
  };
  try {
    await provider.request({ method: "wallet_addEthereumChain", params: [params] });
  } catch { /* exists / dismissed */ }
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
  } catch { /* ignore */ }
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
  const address = wallet.address as `0x${string}`;
  const provider = await wallet.getEthereumProvider();
  // Point the wallet's chain RPC at the /rpc proxy so its broadcast carries an
  // integer json-rpc id the GenLayer node accepts. (MetaMask sends string ids;
  // the node rejects them. The proxy normalizes every id.)
  await ensureWalletNetwork(provider);
  return createClient({ chain: testnetBradbury, account: address, provider } as any);
}

/** Lightweight status read for polling a submitted tx (no blocking). */
export async function getTxStatus(hash: string): Promise<string> {
  try {
    const r: any = await reader().getTransaction({ hash: hash as any });
    return (r?.statusName ?? r?.status ?? "PENDING") as string;
  } catch {
    return "PENDING";
  }
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
  // Return immediately — do NOT block on consensus. The caller shows the hash
  // and polls status via getTxStatus so the UI never hangs on slow finality.
  return hash as string;
}
