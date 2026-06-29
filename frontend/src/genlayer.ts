import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS || "") as `0x${string}`;
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || "4221");

// Broadcast endpoint that guarantees an INTEGER json-rpc id (the GenLayer node
// rejects string ids). In production this is the same-origin /rpc proxy
// (Cloudflare Pages Function); locally we hit the node directly.
function broadcastRpc(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const local = origin.includes("localhost") || origin.includes("127.0.0.1");
  return !origin || local ? "https://rpc-bradbury.genlayer.com" : `${origin}/rpc`;
}

async function sendRawViaProxy(raw: string): Promise<string> {
  const res = await fetch(broadcastRpc(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [raw] }),
  });
  const data = await res.json();
  if (data?.error) throw data.error;
  return data.result as string;
}

/**
 * Wrap an embedded-wallet (Privy) EIP-1193 provider.
 *
 * Privy broadcasts `eth_sendTransaction` through its OWN relay using a string
 * json-rpc id, which the GenLayer node refuses ("cannot unmarshal string into
 * Request.id of type int"), so wallet-signed txs never land. We can't change
 * Privy's relay or its id format.
 *
 * Fix: intercept `eth_sendTransaction`. Have the wallet only SIGN the
 * fully-formed tx via `eth_signTransaction` (offline — genlayer-js already
 * supplies nonce/gas/gasPrice/chainId), then broadcast the raw signed tx
 * ourselves with an integer id. Everything else passes through.
 */
function wrapWalletProvider(provider: any) {
  return {
    ...provider,
    async request(args: { method: string; params?: any[] }) {
      if (args?.method !== "eth_sendTransaction") {
        return provider.request(args);
      }
      console.warn("[GL] intercept eth_sendTransaction; trying eth_signTransaction…");
      let signed: any;
      try {
        signed = await provider.request({ method: "eth_signTransaction", params: args.params ?? [] });
        console.warn("[GL] eth_signTransaction OK; type=", typeof signed, "value=", signed);
      } catch (e: any) {
        console.warn("[GL] eth_signTransaction FAILED:", e?.message ?? e, e);
        const msg = String(e?.message ?? e?.data?.message ?? e?.data ?? "").toLowerCase();
        // Only wallets that genuinely can't sign-only (e.g. MetaMask, which already
        // uses integer ids) fall back to their own broadcast.
        if (msg.includes("not support") || msg.includes("unsupported") || msg.includes("method not") || msg.includes("not available") || msg.includes("invalid") || msg.includes("unknown")) {
          console.warn("[GL] falling back to wallet eth_sendTransaction broadcast");
          return provider.request(args);
        }
        throw e;
      }
      const raw =
        typeof signed === "string"
          ? signed
          : signed?.raw ?? signed?.rawTransaction ?? signed?.serialized ?? signed?.signedTransaction ?? signed?.signature;
      if (typeof raw !== "string" || !raw.startsWith("0x")) {
        throw new Error("Wallet returned an unexpected signed-transaction format; cannot broadcast.");
      }
      console.warn("[GL] broadcasting raw via", broadcastRpc());
      return sendRawViaProxy(raw);
    },
  };
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
  // Make sure the wallet is on the GenLayer chain before signing.
  try {
    await wallet.switchChain(CHAIN_ID);
  } catch {
    /* some wallets auto-handle the chain; ignore */
  }
  const provider = await wallet.getEthereumProvider();
  return createClient({
    chain: testnetBradbury,
    account: wallet.address as `0x${string}`,
    provider: wrapWalletProvider(provider),
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
