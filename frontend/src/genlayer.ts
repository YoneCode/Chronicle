import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS || "") as `0x${string}`;
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || "4221");

// GenLayer Bradbury RPC. The Go node here strictly requires an INTEGER
// JSON-RPC `id`. We broadcast raw transactions through this endpoint ourselves
// (with an integer id) instead of letting the wallet's RPC layer do it.
const RPC_URL = "https://rpc-bradbury.genlayer.com";

/**
 * Wrap an EIP-1193 wallet provider (e.g. Privy) to fix a transport bug:
 *
 * GenLayer's node rejects any JSON-RPC request whose `id` is a string with
 * "cannot unmarshal string into Request.id of type int". Some embedded wallets
 * (Privy) broadcast `eth_sendTransaction` through their own JSON-RPC layer using
 * string/uuid ids, which the node refuses — so signed transactions never land.
 *
 * Fix: intercept `eth_sendTransaction`. Ask the wallet to only SIGN the
 * (fully-formed) transaction via `eth_signTransaction`, then broadcast the raw
 * signed tx ourselves via `eth_sendRawTransaction` with an integer id. Every
 * other method (chain id, message signing, accounts) passes straight through.
 *
 * Wallets that don't support `eth_signTransaction` (e.g. MetaMask, which already
 * uses integer ids) transparently fall back to their own broadcast.
 */
function wrapProviderForGenLayer(provider: any) {
  return {
    ...provider,
    async request(args: { method: string; params?: any[] }) {
      const method = args?.method;
      if (method !== "eth_sendTransaction") {
        return provider.request(args);
      }
      try {
        const signed = await provider.request({ method: "eth_signTransaction", params: args.params ?? [] });
        const raw =
          typeof signed === "string"
            ? signed
            : signed?.raw ?? signed?.rawTransaction ?? signed?.serialized ?? signed?.signedTransaction;
        if (typeof raw !== "string" || !raw.startsWith("0x")) {
          // Unexpected shape — let the wallet broadcast as a last resort.
          return provider.request(args);
        }
        const res = await fetch(RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "eth_sendRawTransaction", params: [raw] }),
        });
        const data = await res.json();
        if (data?.error) throw data.error;
        return data.result;
      } catch (e: any) {
        const msg = String(e?.message ?? e?.data ?? "").toLowerCase();
        // Only fall back when the wallet can't sign-only; otherwise surface the real error.
        if (
          msg.includes("eth_signtransaction") ||
          msg.includes("not support") ||
          msg.includes("unsupported") ||
          msg.includes("method not found") ||
          msg.includes("not available")
        ) {
          return provider.request(args);
        }
        throw e;
      }
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
    provider: wrapProviderForGenLayer(provider),
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
